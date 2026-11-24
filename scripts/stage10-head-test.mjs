// ===========================================================================
// Stage 10, round two -- the <head> a job page is served with.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage10-head-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t10head.mjs && node /tmp/t10head.mjs
//
// WHY THIS IS THE MOST IMPORTANT TEST IN THE STAGE
//   Every other page on this site is built by React, which escapes
//   everything written into it. api/job-page.js builds HTML by joining
//   strings, and the values it joins are text a recruiter typed into a form.
//
//   So this file attacks it. A job title is tried as an attribute breakout,
//   as an element breakout, as a </title> and a </script>, and the output is
//   then CHECKED FOR THE ABSENCE of any unescaped "<" outside the tags the
//   builder meant to emit -- rather than merely checked for the presence of
//   an entity somewhere.
//
//   The JSON-LD is re-parsed after escaping, so "valid JSON" is proved by
//   parsing it rather than by eyeballing it.
// ===========================================================================

import { readFileSync } from "node:fs";
import {
  escapeHtml,
  metaDescription,
  pageTitle,
  buildJobPageHead,
  injectHead,
  isAppShell,
  NOT_OUR_SHELL_MARKERS,
  META_DESCRIPTION_MAX,
} from "../src/lib/jobPageHead.js";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else
    failures.push(
      `${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
}

const checkTrue = (name, actual) => check(name, actual, true);
const checkFalse = (name, actual) => check(name, actual, false);

// A complete, markup-eligible role.
function job(overrides = {}) {
  return {
    id: 13,
    title: "Senior SAP FICO Consultant",
    slug: "senior-sap-fico-consultant",
    description:
      "You will own the finance close for two European entities.\n\n" +
      "Reporting to the Controller, with a team of four.",
    city: "Pune",
    work_mode: "hybrid",
    employment_type: "full_time",
    experience_min: 6,
    published_at: "2026-11-20T09:00:00Z",
    expires_at: "2026-12-20T09:00:00Z",
    ...overrides,
  };
}

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>iWorkAtGCC</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

// ---------------------------------------------------------------------------
// 1. escapeHtml -- all five characters, in the right order
// ---------------------------------------------------------------------------

check("ampersand", escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
check("less than", escapeHtml("a < b"), "a &lt; b");
check("greater than", escapeHtml("a > b"), "a &gt; b");
check("double quote", escapeHtml('say "hi"'), "say &quot;hi&quot;");
check("single quote", escapeHtml("it's"), "it&#39;s");

// & MUST be escaped first, or the entities produced below it get mangled.
// This is the test that catches the wrong order: with & last, "<" becomes
// "&lt;" and then the & in "&lt;" becomes "&amp;lt;".
check("ampersand is escaped first, not last", escapeHtml("<"), "&lt;");
check("an entity in the source is escaped once", escapeHtml("&amp;"), "&amp;amp;");
check("a mix, in order", escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");

for (const [label, value] of [
  ["null", null],
  ["undefined", undefined],
  ["a number", 42],
  ["an object", {}],
  ["an array", []],
]) {
  check(`${label} escapes to an empty string`, escapeHtml(value), "");
}

// ---------------------------------------------------------------------------
// 2. metaDescription
// ---------------------------------------------------------------------------

check("newlines are collapsed",
  metaDescription("one\n\ntwo\nthree"), "one two three");
check("whitespace is collapsed and trimmed",
  metaDescription("   a    b   "), "a b");
check("a short description is untouched",
  metaDescription("Short and sweet."), "Short and sweet.");

const long = "word ".repeat(100).trim();
const cut = metaDescription(long);
checkTrue("a long description is cut to the limit", cut.length <= META_DESCRIPTION_MAX);
checkTrue("a cut description ends with an ellipsis", cut.endsWith("…"));
// Cutting at a word boundary legitimately leaves a letter before the
// ellipsis, so "does it end in a letter" proves nothing. The real property
// is that the text before the ellipsis is a WHOLE-WORD PREFIX of the
// original: it appears at the start of it, and what follows in the original
// is a space rather than the rest of a chopped word.
const body = cut.slice(0, -1);
checkTrue("a cut description is a prefix of the original", long.startsWith(body));
checkTrue("...cut at a word boundary", long[body.length] === " ");
checkFalse("a cut description has no trailing space before the ellipsis", / …$/.test(cut));

// One unbroken token longer than the limit has no space to cut at. It must
// still come back inside the limit rather than whole.
const unbroken = "x".repeat(500);
checkTrue("an unbroken run is still cut to the limit",
  metaDescription(unbroken).length <= META_DESCRIPTION_MAX);

for (const [label, value] of [["null", null], ["undefined", undefined], ["a number", 7]]) {
  check(`${label} gives an empty description`, metaDescription(value), "");
}

// ---------------------------------------------------------------------------
// 3. pageTitle
// ---------------------------------------------------------------------------

check("title with a company",
  pageTitle(job(), "Acme GCC"), "Senior SAP FICO Consultant at Acme GCC — iWorkAtGCC");
check("title without a company",
  pageTitle(job(), ""), "Senior SAP FICO Consultant — iWorkAtGCC");
check("a whitespace company is treated as none",
  pageTitle(job(), "   "), "Senior SAP FICO Consultant — iWorkAtGCC");
check("no title at all falls back to the site name",
  pageTitle({ title: "   " }, "Acme"), "iWorkAtGCC");
check("no job at all falls back to the site name", pageTitle(null, "Acme"), "iWorkAtGCC");

// ---------------------------------------------------------------------------
// 4. THE ATTACKS. A recruiter's title, trying to escape the head.
// ---------------------------------------------------------------------------

const ATTACKS = [
  ['attribute breakout', 'Analyst" onload="alert(1)'],
  ['element breakout', "Analyst<script>alert(1)</script>"],
  ['closing the title', "Analyst</title><script>alert(1)</script>"],
  ['closing the ld+json script', "Analyst</script><img src=x onerror=alert(1)>"],
  ['single-quoted attribute breakout', "Analyst' onload='alert(1)"],
  ['a comment escape', "Analyst--><script>alert(1)</script><!--"],
  ['an entity', "Analyst &lt;script&gt;"],
];

for (const [label, title] of ATTACKS) {
  const head = buildJobPageHead({
    job: job({ title, description: `A real description. ${title}` }),
    company: title,
    canonicalUrl: `https://www.iworkatgcc.com/gcc-jobs/x-13`,
    indexable: true,
  });

  // The ONLY "<" characters allowed are the ones that open the tags the
  // builder itself emits. Anything else means a value escaped its context.
  // The ld+json element is removed CONTENTS AND ALL, then tested separately
  // by parsing it below. Its body legitimately contains ">" -- the <p> and
  // <br> tags descriptionToHtml produces come through as "\u003cp>", because
  // only "<" needs escaping to stop an element closing early. Leaving the
  // body in would make this assertion fail on correct output.
  const stripped = head
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
    .replace(/<\/?title>/g, "")
    .replace(/<meta [^<>]*>/g, "")
    .replace(/<link [^<>]*>/g, "");

  checkFalse(`${label}: no stray "<" survives in the head`, stripped.includes("<"));
  checkFalse(`${label}: no stray ">" survives in the head`, stripped.includes(">"));
  checkFalse(`${label}: the title element is not closed early`,
    /<title>[^<]*<\/title>[\s\S]*<\/title>/.test(head));
  checkFalse(`${label}: no executable script tag appears`,
    /<script(?! type="application\/ld\+json">)/.test(head));

  // The JSON-LD must still be JSON after all that.
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head);
  checkTrue(`${label}: the markup is present`, Boolean(match));
  if (match) {
    let parsed = null;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      parsed = null;
    }
    checkTrue(`${label}: the markup re-parses as JSON`, parsed !== null);
    if (parsed) {
      check(`${label}: the title survives intact inside the JSON`, parsed.title, title);
      check(`${label}: the type is JobPosting`, parsed["@type"], "JobPosting");
    }
  }
}

// ---------------------------------------------------------------------------
// 5. indexable, and the rule that the two go together
// ---------------------------------------------------------------------------

const indexed = buildJobPageHead({
  job: job(),
  company: "Acme GCC",
  canonicalUrl: "https://www.iworkatgcc.com/gcc-jobs/x-13",
  indexable: true,
});
const withheld = buildJobPageHead({
  job: job(),
  company: "Acme GCC",
  canonicalUrl: "https://www.iworkatgcc.com/gcc-jobs/x-13",
  indexable: false,
});

checkTrue("an indexable page says index, follow", indexed.includes('content="index, follow"'));
checkTrue("an indexable page carries the markup",
  indexed.includes('application/ld+json'));

checkTrue("a withheld page says noindex, nofollow",
  withheld.includes('content="noindex, nofollow"'));
// THE RULE: the markup is what asks Google to list a job, so a page that is
// not for Google must not carry it.
checkFalse("a withheld page carries NO markup", withheld.includes("application/ld+json"));

// An ineligible role emits no markup even when the page is indexable, because
// buildJobPosting() refuses rather than emit something incomplete.
const ineligible = buildJobPageHead({
  job: job({ description: "" }),
  company: "Acme GCC",
  canonicalUrl: "https://www.iworkatgcc.com/gcc-jobs/x-13",
  indexable: true,
});
checkFalse("a role with no description emits no markup",
  ineligible.includes("application/ld+json"));
checkTrue("...but still emits a head", ineligible.includes("<title>"));

// ---------------------------------------------------------------------------
// 6. injectHead
// ---------------------------------------------------------------------------

const injected = injectHead(SHELL, indexed);
checkTrue("the head is injected", injected.includes("application/ld+json"));
checkTrue("it goes before </head>",
  injected.indexOf("application/ld+json") < injected.indexOf("</head>"));
checkTrue("the body is untouched", injected.includes('<div id="root"></div>'));
check("there is still exactly one </head>", injected.split("</head>").length - 1, 1);
check("the shell's own doctype survives", injected.startsWith("<!doctype html>"), true);

// Case-insensitive, because a shell is generated by a bundler and its case
// is not ours to assume.
checkTrue("an uppercase </HEAD> is found",
  (injectHead("<html><HEAD></HEAD><body></body></html>", indexed) || "").includes("application/ld+json"));

// Returns null rather than a mangled document. The caller then serves the
// shell untouched: a page with no markup works; a page with a <title> in its
// <body> does not.
check("no </head> returns null", injectHead("<html><body></body></html>", indexed), null);
check("an empty shell returns null", injectHead("", indexed), null);
check("a null shell returns null", injectHead(null, indexed), null);
check("an empty head returns null", injectHead(SHELL, ""), null);
check("a null head returns null", injectHead(SHELL, null), null);

// ---------------------------------------------------------------------------
// 7. isAppShell -- THE REGRESSION TEST FOR A REAL INCIDENT
//
// api/job-page.js used to fetch the shell over HTTP and trust it if the
// response was ok. On a preview with Vercel's deployment protection on, the
// fetch was intercepted and answered with VERCEL'S LOGIN PAGE: valid HTML,
// status 200. It was injected into and served, and the browser showed a blank
// page with 70 MIME-type errors.
//
// The document below is built from the markers Rishi read out of View Source
// on the page that was actually served. This is not a hypothetical.
// ---------------------------------------------------------------------------

// The REAL shell, read off disk rather than written as a fixture -- so this
// test fails if the build ever stops producing something the function can
// identify, which is the failure that matters.
// Resolved from the working directory, NOT from import.meta.url: esbuild
// bundles this file somewhere else before node runs it, which moves
// import.meta.url with it. Every test in this project documents "run it from
// the repo root", and this is the line that depends on it.
let realShell = null;
try {
  realShell = readFileSync(`${process.cwd()}/dist/app.html`, "utf8");
} catch {
  realShell = null;
}

checkTrue("dist/app.html exists to test against (npm run build, from the repo root)",
  realShell !== null);
if (realShell) {
  checkTrue("THE REAL BUILT SHELL IS ACCEPTED", isAppShell(realShell));
}

// Vercel's deployment-protection page, from the markers in View Source.
const VERCEL_PROTECTION_PAGE = `<!DOCTYPE html>
<html lang="en" data-dpl-id="dpl_2pfh63eC3yPnKdmeRGgHS3stomBy">
  <head>
    <meta charset="utf-8"/>
    <title>Authentication Required</title>
    <script src="/_next/static/immutable/chunks/0c0hxoamwjsbw.js"></script>
  </head>
  <body>
    <a data-testid="geistcn/skip-nav-link" href="#main">Skip to content</a>
    <div id="__next"><p>Log in to continue</p></div>
  </body>
</html>`;

checkFalse("VERCEL'S PROTECTION PAGE IS REFUSED", isAppShell(VERCEL_PROTECTION_PAGE));

// THE ASSERTION THAT MATTERS MOST. Strip every marker on the rejected list
// and it must STILL be refused -- by the positive checks alone. A guard that
// only works because it recognises this one page would not survive the next
// unexpected document, which was Rishi's actual point.
let declawed = VERCEL_PROTECTION_PAGE;
for (const marker of NOT_OUR_SHELL_MARKERS) {
  declawed = declawed.split(marker).join("harmless-");
}
checkFalse("...and still refused with every blocklist marker removed",
  isAppShell(declawed));
checkFalse("the blocklist really was neutralised in that copy",
  NOT_OUR_SHELL_MARKERS.some((m) => declawed.toLowerCase().includes(m)));

// Each required marker, removed one at a time from a shell that is otherwise
// valid. All three are load-bearing or one of these passes.
const GOOD = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-x08IFQC6.js"></script>
  </head><body><div id="root"></div></body></html>`;

checkTrue("the minimal good shell is accepted", isAppShell(GOOD));
checkFalse("without <div id=\"root\"> it is refused",
  isAppShell(GOOD.replace('<div id="root"></div>', "<div></div>")));
checkFalse("without the hashed /assets/ bundle it is refused",
  isAppShell(GOOD.replace(/<script[^>]*><\/script>/, "")));
checkFalse("without a </head> it is refused",
  isAppShell(GOOD.replace("</head>", "")));

// A Vite shell for a DIFFERENT project would be accepted, and that is fine:
// the function only ever reads its own deployment's filesystem, so the
// question this answers is "is this our kind of document", not "which site".
// What it must never accept is a document with no React mount point at all.
for (const [label, value] of [
  ["an empty string", ""],
  ["null", null],
  ["undefined", undefined],
  ["a number", 42],
  ["an object", {}],
  ["a short string", "<html></html>"],
  ["a JSON error body", '{"error":"Unauthorized"}'],
  ["plain text", "Authentication Required"],
  ["an HTML fragment with no head", '<div id="root"></div>'],
]) {
  checkFalse(`${label} is refused`, isAppShell(value));
}

// ---------------------------------------------------------------------------

console.log(`\nStage 10 head test: ${passed} passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log("\nFAILURES:\n");
  for (const f of failures) console.log(`  ${f}\n`);
  process.exit(1);
}

console.log("All good.\n");
