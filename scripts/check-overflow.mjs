// ===========================================================================
// Does any page overflow sideways?
//
//     npm run build && node scripts/check-overflow.mjs
//
// WHY THIS EXISTS, AND WHY A CSS GREP WAS NOT ENOUGH
//
// 24 Nov 2026: a 150-character unbroken job title ran out of the card on
// /recruiter/jobs. `break-words` was added. It did nothing, and it was in
// the compiled CSS the whole time -- verified. The class was not missing;
// the class was INERT:
//
//   A FLEX ITEM'S DEFAULT min-width IS auto, WHICH RESOLVES TO ITS
//   MIN-CONTENT SIZE -- AND overflow-wrap: break-word DOES NOT REDUCE
//   MIN-CONTENT. So a flex child holding one long word refuses to shrink,
//   and no amount of break-words changes that. `min-w-0` on the item is
//   what lets it shrink, and only then can break-words act.
//
// Checking that a class compiles proves the class compiles. It says nothing
// about whether the text wraps. This script measures the rendered page
// instead, which is the only thing that answers the question.
//
// It checks PUBLIC pages only -- anything behind a sign-in cannot be reached
// from a script without credentials, so /recruiter/* and /admin are still
// eyes-on. The structural check in the sweep covers those: an element with
// a break class, inside a flex or grid parent, with no min-w-0.
// ===========================================================================

import { chromium } from "playwright";
import { preview } from "vite";

const WIDTHS = [1280, 768, 375];

// A role whose title is one unbroken 180-character word, which is the case
// that found all of this.
//
// SINCE 25 Nov 2026 job 42 ALSO carries that word inside a `##` heading and
// inside a `- ` list item, from
// supabase/test-fixtures/item27-overflow-fixture.sql. A description has
// structure now, so a heading, a list item and a paragraph are three
// different measurements -- the wrap classes live on each block in
// JobDescription.jsx rather than on one <p>, and a class missing from the
// list-item branch would show up here and nowhere else.
//
// THE REPLACEMENT FIXTURE MUST CARRY ALL THREE. The pre-merge clearout
// deletes job 42 and job 13, so this script needs a new subject at that
// point; a title-only long word would silently stop testing two of the three
// shapes.
const PAGES = [
  "/",
  "/jobs",
  "/gcc-jobs",
  "/questions",
  "/post-a-job",

  // ---------------------------------------------------------------------
  // THE DESCRIPTION SUBJECTS, which need a job row to exist.
  //
  // A description has STRUCTURE since item 27, so a paragraph, a heading and
  // a list item are three different measurements -- the wrap classes live on
  // each block in JobDescription.jsx rather than on one <p>, and a class
  // missing from the list-item branch would show up here and nowhere else.
  //
  // THE CLEAROUT DELETES BOTH OF THE ROWS THESE USED (jobs 42 and 13), so
  // after it they resolve to "This role is no longer open". A CLOSED role is
  // no use as a replacement: measured 25 Nov 2026, its detail page shows that
  // same message and NO DESCRIPTION, because private.job_is_public() requires
  // status = 'live'. So the fixture has to be live, which means it is on the
  // public board while it exists -- and is therefore created and removed
  // around a run rather than left in place:
  //
  //   supabase/test-fixtures/overflow-fixture-create.sql
  //   node scripts/check-overflow.mjs
  //   supabase/test-fixtures/overflow-fixture-remove.sql
  //
  // MARKED OPTIONAL, AND A MISSING ONE IS REPORTED LOUDLY RATHER THAN
  // SKIPPED QUIETLY. A sweep that silently drops a subject reports a clean
  // run and a clean run looks identical -- which is the failure this project
  // keeps meeting. `ok` on a page with no description would mean nothing at
  // all.
  // THE ID IS WHAT THE PAGE LOOKS UP; the slug is decorative. An earlier
  // version of this entry guessed `-28` and silently measured REAL job 28
  // instead -- a guessed id is not a missing page, it is a different page.
  // The fixture therefore takes a FIXED id of 999999.
  { path: "/gcc-jobs/fixture-overflow-999999", optional: true },
  { path: "/gcc-jobs/trial-jobs-agaion-42", optional: true },
  { path: "/gcc-jobs/program-manager-13", optional: true },
];

// The detail page prints this for a role that is closed, expired, withdrawn
// or absent -- all four look the same to an anonymous visitor, deliberately.
const ROLE_ABSENT = "This role is no longer open";

// And this is the heading above a description that DID load.
const ROLE_PRESENT = "About the role";

// A JOB PAGE MUST BE WAITED FOR, NOT TIMED.
//
// The fixed 900ms below is enough for a prerendered page, and NOT enough for
// a job detail page, which fetches its row after mount. The first version of
// the skip check ran at 900ms, found neither marker, and reported `ok` on a
// role that does not exist -- which also means the measurement itself was
// taken on a page still showing "Loading...". An `ok` from measuring a
// spinner is worth less than no check at all.
//
// So a job page is polled until it declares itself one way or the other.
async function awaitRole(page) {
  try {
    await page.waitForFunction(
      ([absent, present]) => {
        const text = document.body.innerText;
        return text.includes(absent) || text.includes(present);
      },
      [ROLE_ABSENT, ROLE_PRESENT],
      { timeout: 15000 },
    );
  } catch {
    return "timeout";
  }
  return page.evaluate(
    (absent) => (document.body.innerText.includes(absent) ? "absent" : "present"),
    ROLE_ABSENT,
  );
}

const server = await preview({ preview: { port: 4199, strictPort: true }, logLevel: "warn" });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();

let failures = 0;
let checks = 0;
const skipped = new Set();

for (const entry of PAGES) {
  const path = typeof entry === "string" ? entry : entry.path;
  const optional = typeof entry === "string" ? false : Boolean(entry.optional);

  if (skipped.has(path)) continue;

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(900);

      // An optional page whose row does not exist measures nothing. Resolved
      // and announced BEFORE any measurement, so an absence can never be
      // mistaken for a pass.
      if (optional) {
        const state = await awaitRole(page);

        if (state === "absent") {
          skipped.add(path);
          console.log(`SKIP        \u2014  ${path}  no such role -- NOT MEASURED`);
          await page.close();
          break;
        }

        if (state === "timeout") {
          failures += 1;
          checks += 1;
          console.log(
            `ERROR ${width.toString().padStart(4)}px  ${path}  ` +
              `neither "${ROLE_PRESENT}" nor "${ROLE_ABSENT}" appeared in 15s`,
          );
          await page.close();
          continue;
        }
      }

      const r = await page.evaluate(() => {
        const d = document.documentElement;
        const over = d.scrollWidth - d.clientWidth;
        // Which elements actually stick out, so a failure names itself.
        const culprits = [];
        if (over > 1) {
          for (const el of document.querySelectorAll("*")) {
            const b = el.getBoundingClientRect();
            if (b.right > d.clientWidth + 1 && b.width > 0) {
              culprits.push(
                `<${el.tagName.toLowerCase()}> right=${Math.round(b.right)} w=${Math.round(b.width)} ` +
                `class="${el.className.toString().slice(0, 60)}"`
              );
              if (culprits.length >= 4) break;
            }
          }
        }
        return { over, culprits };
      });

      checks += 1;
      if (r.over > 1) {
        failures += 1;
        console.log(`FAIL  ${width.toString().padStart(4)}px  ${path}  overflows by ${r.over}px`);
        for (const c of r.culprits) console.log(`           ${c}`);
      } else {
        console.log(`ok    ${width.toString().padStart(4)}px  ${path}`);
      }
    } catch (error) {
      failures += 1;
      checks += 1;
      console.log(`ERROR ${width.toString().padStart(4)}px  ${path}  ${error.message.split("\n")[0]}`);
    }
    await page.close();
  }
}

await browser.close();
await server.close();

console.log(`\n${checks} checks, ${failures} failed, ${skipped.size} page(s) skipped`);

if (skipped.size) {
  console.log(
    "\n*** DESCRIPTION OVERFLOW WAS NOT MEASURED ***\n" +
      [...skipped].map((p) => `    missing: ${p}`).join("\n") +
      "\n\n    A job description is the only place this sweep tests a long\n" +
      "    unbroken word inside a heading and a list item, which are\n" +
      "    different measurements from a paragraph. To measure them, run\n" +
      "    supabase/test-fixtures/overflow-fixture-create.sql, re-run this\n" +
      "    script, then run overflow-fixture-remove.sql -- the fixture role\n" +
      "    is LIVE and sits on the public board while it exists.\n\n" +
      "    This is a NOTICE, not a failure: after the pre-merge clearout\n" +
      "    there is no job row to measure and that is the expected state.",
  );
}

process.exit(failures > 0 ? 1 : 0);
