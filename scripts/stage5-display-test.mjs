// ===========================================================================
// Stage 5 -- does a job row turn into the right words on screen?
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage5-display-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t5.mjs && node /tmp/t5.mjs
//
// WHY IT EXISTS
//   Everything here is a pure function over a database row, and every one of
//   them has a case that is easy to get wrong and invisible until a real
//   recruiter posts the row that triggers it: a salary with only a minimum,
//   a fresher role where 0-0 must not read "0-0 years", an Indian salary
//   that must group as 18,00,000 and not 1,800,000, and a URL whose slug
//   contains digits and hyphens of its own.
//
//   Running them in Node means the cases can be enumerated rather than
//   clicked through.
//
// WHAT IT DOES NOT PROVE
//   Nothing about RLS, which is where the real security of this stage lives.
//   That is tested in the browser -- see the stage 5 checklist.
// ===========================================================================

import {
  jobPath,
  parseJobParam,
  formatExperience,
  formatSalary,
  formatPosted,
  formatCloses,
  findBand,
  jobMatchesBand,
  EXPERIENCE_BANDS,
} from "../src/lib/jobDisplay.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const salary = (over) => ({
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
  ...over,
});

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

console.log("\nURLs -- /gcc-jobs/<slug>-<id>");
t("built from slug and id",
  jobPath({ id: 42, slug: "senior-financial-analyst", title: "x" }),
  "/gcc-jobs/senior-financial-analyst-42");
t("falls back to the title when a slug is missing",
  jobPath({ id: 7, slug: null, title: "Head of FP&A" }),
  "/gcc-jobs/head-of-fp-and-a-7");
t("parsed back out",
  JSON.stringify(parseJobParam("senior-financial-analyst-42")),
  JSON.stringify({ id: 42, slug: "senior-financial-analyst" }));
t("a slug containing its own digits still parses on the LAST number",
  JSON.stringify(parseJobParam("sap-s4-hana-consultant-2-108")),
  JSON.stringify({ id: 108, slug: "sap-s4-hana-consultant-2" }));
t("no trailing id is not a job",
  JSON.stringify(parseJobParam("senior-financial-analyst")),
  JSON.stringify({ id: null, slug: "" }));
t("empty param is not a job",
  JSON.stringify(parseJobParam("")),
  JSON.stringify({ id: null, slug: "" }));

console.log("\nexperience");
t("a range", formatExperience(3, 7), "3–7 years");
t("0 to 0 is a fresher role, not '0–0 years'", formatExperience(0, 0), "Fresher");
t("equal non-zero collapses", formatExperience(5, 5), "5 years");
t("one year is singular", formatExperience(1, 1), "1 year");
t("0 to 2 is still a range", formatExperience(0, 2), "0–2 years");
t("missing reads as nothing", formatExperience(null, null), null);

console.log("\nsalary -- constraint salary_needs_units means units are present or both ends are null");
t("INR groups the Indian way",
  formatSalary(salary({ salary_min: 1800000, salary_max: 2600000, salary_currency: "INR", salary_period: "year" })),
  "₹18,00,000 – ₹26,00,000 a year");
t("USD groups the Western way",
  formatSalary(salary({ salary_min: 90000, salary_max: 120000, salary_currency: "USD", salary_period: "year" })),
  "$90,000 – $120,000 a year");
t("minimum only",
  formatSalary(salary({ salary_min: 1800000, salary_currency: "INR", salary_period: "year" })),
  "From ₹18,00,000 a year");
t("maximum only",
  formatSalary(salary({ salary_max: 2600000, salary_currency: "INR", salary_period: "year" })),
  "Up to ₹26,00,000 a year");
t("equal ends are one figure, not a range",
  formatSalary(salary({ salary_min: 2000000, salary_max: 2000000, salary_currency: "INR", salary_period: "year" })),
  "₹20,00,000 a year");
t("monthly says so",
  formatSalary(salary({ salary_min: 150000, salary_currency: "INR", salary_period: "month" })),
  "From ₹1,50,000 a month");
t("no salary shows nothing", formatSalary(salary({})), null);
t("a figure with no units shows nothing rather than a bare number",
  formatSalary(salary({ salary_min: 1800000 })), null);

console.log("\nposted");
t("today", formatPosted(new Date().toISOString()), "Posted today");
t("yesterday", formatPosted(daysFromNow(-1)), "Posted yesterday");
t("three days", formatPosted(daysFromNow(-3)), "Posted 3 days ago");
t("nothing", formatPosted(null), "");

console.log("\ncloses -- 30 days from posting, derived not stored");
t("closes today", formatCloses(daysFromNow(0)), "Closes today");
t("tomorrow", formatCloses(daysFromNow(0.5)), "Closes tomorrow");
t("ten days", formatCloses(daysFromNow(9.5)), "Closes in 10 days");
t("already past", formatCloses(daysFromNow(-1)), "This role has closed");

// ---------------------------------------------------------------------------
// Experience bands. A band matches a job when the two RANGES OVERLAP, which
// Rishi chose deliberately: matching only on the job's minimum would hide a
// 3-8 year role from someone with seven years' experience.
// ---------------------------------------------------------------------------
const band = (v) => findBand(v);
const job = (min, max) => ({ experience_min: min, experience_max: max });

console.log("\nexperience bands -- overlap, not containment");
t("a 3-8 year role appears under 3-5",  jobMatchesBand(job(3, 8), band("3-5")), true);
t("the same role appears under 6-10",   jobMatchesBand(job(3, 8), band("6-10")), true);
t("and not under 0-2",                  jobMatchesBand(job(3, 8), band("0-2")), false);
t("and not under 10+",                  jobMatchesBand(job(3, 8), band("10+")), false);
t("a role exactly on the lower edge",   jobMatchesBand(job(5, 9), band("3-5")), true);
t("a role exactly on the upper edge",   jobMatchesBand(job(0, 3), band("3-5")), true);
t("a fresher role is 0-2 only",         jobMatchesBand(job(0, 0), band("0-2")), true);
t("a fresher role is not 3-5",          jobMatchesBand(job(0, 0), band("3-5")), false);
t("a 14-20 year role is 10+",           jobMatchesBand(job(14, 20), band("10+")), true);
t("a role at exactly 10 is in 6-10",    jobMatchesBand(job(10, 10), band("6-10")), true);
t("and also in 10+, by design",         jobMatchesBand(job(10, 10), band("10+")), true);
t("no band means no filter",            jobMatchesBand(job(3, 8), null), true);
t("an unknown band value is no filter", findBand("nonsense"), null);
t("every band is reachable: 0 to 50 spans all four",
  EXPERIENCE_BANDS.filter((b) => jobMatchesBand(job(0, 50), b)).length, 4);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
