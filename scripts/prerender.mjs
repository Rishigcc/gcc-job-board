import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { preview, loadEnv } from "vite";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");
const SITE_URL = "https://www.iworkatgcc.com";
const CONCURRENCY = 3;
const NAV_TIMEOUT = 45000;

// Delay before each retry, so RETRY_DELAYS.length is also the retry count.
// A failed route is usually a transient upstream blip rather than a broken
// page — a single 504 on /rest/v1/questions failed an entire production
// deploy on 2026-09-13 — so the gap widens to outlast a blip lasting several
// seconds. Jitter keeps the CONCURRENCY workers from retrying in lockstep and
// compounding the load on a backend that is already struggling.
const RETRY_DELAYS = [2000, 5000];

// A page this script wrote stamps its managed head tags with this marker; the
// SPA shell served by the vercel.json rewrite never carries it, and always has
// an empty root div. Together they separate "production already serves a real
// page for this route" from "this route has never been prerendered".
const PRERENDERED_MARKER = 'data-prerendered="true"';
const EMPTY_ROOT = '<div id="root"></div>';
const CARRY_FORWARD_TIMEOUT = 15000;

// Past this share of routes a wave of failures is an outage rather than a
// blip, and publishing a mostly-stale site is worse than publishing nothing:
// a failed build leaves the previous deployment serving every page intact.
const MAX_STALE_SHARE = 0.25;

// QuestionDetail marks its fetch-error state with this attribute. Spotting it
// turns a route whose data failed from a full NAV_TIMEOUT stall into an
// immediate throw, which renderRouteWithRetry then retries seconds later.
const FETCH_ERROR_SELECTOR = "[data-fetch-error]";

// Mirrors the questions_slug_format CHECK constraint. Re-checked here so a slug
// predating the constraint — or written if it is ever dropped — can never escape
// DIST via path.join() or inject markup into the sitemap.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Analytics would otherwise record a phantom pageview per route on every
// scheduled rebuild.
const BLOCKED_HOSTS = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "clarity.ms",
  "doubleclick.net",
];

// These are injected by the Seo component at runtime. Marking them lets the
// client strip the baked-in copies on mount, so client-side navigation does
// not inherit stale metadata from whichever page was prerendered.
const MANAGED_HEAD_TAGS = [
  "title",
  'meta[name="description"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
].join(",");

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[prerender] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY."
  );
  process.exit(1);
}

async function fetchQuestions() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [{ data: questions, error }, { data: answers, error: answersError }] =
    await Promise.all([
      supabase.from("questions").select("id, slug, title, created_at"),
      supabase.from("answers").select("question_id"),
    ]);

  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  if (answersError)
    throw new Error(`Failed to load answers: ${answersError.message}`);

  const answerCounts = new Map();
  for (const answer of answers) {
    answerCounts.set(
      answer.question_id,
      (answerCounts.get(answer.question_id) || 0) + 1
    );
  }

  return questions
    .filter((q) => {
      if (SLUG_RE.test(q.slug || "")) return true;
      console.warn(`[prerender] skipping unsafe slug: ${JSON.stringify(q.slug)}`);
      return false;
    })
    .map((q) => ({
      slug: q.slug,
      title: q.title,
      createdAt: q.created_at,
      answerCount: answerCounts.get(q.id) || 0,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildRoutes(questions) {
  return [
    { path: "/", kind: "home", out: "index.html" },
    { path: "/jobs", kind: "jobs", out: "jobs/index.html" },
    { path: "/questions", kind: "questions", out: "questions/index.html" },
    ...questions.map((q) => ({
      path: `/questions/${q.slug}`,
      kind: "question",
      out: `questions/${q.slug}/index.html`,
      slug: q.slug,
      title: q.title,
      answerCount: q.answerCount,
    })),
  ];
}

const noLoadingCards = () =>
  !Array.from(document.querySelectorAll("h2")).some((h) =>
    h.textContent.trim().startsWith("Loading")
  );

// waitForFunction resolves on any truthy value, so predicates return a
// sentinel string instead of a boolean — "error" is truthy too and must not be
// read as success. Only the resolved value separates the two.
async function waitForOutcome(page, predicate, arg, options) {
  const handle = await page.waitForFunction(predicate, arg, options);

  if ((await handle.jsonValue()) === "error") {
    throw new Error("page rendered its fetch-error state — data did not load");
  }
}

async function waitForContent(page, route) {
  const options = { timeout: NAV_TIMEOUT };

  if (route.kind === "question") {
    // The question title and the answers heading together prove both Supabase
    // round-trips resolved, not just the first one.
    await waitForOutcome(
      page,
      ({ title, answerCount, errorSelector }) => {
        // Checked first: it is the one state that will never resolve on its
        // own, and it covers either round-trip failing.
        if (document.querySelector(errorSelector)) return "error";

        const h1 = document.querySelector("h1");
        if (!h1 || h1.textContent.trim() !== title) return false;

        const expected =
          answerCount === 1 ? "1 Answer" : `${answerCount} Answers`;
        const heading = Array.from(document.querySelectorAll("h2")).some(
          (h) => h.textContent.trim() === expected
        );
        return heading ? "ok" : false;
      },
      {
        title: route.title,
        answerCount: route.answerCount,
        errorSelector: FETCH_ERROR_SELECTOR,
      },
      options
    );
    return;
  }

  if (route.kind === "questions") {
    await page.waitForFunction(
      () => document.querySelectorAll('a[href^="/questions/"]').length > 0,
      undefined,
      options
    );
    return;
  }

  if (route.kind === "jobs") {
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("h2")).some((h) =>
          h.textContent.trim().startsWith("Loading")
        ) && document.querySelectorAll("h2").length > 0,
      undefined,
      options
    );
    return;
  }

  await page.waitForFunction(noLoadingCards, undefined, options);
}

async function renderRoute(context, baseUrl, route) {
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}${route.path}`, {
      waitUntil: "networkidle",
      timeout: NAV_TIMEOUT,
    });

    await waitForContent(page, route);

    await page.evaluate((selector) => {
      document.head
        .querySelectorAll(selector)
        .forEach((el) => el.setAttribute("data-prerendered", "true"));
    }, MANAGED_HEAD_TAGS);

    const html = await page.evaluate(
      () => `<!doctype html>\n${document.documentElement.outerHTML}`
    );

    return { route, html };
  } finally {
    await page.close();
  }
}

const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Every attempt goes through renderRoute(), which opens a fresh page and
// re-runs page.goto(), so the page's data fetches are re-issued. Retrying any
// deeper — re-waiting on the page that just failed — would only re-observe
// whatever state the failed fetch left behind: a not-found render never
// resolves into the title waitForContent() is looking for, so each attempt
// would stall for the full NAV_TIMEOUT and still fail.
async function renderRouteWithRetry(context, baseUrl, route) {
  let lastErr;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = jitter(RETRY_DELAYS[attempt - 1]);
      console.warn(
        `[prerender] retry ${attempt}/${RETRY_DELAYS.length} ${route.path} ` +
          `in ${(delay / 1000).toFixed(1)}s — ${lastErr.message}`
      );
      await sleep(delay);
    }

    try {
      return await renderRoute(context, baseUrl, route);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr;
}

// Returns the live HTML when production already serves a prerendered page for
// this route, or null when it serves the SPA shell (the route has never been
// prerendered, so omitting it regresses nothing). Throws when the answer
// cannot be established: an unreachable site must never read as "never
// prerendered", or a build container with no network would quietly drop every
// failed route at once instead of aborting.
async function fetchLivePage(route) {
  const url = `${SITE_URL}${route.path}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(CARRY_FORWARD_TIMEOUT),
  });

  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const html = await response.text();

  if (html.includes(EMPTY_ROOT) || !html.includes(PRERENDERED_MARKER)) {
    return null;
  }

  return html;
}

// `&` must be replaced first, or it would double-escape the entities below it.
function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemap(questions) {
  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    { loc: `${SITE_URL}/`, lastmod: today },
    { loc: `${SITE_URL}/jobs`, lastmod: today },
    { loc: `${SITE_URL}/questions`, lastmod: today },
    ...questions.map((q) => ({
      loc: `${SITE_URL}/questions/${q.slug}`,
      lastmod: new Date(q.createdAt).toISOString().slice(0, 10),
    })),
  ];

  const urls = entries
    .map(
      ({ loc, lastmod }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    )
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n${urls}\n\n</urlset>\n`;
}

// Vercel's build image is Amazon Linux and ships without Chromium's shared
// libraries, so Playwright's own download can't start there. @sparticuz's
// build bundles them. Locally we use whatever Playwright installed.
async function launchBrowser() {
  if (!process.env.VERCEL) {
    try {
      return await chromium.launch();
    } catch (err) {
      if (err.message.includes("Executable doesn't exist")) {
        throw new Error(
          "No local Chromium found. Run: npx playwright install chromium"
        );
      }
      throw err;
    }
  }

  const { default: bundled } = await import("@sparticuz/chromium");
  bundled.setGraphicsMode = false;

  return chromium.launch({
    args: bundled.args,
    executablePath: await bundled.executablePath(),
    headless: true,
  });
}

async function main() {
  const startedAt = Date.now();

  const questions = await fetchQuestions();
  console.log(`[prerender] ${questions.length} questions from Supabase`);

  const routes = buildRoutes(questions);

  // Preserve an un-prerendered shell for the SPA catch-all rewrite. Without
  // it, unmatched routes (a question posted since the last build) would be
  // served the prerendered homepage, including its canonical URL.
  await copyFile(path.join(DIST, "index.html"), path.join(DIST, "app.html"));

  const server = await preview({
    preview: { port: 4183, strictPort: true },
    logLevel: "warn",
  });
  const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, "");

  const browser = await launchBrowser();
  const context = await browser.newContext();

  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (BLOCKED_HOSTS.some((host) => url.includes(host))) return route.abort();
    return route.continue();
  });

  const results = [];
  const failures = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < routes.length) {
      const route = routes[cursor++];
      try {
        results.push(await renderRouteWithRetry(context, baseUrl, route));
        console.log(`[prerender] ok   ${route.path}`);
      } catch (err) {
        failures.push({ route, err });
        console.error(`[prerender] FAIL ${route.path} — ${err.message}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, routes.length) }, worker)
  );

  await browser.close();
  await server.close();

  // Triage every route that exhausted its retries against what production is
  // serving right now. Skipping a route does not leave its old page in place:
  // vite build empties DIST before this script runs, so an unwritten route
  // falls through the vercel.json rewrite to the SPA shell.
  const stale = [];
  const skipped = [];

  for (const { route, err } of failures) {
    let live;

    try {
      live = await fetchLivePage(route);
    } catch (fetchErr) {
      console.error(
        `\n[prerender] ${route.path} failed and production could not be ` +
          `checked (${fetchErr.message}) — aborting without writing.`
      );
      console.error(
        "[prerender] the previous deployment keeps serving every page."
      );
      process.exit(1);
    }

    if (live) stale.push({ route, html: live, err });
    else skipped.push({ route, err });
  }

  const maxStale = Math.floor(routes.length * MAX_STALE_SHARE);

  if (stale.length > maxStale) {
    console.error(
      `\n[prerender] ${stale.length} of ${routes.length} route(s) would be ` +
        `stale (limit ${maxStale}) — treating as an outage, aborting without writing.`
    );
    console.error(
      "[prerender] the previous deployment keeps serving every page."
    );
    process.exit(1);
  }

  for (const { route, html } of [...results, ...stale]) {
    const outPath = path.join(DIST, route.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf8");
  }

  // A skipped route serves the shell, so advertising it would point crawlers
  // at a contentless 200. Carried-forward routes keep their entry: they have
  // a real page, just an older one.
  const skippedSlugs = new Set(skipped.map(({ route }) => route.slug));
  const publishedQuestions = questions.filter((q) => !skippedSlugs.has(q.slug));

  await writeFile(
    path.join(DIST, "sitemap.xml"),
    buildSitemap(publishedQuestions),
    "utf8"
  );

  // Name every degraded route on every run, so a route that carries forward
  // night after night reads as chronic rather than disappearing into a count.
  if (stale.length > 0) {
    console.warn(
      `\n[prerender] ${stale.length} route(s) STALE — carried forward from production:`
    );
    for (const { route, err } of stale) {
      console.warn(`[prerender]   STALE ${route.path} — ${err.message}`);
    }
  }

  if (skipped.length > 0) {
    console.warn(
      `\n[prerender] ${skipped.length} route(s) skipped — never prerendered, ` +
        `omitted from sitemap:`
    );
    for (const { route, err } of skipped) {
      console.warn(`[prerender]   SKIP  ${route.path} — ${err.message}`);
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const breakdown =
    stale.length || skipped.length
      ? ` (${results.length} fresh, ${stale.length} stale, ${skipped.length} skipped)`
      : "";

  console.log(
    `\n[prerender] wrote ${results.length + stale.length} pages + ` +
      `sitemap.xml in ${seconds}s${breakdown}`
  );
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
