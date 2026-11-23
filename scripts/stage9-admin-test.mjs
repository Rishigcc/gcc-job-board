// ===========================================================================
// Stage 9 -- how an admin action is described.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage9-admin-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t9.mjs && node /tmp/t9.mjs
//
// WHY THIS IS WORTH TESTING
//   The audit log is read at the worst possible moment -- straight after a
//   mistake. A raw column value in it ('job_hidden', 'candidate_data_
//   anonymised') is exactly the kind of thing that is fine while you still
//   remember writing it and useless six months later.
//
//   Every action in the database's CHECK constraint must have a label. A
//   missing one is silent: the row still renders, just with a fallback, and
//   nobody notices until they are looking for the entry that explains what
//   happened. So the list is asserted against the constraint rather than
//   eyeballed.
//
// WHAT IT DOES NOT PROVE
//   Nothing about authorisation. That a non-admin cannot call these functions
//   is proved against the live database -- see the stage 9 checklist.
// ===========================================================================

import {
  confirmed,
  CONFIRM_DELETE_MY_DATA,
  CONFIRM_ORPHAN_DELETE,
  CONFIRM_ANONYMISE,
} from "../src/lib/confirmations.js";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  shortDate,
} from "../src/lib/adminFormat.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// Copied from the CHECK constraint in migration 014. If the two ever diverge,
// the first test below fails rather than a row rendering as "Admin action"
// and nobody noticing.
const ACTIONS_IN_THE_CONSTRAINT = [
  "recruiter_verified", "recruiter_unverified",
  "recruiter_suspended", "recruiter_unsuspended",
  "job_hidden", "job_unhidden",
  "company_renamed",
  "orphan_file_deleted",
  "candidate_data_anonymised",
  "retention_purge",
];

console.log("\nevery action the database allows has a label");
t("the label map covers the constraint exactly",
  Object.keys(AUDIT_ACTION_LABELS).sort(), [...ACTIONS_IN_THE_CONSTRAINT].sort());

for (const action of ACTIONS_IN_THE_CONSTRAINT) {
  t(`${action} has a real label`,
    auditActionLabel(action) !== "Admin action" && auditActionLabel(action).length > 3, true);
}

console.log("\nno raw database value reaches the page");
const everyLabel = Object.values(AUDIT_ACTION_LABELS).join(" ");
t("no label contains an underscore", everyLabel.includes("_"), false);
t("no label is just the action name",
  ACTIONS_IN_THE_CONSTRAINT.some((a) => everyLabel.includes(a)), false);
t("the word 'rejected' appears nowhere", /reject/i.test(everyLabel), false);

console.log("\nunknown and missing actions fall back rather than leaking");
t("an action added to the constraint but not the map",
  auditActionLabel("recruiter_deleted"), "Admin action");
t("null",      auditActionLabel(null), "Admin action");
t("undefined", auditActionLabel(undefined), "Admin action");
t("empty",     auditActionLabel(""), "Admin action");

console.log("\nthe two actions a person most needs to tell apart read differently");
t("verified and unverified are not the same sentence",
  auditActionLabel("recruiter_verified") === auditActionLabel("recruiter_unverified"), false);
t("suspended and unsuspended are not the same sentence",
  auditActionLabel("recruiter_suspended") === auditActionLabel("recruiter_unsuspended"), false);
t("hidden and unhidden are not the same sentence",
  auditActionLabel("job_hidden") === auditActionLabel("job_unhidden"), false);
t("all ten labels are distinct",
  new Set(Object.values(AUDIT_ACTION_LABELS)).size, 10);

console.log("\ndates -- an audit row with a broken timestamp must still render");
t("null",            shortDate(null), "—");
t("undefined",       shortDate(undefined), "—");
t("empty string",    shortDate(""), "—");
t("nonsense never renders 'Invalid Date'", shortDate("not a date"), "—");
t("a real timestamp renders",
  shortDate("2026-11-23T06:09:30Z").includes("Nov"), true);
t("and carries a time, because two actions a minute apart are different events",
  /\d{1,2}:\d{2}/.test(shortDate("2026-11-23T06:09:30Z")), true);

// ---------------------------------------------------------------------------
// Typed confirmations.
//
// This exists because the comparison was duplicated six times and three copies
// had .toUpperCase() added to them, so typing lower-case `delete` deleted a
// file -- on a form whose own label said to type DELETE. Case-sensitivity is
// the whole mechanism: a confirmation that accepts a different string than the
// one it asked for is not a confirmation.
// ---------------------------------------------------------------------------
console.log("\ntyped confirmations are exact");
for (const word of [CONFIRM_DELETE_MY_DATA, CONFIRM_ORPHAN_DELETE, CONFIRM_ANONYMISE]) {
  t(`${word} -- exact match passes`, confirmed(word, word), true);
  t(`${word} -- lower case is refused`, confirmed(word.toLowerCase(), word), false);
  t(`${word} -- mixed case is refused`,
    confirmed(word[0] + word.slice(1).toLowerCase(), word), false);
  t(`${word} -- surrounding whitespace is forgiven`, confirmed(`  ${word}\n`, word), true);
  // Only meaningful for a multi-word confirmation. A single word has no inner
  // whitespace to double, so asserting it here would be asserting nothing --
  // which is what the first version of this test did.
  if (word.includes(" ")) {
    t(`${word} -- inner whitespace is not forgiven`,
      confirmed(word.replace(/ /g, "  "), word), false);
  }
}

console.log("\nand nothing else counts as a confirmation");
t("empty string",        confirmed("", CONFIRM_ORPHAN_DELETE), false);
t("whitespace only",     confirmed("   ", CONFIRM_ORPHAN_DELETE), false);
t("null",                confirmed(null, CONFIRM_ORPHAN_DELETE), false);
t("undefined",           confirmed(undefined, CONFIRM_ORPHAN_DELETE), false);
t("a number",            confirmed(1, CONFIRM_ORPHAN_DELETE), false);
t("an object",           confirmed({}, CONFIRM_ORPHAN_DELETE), false);
t("a true-ish object with a toString", confirmed({ toString: () => "DELETE" }, "DELETE"), false);
t("an empty expectation never passes", confirmed("", ""), false);
t("an empty expectation never passes, whatever is typed", confirmed("anything", ""), false);

console.log("\none word is never a confirmation for another");
t("DELETE does not confirm DELETE MY DATA",
  confirmed(CONFIRM_ORPHAN_DELETE, CONFIRM_DELETE_MY_DATA), false);
t("DELETE MY DATA does not confirm DELETE",
  confirmed(CONFIRM_DELETE_MY_DATA, CONFIRM_ORPHAN_DELETE), false);
t("a prefix is not enough", confirmed("ANON", CONFIRM_ANONYMISE), false);
t("a superstring is not enough", confirmed("ANONYMISE NOW", CONFIRM_ANONYMISE), false);

console.log("\nthe three words are distinct, so no form can confirm another's action");
t("all distinct",
  new Set([CONFIRM_DELETE_MY_DATA, CONFIRM_ORPHAN_DELETE, CONFIRM_ANONYMISE]).size, 3);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
