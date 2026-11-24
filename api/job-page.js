import { createClient } from "@supabase/supabase-js";
import { buildJobPageHead, injectHead } from "../src/lib/jobPageHead.js";
import { jobPath, parseJobParam } from "../src/lib/jobDisplay.js";

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
// WHY THE MARKUP IS NOT RENDERED BY REACT INSTEAD
//   It could be -- src/components/Seo.jsx already takes a jsonLd prop and
//   escapes it the same way. Googlebot does run JavaScript. But it would put
//   a time-sensitive listing behind a rendering queue we cannot see, and it
//   would mean the markup is absent from the page source, which is the one
//   place every other crawler and every debugging tool looks. Seo's jsonLd
//   prop is deliberately NOT used on this page: two copies of a JobPosting
//   on one page is worse than none, because Google's rule is one job per
//   page.
//
// THE TWO STATUS CODES, AND WHY A 404 STILL SERVES A WORKING PAGE
//   A role that is not public gets 404 -- which is how Google drops a listing
//   that has closed. But the 404 is served WITH THE APP SHELL AS ITS BODY,
//   so a browser renders it normally: React boots, fetches the role with
//   whoever's session is in the browser, and a recruiter still sees their own
//   closed or pending posting exactly as before. The status code is for
//   crawlers; the body is for people. Nothing a human does changes.
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

// The shell is the same bytes for every request and changes only on deploy,
// so a warm container fetches it once. Fetched rather than read off disk
// because dist/app.html is static output, not part of this function's
// bundle -- and fetching it means the asset hashes always match the
// deployment actually serving the request.
let shellCache = null;

async function loadShell(req) {
  if (shellCache) return shellCache;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";

  const response = await fetch(`${proto}://${host}/app.html`);
  if (!response.ok) throw new Error(`app.html returned ${response.status}`);

  shellCache = await response.text();
  return shellCache;
}

function send(res, { status, body, cache }) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.status(status).send(body);
}

export default async function handler(req, res) {
  const slugId = String(req.query?.slugId || "");

  let shell;
  try {
    shell = await loadShell(req);
  } catch {
    // Without the shell there is no page to serve at all. 503 rather than
    // 404: this is our failure, and must not be read as "the role is gone".
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
