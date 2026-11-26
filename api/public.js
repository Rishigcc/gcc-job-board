import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildJobPageHead,
  injectHead,
  isAppShell,
} from "../src/lib/jobPageHead.js";
import { jobPath, parseJobParam } from "../src/lib/jobDisplay.js";

// ===========================================================================
// The two PUBLIC pages that have to be assembled per request.
//
//   ?page=job&slugId=...   /gcc-jobs/<slug>-<id>   the job page, with markup
//   ?page=sitemap-jobs     /sitemap-jobs.xml       every live role
//
// NEITHER PATH IS VISIBLE TO A VISITOR. vercel.json rewrites the real URLs
// onto this one function with a `page` parameter, so nothing about the
// consolidation leaks into a URL anyone sees or that Google indexes.
//
// WHY THEY SHARE A FILE
//   Vercel's Hobby plan allows 12 serverless functions and the project
//   reached 14. Rishi, 25 Nov 2026: "I'm not upgrading to Pro. Consolidate."
//   These two were paired because they are the only public, unauthenticated
//   GET endpoints, both read with the publishable key, and both already
//   arrive through a rewrite -- so merging them changed two config lines and
//   no client code at all.
//
// *** THE includeFiles KEY IN vercel.json IS NAMED AFTER THIS FILE ***
//   It was `api/job-page.js`. It is now `api/public.js`. That key is what
//   puts dist/app.html on the function's filesystem, and the job page is
//   assembled by reading it. Re-key it wrong and loadShell() finds nothing,
//   every /gcc-jobs/<role> answers 503, and NOTHING ELSE on the site looks
//   wrong -- which is why it is called out here and why
//   scripts/check-overflow.mjs loads a job page through the real rewrite.
// ===========================================================================


// ===========================================================================
// GET /gcc-jobs/:slugId   ->   the app shell, with this role's <head> in it
//
// Rewritten here by vercel.json, AHEAD of the catch-all that sends everything
// else to /app.html.
//
// WHY A FUNCTION AND NOT PRERENDERING
//   Job pages are unbounded and short-lived. A role posted at 3pm has to be
//   servable at 3:01pm, and the build that writes the other 87 pages runs
//   once a night. So this page is assembled per request.
//
// THE SHELL IS READ OFF DISK. IT USED TO BE FETCHED, AND THAT WAS WRONG.
//
//   The first version fetched /app.html over HTTP from the deployment's own
//   host and trusted it if the response was ok. On a preview with Vercel's
//   deployment protection on, that fetch was intercepted and answered with
//   VERCEL'S LOGIN PAGE -- valid HTML, status 200 -- which was then injected
//   into and served. The browser got a blank page and 70 MIME-type errors,
//   because the document referenced /_next/ chunks that do not exist here.
//
//   Rishi's instruction, 24 Nov 2026: "If the approach has to change, say so
//   plainly rather than working around protection -- I'd rather rebuild this
//   than ship something that only works because production happens not to
//   have protection on."
//
//   So THERE IS NO REQUEST-TIME NETWORK CALL FOR THE SHELL any more. It is
//   read from the deployment's own filesystem, included by the `functions`
//   block in vercel.json. Nothing can intercept a file read.
//
//   And separately -- because the two faults were separate -- the shell is
//   now IDENTIFIED rather than merely received. isAppShell() looks for our
//   own mount point and our own hashed bundle, both of which Vercel's page
//   lacked. That check is what makes this class of bug impossible whatever
//   the shell's source, which was Rishi's first point and the more important
//   one: "If that internal fetch ever returns anything unexpected in
//   production, this function will inject into it and serve it to
//   candidates."
//
//   AND THERE IS NO FETCH FALLBACK, deliberately. One would be safe now --
//   isAppShell() would refuse the protection page whatever delivered it --
//   but it would also mean a protected preview quietly behaves differently
//   from production, which is the thing Rishi asked not to ship. A clean 503
//   he can report beats a difference nobody notices.
//
//   IF THE SHELL CANNOT BE IDENTIFIED, THIS SERVES NOTHING. A job page that
//   does not load is a bad day. A job page that loads as somebody else's
//   document is the thing worth refusing.
//
// WHY THE MARKUP IS NOT RENDERED BY REACT INSTEAD
//   It could be -- src/components/Seo.jsx already takes a jsonLd prop and
//   escapes it the same way. But it would put a time-sensitive listing
//   behind a rendering queue we cannot see, and the markup would be absent
//   from the page source, which is where every other crawler and every
//   debugging tool looks. Seo's jsonLd prop is deliberately NOT used on this
//   page: two JobPosting objects on one page is worse than none, because
//   Google's rule is one job per page.
//
// THE TWO STATUS CODES, AND WHY A 404 STILL SERVES A WORKING PAGE
//   A role that is not public gets 404 -- which is how Google drops a listing
//   that has closed. But the 404 is served WITH THE APP SHELL AS ITS BODY,
//   so a browser renders it normally: React boots, fetches the role with
//   whoever's session is in the browser, and a recruiter still sees their own
//   closed or pending posting exactly as before. The status code is for
//   crawlers; the body is for people.
//
//   That matters because the recruiter preview is signed-off stage 4
//   behaviour: src/lib/publicJobs.js calls it "a preview, not a leak".
//
// THE CLIENT IS THE PUBLISHABLE KEY, DELIBERATELY
//   Not the service key. This endpoint must see exactly what a stranger
//   sees, and the "anyone reads public jobs" policy already applies
//   private.job_is_public() -- status, expiry AND recruiter suspension. Using
//   the service key here would mean re-deciding in JavaScript what the
//   database already decides, and the copy that drifts is always the one
//   nobody is looking at.
// ===========================================================================

const SITE_URL = "https://www.iworkatgcc.com";

// Everything the markup and the head need, and nothing else. No posted_by:
// this response is public, and the server has no reason to hold it.
const COLUMNS =
  "id, title, slug, description, city, work_mode, employment_type, " +
  "experience_min, salary_min, salary_max, salary_currency, salary_period, " +
  "openings, skills, published_at, expires_at, companies(name)";

// Where dist/app.html can be, in order. The first is what vercel.json's
// includeFiles produces; the rest cover running from the repo root and from
// the function's own directory, so `vercel dev` and a local script find it
// too. A list rather than one path because the cost of an extra miss is a
// few microseconds and the cost of guessing wrong is the whole feature.
const HERE = path.dirname(fileURLToPath(import.meta.url));

const SHELL_PATHS = [
  path.join(process.cwd(), "dist", "app.html"),
  path.join(process.cwd(), "app.html"),
  path.join(HERE, "..", "dist", "app.html"),
];

// The shell is identical for every request and changes only on deploy, so a
// warm container reads it once. Only an IDENTIFIED shell is ever cached: an
// unidentified one must be re-read next time rather than remembered.
let shellCache = null;

async function loadShell() {
  if (shellCache) return shellCache;

  const tried = [];

  for (const candidate of SHELL_PATHS) {
    let html;
    try {
      html = await readFile(candidate, "utf8");
    } catch {
      tried.push(`${candidate} (not readable)`);
      continue;
    }

    if (!isAppShell(html)) {
      // Found a file, and it is not ours. Worth saying loudly in the log,
      // because this is the exact shape of the bug that got here: a document
      // that exists and is wrong.
      tried.push(`${candidate} (found, but not our shell)`);
      continue;
    }

    shellCache = html;
    return shellCache;
  }

  throw new Error(`No app shell could be identified. Tried: ${tried.join("; ")}`);
}

function send(res, { status, body, cache }) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.status(status).send(body);
}

async function jobPage(req, res) {
  const slugId = String(req.query?.slugId || "");

  let shell;
  try {
    shell = await loadShell();
  } catch (error) {
    // Deliberately not a 404: this is our failure, and must not be read by
    // a crawler as "the role is gone". Deliberately not a half-built page
    // either -- see the header.
    console.error("[job-page]", error.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("The page could not be assembled.");
  }

  // A page that is not for Google: no markup, noindex, and the shell still
  // boots so a human sees whatever their own session can see.
  const withheld = (status) => {
    const head = buildJobPageHead({
      job: { title: "This role is no longer open" },
      company: "",
      canonicalUrl: `${SITE_URL}/gcc-jobs`,
      indexable: false,
    });

    send(res, {
      status,
      body: injectHead(shell, head) || shell,
      // Short, because a role becomes public the moment it is posted and a
      // cached 404 would outlive the reason for it.
      cache: "public, max-age=0, s-maxage=60",
    });
  };

  const { id } = parseJobParam(slugId);
  if (!id) return withheld(404);

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("[job-page] Supabase environment variables are missing.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("The page could not be assembled.");
  }

  const supabase = createClient(url, key);

  const { data: job, error } = await supabase
    .from("jobs")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  // A DATABASE BLIP MUST NOT 404 A LIVE ROLE. Google treats a 404 as "gone",
  // and getting a listing back afterwards is slow and not in our hands. So on
  // an error the shell is served untouched, uncached, with no robots meta of
  // our own -- the page still works, React fetches the role itself, and
  // nothing has told Google anything.
  if (error) {
    console.error("[job-page] jobs query failed:", error.message);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(shell);
  }

  if (!job) return withheld(404);

  // One URL per role. The slug in an old link goes stale the moment a
  // recruiter edits the title, and the client already corrects it with a
  // <Navigate replace> -- but a 301 settles it before the page is built, so
  // Google is never offered two addresses for one job.
  const canonicalPath = jobPath(job);
  if (`/gcc-jobs/${slugId}` !== canonicalPath) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.setHeader("Location", canonicalPath);
    return res.status(301).end();
  }

  const head = buildJobPageHead({
    job,
    company: job.companies?.name || "",
    canonicalUrl: `${SITE_URL}${canonicalPath}`,
    indexable: true,
  });

  send(res, {
    status: 200,
    body: injectHead(shell, head) || shell,
    // s-maxage so the CDN answers crawlers without touching Supabase;
    // stale-while-revalidate so an expiring role is refreshed in the
    // background rather than making a visitor wait for it.
    cache: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
  });
}



// ===========================================================================
// GET /sitemap-jobs.xml   ->   every role a stranger can see, and nothing else
//
// SEPARATE FROM sitemap.xml ON PURPOSE. That one is written by
// scripts/prerender.mjs at build time and lists 87 pages that change rarely.
// Roles appear and expire between builds, so they cannot live in a file
// written once a night -- a role posted at 3pm would be absent from the
// sitemap until 2am.
//
// Both are declared in public/robots.txt. Google accepts several Sitemap
// lines; a sitemap index would be the alternative and buys nothing at two
// sitemaps.
//
// THE PUBLISHABLE KEY, SO THE LIST IS THE PUBLIC LIST. The "anyone reads
// public jobs" policy applies private.job_is_public() -- status, expiry and
// recruiter suspension -- so a closed, hidden or expired role falls out of
// this file by itself. A sitemap that lists a URL which answers 404 is a
// sitemap Google learns to distrust, and that is exactly what filtering by
// hand here would eventually produce.
// ===========================================================================

// Google's limit is 50,000 URLs per sitemap. This caps well below it: the
// cap exists so a runaway query cannot produce a 50MB response, not because
// 1,000 roles is a real ceiling. If the board ever approaches it, the answer
// is a sitemap index, and this comment is where to start.
const MAX_URLS = 1000;


function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function sitemapJobs(req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("Sitemap unavailable.");
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, slug, published_at")
    .order("published_at", { ascending: false })
    .limit(MAX_URLS);

  if (error) {
    // An empty sitemap would tell Google every role had gone. A 503 tells it
    // to come back, which is the truth.
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("Sitemap unavailable.");
  }

  const entries = (data || []).map((job) => {
    const lastmod = job.published_at
      ? new Date(job.published_at).toISOString().slice(0, 10)
      : null;

    return [
      "  <url>",
      `    <loc>${escapeXml(`${SITE_URL}${jobPath(job)}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      "    <changefreq>daily</changefreq>",
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(xml);
}


// ===========================================================================
// The dispatcher. `page` comes from the rewrite, never from a visitor.
//
// An unknown or missing value is a 404 rather than a default: a rewrite that
// stops passing the parameter should break loudly and immediately, not
// silently serve job pages as sitemaps or the reverse.
// ===========================================================================
export default async function handler(req, res) {
  switch (req.query?.page) {
    case "job":
      return jobPage(req, res);
    case "sitemap-jobs":
      return sitemapJobs(req, res);
    default:
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).send("Not found.");
  }
}
