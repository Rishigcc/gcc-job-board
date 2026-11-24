import { createClient } from "@supabase/supabase-js";
import { jobPath } from "../src/lib/jobDisplay.js";

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

const SITE_URL = "https://www.iworkatgcc.com";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(req, res) {
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
