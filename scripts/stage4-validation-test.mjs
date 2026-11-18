// ===========================================================================
// Stage 4 — does the posting form agree with the database?
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage4-validation-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t.mjs && node /tmp/t.mjs
//
// esbuild is needed only because the app's own imports have no file
// extensions, which Vite resolves and plain Node does not. The bundle is
// built from the REAL src/lib files, so this is not testing a copy.
//
// WHY IT EXISTS
//   The form validates before submitting, so a recruiter sees "the maximum
//   cannot be below the minimum" rather than
//   "violates check constraint experience_range". That is only an improvement
//   if the two agree. If the form is stricter, a legitimate posting is
//   refused for no reason. If the form is looser, the recruiter fills in a
//   long form and then gets a constraint name.
//
//   So every case below is derived from a CHECK constraint in
//   001_job_board_foundation.sql, with the constraint quoted in the section
//   heading, and tests the BOUNDARY on both sides. It is not a list of
//   things that felt worth checking.
//
// WHAT IT DOES NOT PROVE
//   It does not run against Postgres. It proves the form matches what the
//   migration SAYS. If a constraint is ever changed in the database without
//   this file changing, the test keeps passing and is then wrong -- so when
//   you edit a constraint, edit this too.
// ===========================================================================

import { validateJob, EMPTY_JOB } from "../src/lib/jobFormModel.js";
import { liveSlotsLabel } from "../src/lib/jobOptions.js";

const base = {
  ...EMPTY_JOB,
  title: "Senior Financial Analyst",
  company_name: "Target Corporation",
  // A company that was PICKED from the list. An id here is what "confirmed"
  // means; see the hiring-company section below.
  company_id: "11111111-1111-1111-1111-111111111111",
  city: "Bengaluru",
  work_mode: "hybrid",
  job_function: "Finance & Accounting",
  employment_type: "full_time",
  experience_min: "3",
  experience_max: "7",
  description: "x".repeat(60),
  apply_mode: "in_platform",
};

let pass = 0, fail = 0;
const t = (name, values, expectKeys) => {
  const errs = Object.keys(validateJob(values)).sort();
  const want = [...expectKeys].sort();
  const ok = JSON.stringify(errs) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want [${want}]  got [${errs}]`);
  ok ? pass++ : fail++;
};

console.log("\nBASELINE");
t("a complete, valid posting has no errors", base, []);

console.log("\ntitle -- check (length(btrim(title)) between 3 and 200)");
t("2 chars rejected", { ...base, title: "ab" }, ["title"]);
t("3 chars accepted", { ...base, title: "abc" }, []);
t("200 chars accepted", { ...base, title: "a".repeat(200) }, []);
t("201 chars rejected", { ...base, title: "a".repeat(201) }, ["title"]);
t("whitespace-only rejected (btrim)", { ...base, title: "    " }, ["title"]);

console.log("\nexperience -- check (between 0 and 50), constraint experience_range (max >= min)");
t("0 accepted as a fresher role", { ...base, experience_min: "0", experience_max: "0" }, []);
t("50 accepted", { ...base, experience_min: "0", experience_max: "50" }, []);
t("51 rejected", { ...base, experience_max: "51" }, ["experience_max"]);
t("-1 rejected", { ...base, experience_min: "-1" }, ["experience_min"]);
t("max below min rejected", { ...base, experience_min: "8", experience_max: "3" }, ["experience_max"]);
t("max equal to min accepted", { ...base, experience_min: "5", experience_max: "5" }, []);
t("non-integer rejected", { ...base, experience_min: "2.5" }, ["experience_min"]);
t("blank rejected (column is not null)", { ...base, experience_min: "" }, ["experience_min"]);

console.log("\ndescription -- check (length(btrim(description)) between 50 and 20000)");
t("49 chars rejected", { ...base, description: "x".repeat(49) }, ["description"]);
t("50 chars accepted", { ...base, description: "x".repeat(50) }, []);
t("20000 accepted", { ...base, description: "x".repeat(20000) }, []);
t("20001 rejected", { ...base, description: "x".repeat(20001) }, ["description"]);
t("50 spaces rejected (btrim)", { ...base, description: " ".repeat(50) }, ["description"]);

// ---------------------------------------------------------------------------
// The external-apply option was removed from the form. jobs.apply_mode and
// jobs.external_url remain in the schema so the decision is reversible
// without a migration, but nothing the form produces reaches them:
// insertPayload() pins them to 'in_platform' and null, so the constraint
// external_needs_https_url can no longer be violated from here.
// ---------------------------------------------------------------------------
console.log("\napply mode -- in-platform only");
t("the only mode the form can produce is accepted",
  { ...base, apply_mode: "in_platform", external_url: "" }, []);
t("a leftover external_url is ignored rather than validated",
  { ...base, apply_mode: "in_platform", external_url: "http://insecure.example.com" }, []);

console.log("\nsalary -- constraint salary_range + salary_needs_units");
t("no salary at all accepted", base, []);
t("min only, with units, accepted", { ...base, salary_min: "1800000" }, []);
t("max only, with units, accepted", { ...base, salary_max: "2600000" }, []);
t("max below min rejected", { ...base, salary_min: "2600000", salary_max: "1800000" }, ["salary_max"]);
t("equal accepted", { ...base, salary_min: "2000000", salary_max: "2000000" }, []);
t("negative rejected", { ...base, salary_min: "-1" }, ["salary_min"]);
t("units missing rejected", { ...base, salary_min: "100", salary_currency: "", salary_period: "" }, ["salary_currency"]);

console.log("\nopenings -- check (openings between 1 and 999)");
t("blank accepted (nullable)", base, []);
t("0 rejected", { ...base, openings: "0" }, ["openings"]);
t("1 accepted", { ...base, openings: "1" }, []);
t("999 accepted", { ...base, openings: "999" }, []);
t("1000 rejected", { ...base, openings: "1000" }, ["openings"]);

console.log("\nfixed lists -- city and job_function must come from the dropdowns");
t("unknown city rejected", { ...base, city: "Bangalore" }, ["city"]);
t("unknown function rejected", { ...base, job_function: "Engineering" }, ["job_function"]);
t("empty required selects rejected", { ...base, city: "", work_mode: "", job_function: "" },
  ["city", "work_mode", "job_function"]);

// ---------------------------------------------------------------------------
// The hiring company is not a CHECK constraint. It is a rule this form
// invents, because public.companies has no UPDATE grant for recruiters: a
// company row created by a typo is permanent until an admin fixes it. So the
// form refuses a name that was typed but never confirmed, either by picking
// an existing company or by explicitly asking for a new one.
// ---------------------------------------------------------------------------
console.log("\nhiring company -- typed is not the same as chosen");
t("picked from the list accepted", base, []);
t("explicitly added as new accepted",
  { ...base, company_id: "", company_is_new: true }, []);
t("typed but never confirmed rejected",
  { ...base, company_id: "", company_is_new: false }, ["company_name"]);
t("blank rejected",
  { ...base, company_id: "", company_name: "", company_is_new: false }, ["company_name"]);
t("blank rejected even when flagged new",
  { ...base, company_id: "", company_name: "", company_is_new: true }, ["company_name"]);
t("whitespace-only rejected",
  { ...base, company_id: "", company_name: "   ", company_is_new: true }, ["company_name"]);
t("punctuation-only new name rejected (no slug)",
  { ...base, company_id: "", company_name: "...", company_is_new: true }, ["company_name"]);
t("punctuation-only accepted when an existing row was picked",
  { ...base, company_name: "..." }, []);

console.log("\nan empty form reports every required field at once");
t("EMPTY_JOB", EMPTY_JOB,
  ["title","company_name","city","work_mode","job_function","experience_min","experience_max","description"]);

// ---------------------------------------------------------------------------
// The slot counter. The cap is enforced in the INSERT POLICY, not in this
// form, so the live count can legitimately exceed it -- a seeded batch, an
// admin fix, verification lifting the cap after the fact. "25 of 10 roles
// live" is an honest number in a sentence that reads like a broken counter.
// ---------------------------------------------------------------------------
const label = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log("\nthe live-roles counter");
label("none live",            liveSlotsLabel(0),  "0 of 10 roles live.");
label("one live is still 'roles' -- the noun belongs to the cap",
                              liveSlotsLabel(1),  "1 of 10 roles live.");
label("mid-range",            liveSlotsLabel(7),  "7 of 10 roles live.");
label("exactly at the cap",   liveSlotsLabel(10), "10 of 10 roles live.");
label("one over the cap reads as a count, not a fraction",
                              liveSlotsLabel(11), "11 roles live (limit 10).");
label("well over the cap",    liveSlotsLabel(25), "25 roles live (limit 10).");
label("a cap of 1 is singular", liveSlotsLabel(0, 1), "0 of 1 role live.");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
