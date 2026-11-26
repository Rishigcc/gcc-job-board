// ===========================================================================
// THE NEGATIVE RUN for scripts/board-indexability-test.mjs.
//
//     node scripts/board-indexability-negative-run.mjs
//
// Copies src/ and scripts/ to a temp directory, applies ONE breaking mutation,
// runs the suite there, and asserts it fails AND fails on the right
// assertion.
//
// WHY THIS SUITE NEEDS ONE PARTICULARLY BADLY
//   The defect it guards was three ABSENCES -- no prerender entry, no sitemap
//   entry, and a prop that should not have been there. A suite asserting
//   absence is the easiest kind to write so that it cannot fail: every
//   `checkFalse` on a regex that never matches anything passes forever,
//   including when the thing it is looking for is spelled differently. Five
//   checks have shipped broken on this project already.
//
//   It needs no bundling, unlike the item 27 harness, because the suite only
//   reads files -- so the copy is run directly and its own relative reads
//   resolve to the mutated tree.
//
// A mutation reported as MUTATION CHANGED NOTHING means its anchor text
// moved, not that the code is fine. Fix the anchor.
// ===========================================================================

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// [label, file under the copy root, transform, expected text in the failure]
const MUTANTS = [
  // --- the page is indexable ---------------------------------------------
  [
    "the noindex prop comes back",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace('        path="/gcc-jobs"\n', '        path="/gcc-jobs"\n        noindex\n'),
    "passes no noindex prop",
  ],
  [
    "the noindex comes back spelled as an expression",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace('        path="/gcc-jobs"\n', '        path="/gcc-jobs"\n        noindex={true}\n'),
    "passes no noindex prop",
  ],
  [
    "the Seo path prop is dropped",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace('        path="/gcc-jobs"\n', ""),
    "still declares its path",
  ],
  [
    "the DETAIL page regresses to noindex",
    "src/Pages/GccJobDetail.jsx",
    (s) => s.replace("      <Seo", "      <Seo noindex"),
    "GccJobDetail.jsx passes no noindex prop either",
  ],

  // --- the page publishes its readiness ----------------------------------
  [
    "data-board-list is removed",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace(/\n\s*data-board-list=\{[^}]*\}/, ""),
    "publishes data-board-list",
  ],
  [
    "data-board-list is hardcoded to ready",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace(/data-board-list=\{[^}]*\}/, 'data-board-list="ready"'),
    "publishes data-board-list",
  ],
  [
    "data-board-list stops being derived from loading",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace(/data-board-list=\{\s*loading\s*\?/, "data-board-list={hydrated ?"),
    "derived from loading",
  ],
  [
    "data-fetch-error is removed",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace("            data-fetch-error\n", ""),
    "publishes data-fetch-error",
  ],

  // --- the prerenderer renders it ----------------------------------------
  [
    "/gcc-jobs is dropped from buildRoutes",
    "scripts/prerender.mjs",
    (s) => s.replace(/\n\s*\{ path: "\/gcc-jobs", kind: "gccJobs", out: "gcc-jobs\/index\.html" \},/, ""),
    "buildRoutes includes /gcc-jobs",
  ],
  [
    "its kind reverts to static, which would save a spinner",
    "scripts/prerender.mjs",
    (s) => s.replace('path: "/gcc-jobs", kind: "gccJobs"', 'path: "/gcc-jobs", kind: "static"'),
    "its own kind rather than reusing static",
  ],
  [
    "the output path is wrong",
    "scripts/prerender.mjs",
    (s) => s.replace('out: "gcc-jobs/index.html"', 'out: "gccjobs/index.html"'),
    "writes to gcc-jobs/index.html",
  ],
  [
    "the wait branch is removed",
    "scripts/prerender.mjs",
    (s) => s.replace('route.kind === "gccJobs"', 'route.kind === "neverMatches"'),
    "waitForContent has a gccJobs branch",
  ],
  [
    "waitForOutcome is swapped for waitForFunction, so 'error' reads as success",
    "scripts/prerender.mjs",
    (s) =>
      s.replace(
        /(route\.kind === "gccJobs"[\s\S]{0,900}?)await waitForOutcome\(/,
        "$1await page.waitForFunction("
      ),
    "uses waitForOutcome",
  ],
  [
    "the fetch-error check is dropped from the predicate",
    "scripts/prerender.mjs",
    (s) =>
      s.replace(
        /(route\.kind === "gccJobs"[\s\S]{0,1400}?)\{ errorSelector: FETCH_ERROR_SELECTOR \}/,
        "$1undefined"
      ),
    "checks the fetch-error selector",
  ],
  [
    'the readiness test weakens to "not pending"',
    "scripts/prerender.mjs",
    (s) =>
      s.replace(
        'board.getAttribute("data-board-list") === "ready" ? "ok" : false',
        'board.getAttribute("data-board-list") !== "pending" ? "ok" : false'
      ),
    'compares to "ready"',
  ],
  [
    "the parameterised role route is added to the prerender list",
    "scripts/prerender.mjs",
    (s) =>
      s.replace(
        '{ path: "/gcc-jobs", kind: "gccJobs", out: "gcc-jobs/index.html" },',
        '{ path: "/gcc-jobs", kind: "gccJobs", out: "gcc-jobs/index.html" },\n    { path: "/gcc-jobs/:slugId", kind: "static", out: "gcc-jobs/role/index.html" },'
      ),
    "parameterised role route is NOT in the prerender list",
  ],

  // --- the page is in a sitemap ------------------------------------------
  [
    "/gcc-jobs is dropped from STATIC_SITEMAP_PATHS",
    "scripts/prerender.mjs",
    (s) => s.replace('\n  "/gcc-jobs",\n  "/questions",', '\n  "/questions",'),
    "STATIC_SITEMAP_PATHS includes /gcc-jobs",
  ],

  // --- the comments do not state the opposite ----------------------------
  [
    "main.jsx's old premise is restored",
    "src/main.jsx",
    (s) => s.replace("INDEXABLE", "Public, but noindex until stage 10 renders them server-side"),
    "no longer calls the board routes noindex as a current fact",
  ],
  [
    "GccJobs.jsx's old header line is restored",
    "src/Pages/GccJobs.jsx",
    (s) => s.replace("// INDEXABLE AND PRERENDERED since", "// noindex until stage 10, which renders job pages server-side\n// Was:"),
    "no longer presents the hold as current",
  ],
  [
    "the route itself is removed, making the suite vacuous",
    "src/main.jsx",
    (s) => s.replace('<Route path="/gcc-jobs" element={<GccJobs', '<Route path="/gcc-jobs-old" element={<GccJobs'),
    "/gcc-jobs route is still registered",
  ],
];

let caught = 0;
const problems = [];

for (const [label, file, mutate, expected] of MUTANTS) {
  const dir = mkdtempSync(join(tmpdir(), "board-neg-"));
  try {
    cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
    cpSync(join(REPO, "scripts"), join(dir, "scripts"), { recursive: true });

    const target = join(dir, file);
    const before = readFileSync(target, "utf8");
    const after = mutate(before);

    if (after === before) {
      problems.push(`${label}\n    MUTATION CHANGED NOTHING — its anchor text moved`);
      continue;
    }
    writeFileSync(target, after);

    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("node", [join(dir, "scripts/board-indexability-test.mjs")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      exitCode = err.status ?? 1;
      output = `${err.stdout || ""}${err.stderr || ""}`;
    }

    if (exitCode === 0) {
      problems.push(`${label}\n    NOT CAUGHT — the suite still passed`);
    } else if (!output.includes(expected)) {
      problems.push(
        `${label}\n    caught, but on the WRONG assertion` +
          `\n    expected the failure to mention: ${JSON.stringify(expected)}`
      );
    } else {
      caught += 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.error(`\nNegative run: ${caught}/${MUTANTS.length} caught, ${problems.length} PROBLEM(S)\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}

console.log(`Negative run: ${caught}/${MUTANTS.length} mutations caught, on the right assertion.`);
console.log("All good.");
