import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { preview, loadEnv } from "vite";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");
const SITE_URL = "https://www.iworkatgcc.com";
const CONCURRENCY = 3;
const NAV_TIMEOUT = 45000;

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
    .filter((q) => q.slug)
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
      title: q.title,
      answerCount: q.answerCount,
    })),
  ];
}

const noLoadingCards = () =>
  !Array.from(document.querySelectorAll("h2")).some((h) =>
    h.textContent.trim().startsWith("Loading")
  );

async function waitForContent(page, route) {
  const options = { timeout: NAV_TIMEOUT };

  if (route.kind === "question") {
    // The question title and the answers heading together prove both Supabase
    // round-trips resolved, not just the first one.
    await page.waitForFunction(
      ({ title, answerCount }) => {
        const h1 = document.querySelector("h1");
        if (!h1 || h1.textContent.trim() !== title) return false;

        const expected =
          answerCount === 1 ? "1 Answer" : `${answerCount} Answers`;
        return Array.from(document.querySelectorAll("h2")).some(
          (h) => h.textContent.trim() === expected
        );
      },
      { title: route.title, answerCount: route.answerCount },
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
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    )
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n${urls}\n\n</urlset>\n`;
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

  const browser = await chromium.launch();
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
        results.push(await renderRoute(context, baseUrl, route));
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

  if (failures.length > 0) {
    console.error(
      `\n[prerender] ${failures.length} route(s) failed — aborting without writing.`
    );
    process.exit(1);
  }

  for (const { route, html } of results) {
    const outPath = path.join(DIST, route.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf8");
  }

  await writeFile(
    path.join(DIST, "sitemap.xml"),
    buildSitemap(questions),
    "utf8"
  );

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n[prerender] wrote ${results.length} pages + sitemap.xml in ${seconds}s`
  );
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
