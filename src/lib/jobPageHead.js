// ===========================================================================
// The <head> block a job page is served with, as a string.
//
// WHY THIS IS A TESTED MODULE AND NOT A TEMPLATE LITERAL IN THE FUNCTION
//
// Every value in here is text a recruiter typed, and it is being written
// into HTML by string concatenation -- the one construction React has
// protected this entire project from until now. A job title containing a
// quote mark or a "<" has to come out as text in an attribute, in an
// element, and inside a JSON script, and those are three different escaping
// rules. So it lives here, pure, and scripts/stage10-head-test.mjs attacks
// it with the titles that would break each one.
//
// Pure: imports only jobPosting, which imports only jobOptions. That is what
// lets this run inside a Vercel function and inside plain Node.
// ===========================================================================

import { buildJobPosting, jobPostingScript } from "./jobPosting.js";
import { descriptionToText } from "./descriptionMarkdown.js";

// ---------------------------------------------------------------------------
// ESCAPING.
//
// One function for both attributes and text, escaping the union of what each
// needs. Two functions would mean two chances to pick the wrong one.
//
//   &  first, always, or it would double-escape the entities below it
//   <  so "</title>" and "</script>" cannot close an element early
//   >  for symmetry; harmless, and cheap insurance against odd parsers
//   "  so a value cannot end a double-quoted attribute
//   '  so a value cannot end a single-quoted attribute
// ---------------------------------------------------------------------------
export function escapeHtml(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// The meta description: one line, trimmed to length, never cut mid-word.
//
// Newlines are collapsed because a meta description containing a line break
// is not invalid, merely wrong -- and the description a recruiter typed is
// full of them.
// ---------------------------------------------------------------------------
export const META_DESCRIPTION_MAX = 160;

export function metaDescription(text, max = META_DESCRIPTION_MAX) {
  if (typeof text !== "string") return "";

  // CARRIED ITEM 27, 25 Nov 2026: the marks come off here regardless of what
  // the JSON-LD carries, because a meta description is plain text by
  // definition. Without this the rich result would be fixed while the grey
  // line under the blue link still opened with "#".
  //
  // It flattens the same parse the page and the markup use, so "**Bangalore**"
  // becomes "Bangalore" rather than losing the word with the asterisks.
  const flat = descriptionToText(text).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;

  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// The <title>, which is the one string a candidate reads in a search result.
export function pageTitle(job, company) {
  const title = typeof job?.title === "string" ? job.title.trim() : "";
  if (!title) return "iWorkAtGCC";

  const at = typeof company === "string" && company.trim()
    ? ` at ${company.trim()}`
    : "";

  return `${title}${at} — iWorkAtGCC`;
}

// ---------------------------------------------------------------------------
// The whole block.
//
// `indexable` is a decision made by the caller, not here. A role that is not
// public still gets a page -- its own recruiter is allowed to look at it --
// and that page says noindex and carries no markup. The two go together: the
// markup is what asks Google to list a job, so a page that is not for Google
// must not carry it.
// ---------------------------------------------------------------------------
export function buildJobPageHead({ job, company, canonicalUrl, indexable }) {
  const title = pageTitle(job, company);
  const description = metaDescription(job?.description);

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta name="robots" content="${indexable ? "index, follow" : "noindex, nofollow"}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  ];

  // The markup, and only when the page is for Google. buildJobPosting()
  // returns null for a role that cannot produce all five required
  // properties, and jobPostingScript() returns "" for null -- so an
  // incomplete role emits no script tag rather than a broken one.
  if (indexable) {
    const script = jobPostingScript(buildJobPosting(job, { company }));
    if (script) tags.push(script);
  }

  return tags.join("\n    ");
}

// ---------------------------------------------------------------------------
// Into the shell.
//
// Returns null rather than a mangled document if there is no </head> to
// insert before. The caller then serves the shell untouched: a page with no
// markup is a working page, and a page with a <title> in its <body> is not.
// ---------------------------------------------------------------------------
export function injectHead(shell, headHtml) {
  if (typeof shell !== "string" || !shell) return null;
  if (typeof headHtml !== "string" || !headHtml) return null;

  const match = /<\/head>/i.exec(shell);
  if (!match) return null;

  const at = match.index;

  return `${shell.slice(0, at)}    ${headHtml}\n  ${shell.slice(at)}`;
}

// ---------------------------------------------------------------------------
// IS THIS DOCUMENT OURS?
//
// WHY THIS EXISTS. The first version of the job page (then api/job-page.js, now
// api/public.js) fetched the app shell
// over HTTP from the deployment's own host and checked `response.ok`. On a
// preview with Vercel's deployment protection enabled, that fetch was
// intercepted and answered with Vercel's own LOGIN PAGE -- valid HTML, status
// 200 -- so the check passed, the markup was injected into a stranger's
// document, and the page served to the browser was blank with 70 MIME-type
// errors. Rishi found it and named the real fault: "'Did I get HTML back'
// isn't enough -- it got HTML."
//
// So identification is POSITIVE. The three required markers are things only
// our own Vite shell has:
//
//   <div id="root">            the mount point React boots into
//   /assets/index-*.js         the bundle, with the hash of THIS deployment
//   </head>                    somewhere to inject, which is the point
//
// Vercel's protection page has none of them, so the positive checks alone
// would have refused it. The rejected list below adds nothing to the
// security of this function -- it is there to name the incident, so that a
// future reader knows what was actually served and does not weaken the
// positive checks thinking they are theoretical.
//
// The caller must treat false as "serve nothing". Injecting into an
// unidentified document is the failure this prevents, and a page that does
// not load is better than a page that loads as someone else's.
// ---------------------------------------------------------------------------

// Markers seen in the document Vercel's deployment protection actually
// returned, 24 Nov 2026. Not the guard -- a record of the incident.
export const NOT_OUR_SHELL_MARKERS = [
  "_next/",            // Vercel's platform pages are Next.js apps
  "data-dpl-id",       // a Vercel deployment id attribute
  "geistcn/",          // Vercel's own design system
];

export function isAppShell(html) {
  if (typeof html !== "string" || html.length < 100) return false;

  // Positive identification. All three, or it is not ours.
  if (!/<div\s+id=["']root["']/i.test(html)) return false;
  if (!/<script[^>]+src=["']\/assets\/index-[^"']+\.js["']/i.test(html)) return false;
  if (!/<\/head>/i.test(html)) return false;

  // Belt, after braces.
  const lower = html.toLowerCase();
  if (NOT_OUR_SHELL_MARKERS.some((m) => lower.includes(m))) return false;

  return true;
}
