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
const PAGES = [
  "/",
  "/jobs",
  "/gcc-jobs",
  "/gcc-jobs/trial-jobs-agaion-42",
  // CARRIED ITEM 27, 25 Nov 2026: the one role whose description is real
  // Markdown -- headings, bold and bullets, 7,085 characters of it. A
  // description now has STRUCTURE, and a heading, a list item and a
  // paragraph are three different measurements: the break classes live on
  // each block in JobDescription.jsx rather than on one <p>, so a class
  // missing from the list-item branch would show up here and nowhere else.
  //
  // This page is deleted at the pre-merge clearout along with the rest of
  // the test data, so this entry goes when it does -- the same note as
  // role 42 below.
  "/gcc-jobs/program-manager-13",
  "/questions",
  "/post-a-job",
];

const server = await preview({ preview: { port: 4199, strictPort: true }, logLevel: "warn" });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();

let failures = 0;
let checks = 0;

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(900);

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

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
