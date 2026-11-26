// ===========================================================================
// The board index is indexable, prerendered and listed -- all three.
//
// HOW TO RUN IT (from the repo root, no bundling needed):
//
//     node scripts/board-indexability-test.mjs
//
// WHY THIS SUITE EXISTS
//   /gcc-jobs went live on 26 Nov 2026 publicly reachable and simultaneously
//   telling Google to ignore it. Search Console reported it within the hour:
//   "Excluded by 'noindex' tag". Three things were wrong at once and all
//   three had the same cause -- a pre-stage-10 hold that was released on the
//   job DETAIL page on 24 Nov and never released on the board INDEX:
//
//     1. <Seo noindex> in src/Pages/GccJobs.jsx
//     2. no entry in buildRoutes(), so the page was served as a bare shell
//     3. no entry in STATIC_SITEMAP_PATHS, so it was in neither sitemap
//
//   Each of the three is individually invisible. A noindex is a meta tag
//   nobody reads; an un-prerendered page looks perfect in a browser because
//   the browser runs the JavaScript a crawler does not; a missing sitemap
//   entry is an absence. Together they made the board unfindable in a way
//   that no page of the site could show you.
//
// WHAT IT DELIBERATELY ASSERTS ABOUT ABSENCE
//   Two of the three faults were things NOT present. A suite that only
//   asserts presence cannot catch them coming back, so this asserts both
//   directions, and the noindex check reads the file WITH COMMENTS STRIPPED
//   -- the header of GccJobs.jsx now discusses the word "noindex" at length,
//   and a check that searched the raw text would pass on the comment while
//   the prop sat two lines below it.
// ===========================================================================

import { readFileSync } from "node:fs";

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

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Strips // line comments and {/* ... */} JSX comments. The same technique the
// send-digest.js diff used to prove a change was comments only -- here it is
// used the other way round, to prove a word appears ONLY in a comment.
function stripComments(source) {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const gccJobs = read("src/Pages/GccJobs.jsx");
const gccJobsCode = stripComments(gccJobs);
const mainJsx = read("src/main.jsx");
const mainCode = stripComments(mainJsx);
const prerender = read("scripts/prerender.mjs");

// ---------------------------------------------------------------------------
// 1. THE PAGE IS INDEXABLE
// ---------------------------------------------------------------------------

checkFalse(
  "GccJobs.jsx passes no noindex prop (comments stripped)",
  /\bnoindex\b/.test(gccJobsCode)
);
checkTrue(
  "the word survives in the header, so the history is still readable",
  /\bnoindex\b/.test(gccJobs)
);
checkTrue("it still declares its path to <Seo>", gccJobsCode.includes('path="/gcc-jobs"'));
checkTrue("and still has a Seo element at all", /<Seo\b/.test(gccJobsCode));

// The detail page's noindex was removed on 24 Nov. Assert it stayed removed,
// because the two pages are a pair and fixing one while the other regresses
// reproduces exactly the asymmetry this suite exists for.
checkFalse(
  "GccJobDetail.jsx passes no noindex prop either",
  /\bnoindex\b/.test(stripComments(read("src/Pages/GccJobDetail.jsx")))
);

// ---------------------------------------------------------------------------
// 2. THE PAGE PUBLISHES ITS OWN READINESS
//
// Not a timer, and not networkidle: the roles arrive in an effect after
// hydration. /jobs already solved this with data-board-promo.
// ---------------------------------------------------------------------------

checkTrue(
  "GccJobs.jsx publishes data-board-list",
  /data-board-list=\{/.test(gccJobsCode)
);
checkTrue(
  "it is derived from loading, not from a separate piece of state",
  /data-board-list=\{\s*loading\s*\?/.test(gccJobsCode)
);
checkTrue('it can say "pending"', /data-board-list=\{[^}]*"pending"/.test(gccJobsCode));
checkTrue('it can say "ready"', /data-board-list=\{[^}]*"ready"/.test(gccJobsCode));
checkTrue(
  "and it publishes data-fetch-error so a failed fetch is not saved as content",
  /data-fetch-error/.test(gccJobsCode)
);

// ---------------------------------------------------------------------------
// 3. THE PRERENDERER RENDERS IT, AND WAITS FOR THE RIGHT THING
// ---------------------------------------------------------------------------

checkTrue(
  "buildRoutes includes /gcc-jobs",
  /\{\s*path:\s*"\/gcc-jobs",[^}]*\}/.test(prerender)
);
checkTrue(
  "with its own kind rather than reusing static",
  /path:\s*"\/gcc-jobs",\s*kind:\s*"gccJobs"/.test(prerender)
);
checkTrue(
  "it writes to gcc-jobs/index.html",
  /path:\s*"\/gcc-jobs",[^}]*out:\s*"gcc-jobs\/index\.html"/.test(prerender)
);
checkTrue(
  "waitForContent has a gccJobs branch",
  /route\.kind === "gccJobs"/.test(prerender)
);

// The branch must use waitForOutcome, not waitForFunction. waitForFunction
// resolves on ANY truthy value, and the predicate returns the string "error"
// -- which is truthy. Only waitForOutcome reads the sentinel and throws.
const gccBranch = prerender.slice(
  prerender.indexOf('route.kind === "gccJobs"'),
  prerender.indexOf('route.kind === "gccJobs"') + 1600
);
checkTrue("the gccJobs branch uses waitForOutcome", gccBranch.includes("waitForOutcome"));
checkTrue(
  "it checks the fetch-error selector",
  gccBranch.includes("FETCH_ERROR_SELECTOR")
);
checkTrue(
  "it waits for data-board-list",
  gccBranch.includes("data-board-list")
);
checkTrue(
  'it compares to "ready" rather than merely "not pending"',
  /=== "ready"/.test(gccBranch)
);

// THE DETAIL ROUTE MUST NOT BE PRERENDERED. It is served by api/public.js
// through a vercel.json rewrite, which is what puts JobPosting markup on it.
// Adding it here would write a dist/ page that the rewrite then never serves.
checkFalse(
  "the parameterised role route is NOT in the prerender list",
  /path:\s*"\/gcc-jobs\/:slugId"/.test(prerender)
);
checkFalse(
  "and no role path is hardcoded into it either",
  /path:\s*"\/gcc-jobs\/[^:"]/.test(prerender)
);

// ---------------------------------------------------------------------------
// 4. THE PAGE IS IN A SITEMAP
// ---------------------------------------------------------------------------

const sitemapBlock = prerender.slice(
  prerender.indexOf("const STATIC_SITEMAP_PATHS"),
  prerender.indexOf("];", prerender.indexOf("const STATIC_SITEMAP_PATHS"))
);
checkTrue("STATIC_SITEMAP_PATHS includes /gcc-jobs", sitemapBlock.includes('"/gcc-jobs"'));
checkFalse(
  "and does not include a role URL, which belongs in sitemap-jobs.xml",
  /"\/gcc-jobs\/[^"]+"/.test(sitemapBlock)
);

// ---------------------------------------------------------------------------
// 5. THE COMMENTS NO LONGER STATE THE OPPOSITE
//
// A wrong premise left in a comment is how the next person re-derives the
// error -- the same rule as stage 12's deliverable 5. Both comments asserted
// the old state as current fact.
// ---------------------------------------------------------------------------

checkFalse(
  "main.jsx no longer calls the board routes noindex as a current fact",
  /Public, but noindex until/.test(mainJsx)
);
checkFalse(
  "main.jsx no longer says they are excluded from the prerender list",
  /excluded by\s*\n?\s*(\/\/\s*)?not being added to it/.test(mainJsx)
);
checkTrue(
  "main.jsx states the current arrangement instead",
  /INDEXABLE/.test(mainJsx) && /prerender/.test(mainJsx)
);
checkFalse(
  "GccJobs.jsx no longer presents the hold as current",
  /^\s*\/\/ noindex until stage 10/m.test(gccJobs)
);

// The route itself must still exist, or everything above is vacuously true.
checkTrue(
  "the /gcc-jobs route is still registered",
  /path="\/gcc-jobs"\s+element=\{<GccJobs/.test(mainCode)
);
checkTrue(
  "and the role route is still registered",
  /path="\/gcc-jobs\/:slugId"/.test(mainCode)
);

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\nBoard indexability test: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}

console.log(`Board indexability test: ${passed} passed, 0 failed`);
console.log("All good.");
