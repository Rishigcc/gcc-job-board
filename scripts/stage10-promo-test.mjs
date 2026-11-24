// ===========================================================================
// Stage 10, round two -- the promo card's two decisions.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage10-promo-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t10promo.mjs && node /tmp/t10promo.mjs
//
// WHY THIS IS WORTH TESTING
//   The card makes two decisions, and both of them fail quietly.
//
//     1. WHETHER TO RENDER AT ALL. Rishi's rule: "No live roles, no card."
//        The failure is a visitor clicking a card that promises roles into a
//        board with none. Every input that is not a positive number of roles
//        -- an error, a null, a string, a NaN, a negative -- has to resolve
//        to "hide", and "we have not asked yet" has to resolve to neither,
//        because the prerender distinguishes them.
//
//     2. WHETHER THE BADGE IS STILL IN DATE. A badge that outstays its
//        welcome reads as neglect, and nobody is watching for it. The date is
//        a constant someone will eventually mistype, so a malformed one must
//        mean no badge rather than a badge forever.
//
// WHAT IT DOES NOT PROVE
//   That the count itself is right. live_job_count() being viewer-independent
//   is proved against the database by migration 022's c3 and c4 -- a plain
//   count returns a different number to a visitor, a recruiter and the admin,
//   and that is a database fact, not a JavaScript one.
// ===========================================================================

import {
  NEW_FEATURE_UNTIL,
  PROMO,
  isNewFeature,
  promoState,
} from "../src/lib/boardPromo.js";

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

// ---------------------------------------------------------------------------
// 1. promoState -- the rule is "no live roles, no card"
// ---------------------------------------------------------------------------

check("one live role shows the card", promoState({ loading: false, error: null, liveRoles: 1 }), "show");
check("many live roles show the card", promoState({ loading: false, error: null, liveRoles: 23 }), "show");
check("zero live roles hides it", promoState({ loading: false, error: null, liveRoles: 0 }), "hide");

// Pending is its own state, and must not be confused with either answer:
// the prerender waits on exactly this distinction.
check("still loading is pending", promoState({ loading: true, error: null, liveRoles: null }), "pending");
check("loading wins even if a count is somehow present",
  promoState({ loading: true, error: null, liveRoles: 5 }), "pending");

// Fail closed. Each of these is a way the count can come back useless, and
// every one of them has to hide rather than show.
const failClosed = [
  ["an error", { loading: false, error: new Error("network"), liveRoles: null }],
  ["an error alongside a count", { loading: false, error: new Error("rls"), liveRoles: 9 }],
  ["a null count", { loading: false, error: null, liveRoles: null }],
  ["an undefined count", { loading: false, error: null, liveRoles: undefined }],
  ["a string count", { loading: false, error: null, liveRoles: "3" }],
  ["NaN", { loading: false, error: null, liveRoles: NaN }],
  ["Infinity", { loading: false, error: null, liveRoles: Infinity }],
  ["a negative count", { loading: false, error: null, liveRoles: -1 }],
  ["no argument at all", undefined],
  ["an empty object", {}],
];

for (const [label, input] of failClosed) {
  check(`${label} hides the card`, promoState(input), "hide");
}

// The three states are the whole vocabulary -- a component switching on them
// cannot be left with an unhandled case.
const everyInput = [
  { loading: true },
  { loading: false, liveRoles: 0 },
  { loading: false, liveRoles: 7 },
  { loading: false, error: new Error("x") },
  {},
  undefined,
];
for (const input of everyInput) {
  checkTrue(
    `promoState(${JSON.stringify(input)}) is one of the three states`,
    ["pending", "show", "hide"].includes(promoState(input))
  );
}

// ---------------------------------------------------------------------------
// 2. isNewFeature -- the badge takes itself off
// ---------------------------------------------------------------------------

const until = "2027-01-19";

checkTrue("well before the date, the badge is on", isNewFeature(new Date("2026-11-24T00:00:00Z"), until));
checkTrue("the day before, on", isNewFeature(new Date("2027-01-18T23:59:00Z"), until));

// Inclusive: it is still on for the whole of its last day, so the badge is
// never half-present on the date someone wrote down.
checkTrue("the first minute of the last day, on", isNewFeature(new Date("2027-01-19T00:00:00Z"), until));
checkTrue("the last minute of the last day, on", isNewFeature(new Date("2027-01-19T23:59:59Z"), until));

checkFalse("the first minute of the next day, off", isNewFeature(new Date("2027-01-20T00:00:00Z"), until));
checkFalse("a month later, off", isNewFeature(new Date("2027-02-19T12:00:00Z"), until));
checkFalse("six months later, off -- the failure this guards against",
  isNewFeature(new Date("2027-07-19T12:00:00Z"), until));

// A malformed constant means NO badge. The card still works without one;
// a badge nobody can switch off is the thing to avoid.
const malformed = [
  ["an empty string", ""],
  ["a human date", "19 January 2027"],
  ["a slashed date", "2027/01/19"],
  ["a short year", "27-01-19"],
  ["missing the day", "2027-01"],
  ["a number", 20270119],
  ["null", null],
  ["a Date object", new Date("2027-01-19")],
  ["true", true],
];

for (const [label, value] of malformed) {
  checkFalse(`${label} as the date means no badge`, isNewFeature(new Date("2026-11-24T00:00:00Z"), value));
}

// NOT in that list, on purpose: an explicit `undefined` second argument.
// JavaScript substitutes the default parameter for it, so it cannot mean
// "no date" -- it means the shipped constant. Pinned here rather than left
// to be discovered, because the obvious test for it passes for the wrong
// reason. Deleting the constant outright still yields false: the default
// would then be undefined, and the regex guard rejects it.
check("an explicit undefined falls back to the shipped constant",
  isNewFeature(new Date("2026-11-24T00:00:00Z"), undefined),
  isNewFeature(new Date("2026-11-24T00:00:00Z"), NEW_FEATURE_UNTIL));

// An unusable clock means no badge either, for the same reason.
checkFalse("an invalid Date means no badge", isNewFeature(new Date("nonsense"), until));
checkFalse("a non-Date now means no badge", isNewFeature("2026-11-24", until));
checkFalse("a null now means no badge", isNewFeature(null, until));

// ---------------------------------------------------------------------------
// 3. The shipped constant
// ---------------------------------------------------------------------------

checkTrue("NEW_FEATURE_UNTIL is a plain ISO date", /^\d{4}-\d{2}-\d{2}$/.test(NEW_FEATURE_UNTIL));
checkTrue("NEW_FEATURE_UNTIL is a real date", !Number.isNaN(new Date(NEW_FEATURE_UNTIL).getTime()));

// It has to be in the future as shipped, or the badge Rishi asked for would
// be invisible on the preview and the whole thing would look unbuilt. The
// carried item resets it at merge.
checkTrue("the badge is still in date as shipped", isNewFeature(new Date(), NEW_FEATURE_UNTIL));

// And it has to actually expire, which a placeholder far in the future would
// not. Eight weeks from the day it was written is well inside a year.
const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
checkFalse("the badge is gone within a year", isNewFeature(inAYear, NEW_FEATURE_UNTIL));

// ---------------------------------------------------------------------------
// 4. The copy, exactly as approved
// ---------------------------------------------------------------------------

check("the badge reads as approved", PROMO.badge, "New Feature");
check("the heading reads as approved", PROMO.heading, "Exclusive jobs");
check(
  "the body reads as approved",
  PROMO.body,
  "These jobs are posted directly to our website. Search, save, apply and track your application, all in one place."
);
check("the card goes to the board", PROMO.to, "/gcc-jobs");

// The heading is not the body and neither is empty -- the kind of thing a
// careless edit to one string does to the other.
checkTrue("heading and body differ", PROMO.heading !== PROMO.body);
for (const [key, value] of Object.entries(PROMO)) {
  checkTrue(`PROMO.${key} is a non-empty string`, typeof value === "string" && value.trim().length > 0);
}

// ---------------------------------------------------------------------------

console.log(`\nStage 10 promo-card test: ${passed} passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log("\nFAILURES:\n");
  for (const f of failures) console.log(`  ${f}\n`);
  process.exit(1);
}

console.log("All good.\n");
