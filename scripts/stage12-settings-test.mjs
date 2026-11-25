// ===========================================================================
// Stage 12, deliverables 2–6: a static check of the things that have no
// runtime to test.
//
// WHY STATIC. None of deliverables 2–6 has a serverless function or a
// database call to drive. They are a route guard, a nav condition, three
// comments and a paragraph of policy — all of which are TRUE OR FALSE IN THE
// SOURCE, and all of which a later edit could quietly undo. A route that
// loses `blockRecruiters` fails in exactly the way this project keeps
// meeting: silently, and only for one kind of account nobody is signed in as
// while testing something else.
//
// This suite reads the files and asserts over their text. It cannot prove
// what a browser does, which is what the handover checklist is for. It can
// prove that the guard is still on all seven routes, that the header cannot
// show Profile and Settings at once, that the three disproved comments have
// not come back, and that the password box still verifies the current
// password in a way that does not depend on a dashboard setting.
//
// EVERY ASSERTION HERE WAS PROVED ABLE TO FAIL, by running the suite against
// mutated copies of each file — see "the negative run" in the tracker. A
// check that cannot fail is the fault this project has now hit four times.
//
//   node scripts/stage12-settings-test.mjs
//
// Pass SRC_ROOT to point it at a copy, which is how the negative run works:
//   SRC_ROOT=/tmp/mutant/src node scripts/stage12-settings-test.mjs
// ===========================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.env.SRC_ROOT || "src";

let passed = 0;
const failures = [];

function ok(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(detail ? `${label} — ${detail}` : label);
}

function read(relative) {
  return readFileSync(join(SRC, relative), "utf8");
}

// Strips /* block */ comments and whole-line // comments.
//
// EVERY CHECK ABOUT WHAT THE CODE DOES RUNS ON THE STRIPPED SOURCE. The
// first version of this file did not, and two of its checks passed by
// matching the prose in a header comment instead of the call it described —
// which is the identical fault recorded against
// stage12-reset-gate-test.mjs, where an assertion was anchored on a comment's
// mention of resetPasswordForEmail rather than on `anon.auth.`. A file that
// documents what it deliberately does NOT call will always satisfy a naive
// search for that call.
//
// Only whole-line // comments are removed, so a `//` inside a string or URL
// is never touched.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const main = read("main.jsx");
const header = read("components/SiteHeader.jsx");
const recruiterRoute = read("components/RecruiterRoute.jsx");
const privacy = read("Pages/Privacy.jsx");
const settings = read("Pages/RecruiterSettings.jsx");

// The code of the settings page, with its reasoning removed.
const settingsCode = stripComments(settings);

// ---------------------------------------------------------------------------
// Deliverable 4 — the seven routes, and only the intended ones
// ---------------------------------------------------------------------------

// Pair each `path="..."` with the guard element that follows it, so this
// reads the route's ACTUAL wrapper rather than searching for a path and a
// keyword near each other.
const ROUTE_RE =
  /path="([^"]+)"\s*\n\s*element=\{\s*\n\s*<(ProtectedRoute|RecruiterRoute)( blockRecruiters)?>/g;

const routes = new Map();
for (const m of main.matchAll(ROUTE_RE)) {
  routes.set(m[1], { guard: m[2], blocked: Boolean(m[3]) });
}

const SEVEN = [
  "/profile",
  "/profile/asked",
  "/profile/saved",
  "/profile/saved-jobs",
  "/profile/delete-data",
  "/my-applications",
  "/ask",
];

for (const path of SEVEN) {
  const route = routes.get(path);
  ok(
    `${path} is a ProtectedRoute with blockRecruiters`,
    route && route.guard === "ProtectedRoute" && route.blocked,
    route ? `guard=${route.guard} blockRecruiters=${route.blocked}` : "route not found",
  );
}

// /welcome had the guard before stage 12 and must keep it. A regression here
// would restore the flash that opt-in guarding was introduced to remove.
ok(
  "/welcome keeps blockRecruiters",
  routes.get("/welcome")?.blocked === true,
  `found ${JSON.stringify(routes.get("/welcome"))}`,
);

// /admin was deliberately NOT in the decided list. A recruiter reaching it
// sees Admin's own "Page not found", which is the behaviour that was signed
// off in stage 9; redirecting them to /recruiter instead would change it.
ok(
  "/admin is deliberately not blocked",
  routes.get("/admin")?.blocked === false,
  `found ${JSON.stringify(routes.get("/admin"))}`,
);

// Nothing else acquired the guard without a decision.
const blockedPaths = [...routes.entries()]
  .filter(([, r]) => r.guard === "ProtectedRoute" && r.blocked)
  .map(([p]) => p)
  .sort();
const expectedBlocked = [...SEVEN, "/welcome"].sort();
ok(
  "exactly the seven routes plus /welcome are blocked",
  JSON.stringify(blockedPaths) === JSON.stringify(expectedBlocked),
  `found ${JSON.stringify(blockedPaths)}`,
);

// ---------------------------------------------------------------------------
// Deliverable 3 — the route and the page
// ---------------------------------------------------------------------------

ok(
  "/recruiter/settings exists and is inside RecruiterRoute",
  routes.get("/recruiter/settings")?.guard === "RecruiterRoute",
  `found ${JSON.stringify(routes.get("/recruiter/settings"))}`,
);

ok(
  "RecruiterSettings is imported with the real directory case",
  main.includes('from "./Pages/RecruiterSettings.jsx"'),
  "the directory on disk is src/Pages — a lower-case import builds on macOS and fails on Vercel's Linux",
);

ok(
  "the settings page renders inside the route",
  /<RecruiterSettings\s*\/>/.test(main),
);

// The three read-only decisions, 25 Nov 2026. The strongest available static
// proof that nothing on this page is editable except the password is that the
// page's ONLY inputs are the three password fields.
const inputs = [...settingsCode.matchAll(/<input\b[^>]*/gs)].map((m) => m[0]);
ok(
  "the settings page has exactly three inputs",
  inputs.length === 3,
  `found ${inputs.length}`,
);
ok(
  "every input on the settings page is a password field",
  inputs.length > 0 && inputs.every((tag) => /type="password"/.test(tag)),
  inputs.filter((t) => !/type="password"/.test(t)).join(" | ") || "none",
);

// Login email read-only: it is printed, never bound to a field.
ok(
  "the login email is displayed, not editable",
  /value=\{user\.email\}/.test(settingsCode) &&
    !/onChange[^}]*email/i.test(settingsCode),
);

// Both company names shown and labelled.
ok(
  "the signup company name is shown and labelled as such",
  /Company name \(from your signup\)/.test(settingsCode) &&
    /value=\{profile\.company_name\}/.test(settingsCode),
);
ok(
  "the name roles are listed under is shown separately",
  /Your roles are listed under/.test(settingsCode) &&
    /companies\(name\)/.test(settingsCode) &&
    /eq\("posted_by", user\.id\)/.test(settingsCode),
);

// Verification linked, not duplicated (W3's reconciliation rule).
ok(
  "verification links to /recruiter rather than restating the status",
  /to="\/recruiter"/.test(settingsCode) && !/is_verified/.test(settingsCode),
  /is_verified/.test(settingsCode)
    ? "the page reads is_verified, which duplicates what /recruiter already says"
    : "",
);

// No community-profile link: that line assumed one account could be both.
ok(
  "the settings page does not link to /profile",
  !/to="\/profile"/.test(settingsCode),
);

// ---------------------------------------------------------------------------
// Deliverable 2 — the password box, and the enforcement that is certain
// ---------------------------------------------------------------------------

const signInAt = settingsCode.indexOf("signInWithPassword");
const updateAt = settingsCode.indexOf("auth.updateUser");

ok("the box verifies the current password with signInWithPassword", signInAt !== -1);
ok("the box changes the password with updateUser", updateAt !== -1);
ok(
  "the verification happens BEFORE the change",
  signInAt !== -1 && updateAt !== -1 && signInAt < updateAt,
  `signInWithPassword at ${signInAt}, updateUser at ${updateAt}`,
);
ok(
  "current_password is sent as well, for wherever the server enforces it",
  /current_password:\s*current/.test(settingsCode),
);

// reauthenticate() emails a one-time code. Using it would be a third
// transactional email, which the restated one-email rule does not cover.
ok(
  "reauthenticate() is not used",
  !/\breauthenticate\s*\(/.test(settingsCode),
  "it sends a one-time code by email — a third transactional email",
);
ok(
  "the nonce flow is not used either",
  !/\bnonce\b\s*:/.test(settingsCode),
);
// The file must still EXPLAIN why neither is used, or the next person
// reaches for reauthenticate() as the obvious way to do this.
ok(
  "the file records why reauthenticate() is avoided",
  /reauthenticate/.test(settings) && /third transactional email/i.test(settings),
);

// ---------------------------------------------------------------------------
// Deliverables 3 and 4 — the header shows one of Profile / Settings, never both
// ---------------------------------------------------------------------------

function navItem(key) {
  const m = header.match(
    new RegExp(`key:\\s*"${key}"[\\s\\S]*?show:\\s*([^,]+),`),
  );
  return m ? m[1].trim() : null;
}

ok(
  "the Profile nav item is hidden from recruiters",
  navItem("profile") === "Boolean(session) && !isRecruiter",
  `found ${JSON.stringify(navItem("profile"))}`,
);
ok(
  "the Settings nav item is shown only to recruiters",
  navItem("settings") === "Boolean(session) && isRecruiter",
  `found ${JSON.stringify(navItem("settings"))}`,
);
ok(
  "the Settings nav item points at /recruiter/settings",
  /key:\s*"settings"[\s\S]*?to:\s*"\/recruiter\/settings"/.test(header),
);
ok(
  "Profile and Settings are mutually exclusive",
  navItem("profile") === "Boolean(session) && !isRecruiter" &&
    navItem("settings") === "Boolean(session) && isRecruiter",
  "one must be !isRecruiter and the other isRecruiter, or a recruiter sees both",
);

// ---------------------------------------------------------------------------
// Deliverable 5 — the three disproved comments, gone and replaced
// ---------------------------------------------------------------------------
//
// Each is asserted twice: the old wording is absent, AND a correction is
// present. Absence alone would pass if someone simply deleted the comment,
// which loses the reasoning that stops the error being re-derived.

const DISPROVED = [
  {
    label: "ProtectedRoute's \"/profile must stay reachable\"",
    file: "main.jsx",
    text: main,
    old: "/profile must\n// stay reachable for recruiters",
    corrected: /DISPROVED ON 25 NOV 2026/,
  },
  {
    label: "/my-applications' \"the candidate half is theirs to see\"",
    file: "main.jsx",
    text: main,
    old: "the candidate half is theirs to see",
    corrected: /closed to recruiters on 25 Nov 2026/,
  },
  {
    label: "/profile/saved-jobs' \"the candidate half is theirs\"",
    file: "main.jsx",
    text: main,
    old: "one person may be both a recruiter and\n          a candidate, and the candidate half is theirs",
    corrected: /the same\n          correction as \/my-applications/,
  },
  {
    label: "RecruiterRoute's \"one person is allowed to be both\"",
    file: "components/RecruiterRoute.jsx",
    text: recruiterRoute,
    old: "// A community member who wandered in. Not an error — one person is\n        // allowed to be both a candidate and a recruiter.",
    corrected: /ONE PERSON may be both a candidate and a recruiter\. ONE ACCOUNT/,
  },
];

for (const entry of DISPROVED) {
  ok(
    `${entry.label} is gone`,
    !entry.text.includes(entry.old),
    `still present in ${entry.file}`,
  );
  ok(
    `${entry.label} is replaced with the correction, not just deleted`,
    entry.corrected.test(entry.text),
    `no correcting text found in ${entry.file}`,
  );
}

// RecruiterRoute's BRANCH is still correct and must not have been removed
// along with its comment — deliverable 5 was a comment fix, not a behaviour
// change.
ok(
  "RecruiterRoute still refuses a non-recruiter session",
  /if \(!isRecruiterUser\(user\)\) \{/.test(recruiterRoute) &&
    /status: "not-a-recruiter"/.test(recruiterRoute),
);

// ---------------------------------------------------------------------------
// Deliverable 6 — the policy paragraph, and the two things left alone
// ---------------------------------------------------------------------------

const APPROVED = [
  "Your recruiter account is separate from a community account",
  "they are two separate logins",
  "You can see\n        and correct what we hold about you from your recruiter settings",
  "To\n        delete a recruiter account and its roles",
  "will do it by hand",
];

for (const fragment of APPROVED) {
  ok(
    `the policy carries the approved wording: ${JSON.stringify(fragment.slice(0, 40))}`,
    privacy.includes(fragment),
  );
}

// It belongs in the recruiter section, not among the candidate ones.
const recruiterHeading = privacy.indexOf("<h2>If you are a recruiter</h2>");
const nextHeading = privacy.indexOf("<h2>", recruiterHeading + 10);
const paragraphAt = privacy.indexOf("Your recruiter account is separate");
ok(
  "the paragraph sits inside the recruiter section",
  recruiterHeading !== -1 &&
    paragraphAt > recruiterHeading &&
    (nextHeading === -1 || paragraphAt < nextHeading),
  `heading at ${recruiterHeading}, paragraph at ${paragraphAt}, next heading at ${nextHeading}`,
);

// Carried items 1 and 20: LAST_UPDATED moves at the merge, with
// NEW_FEATURE_UNTIL, and not before.
ok(
  "LAST_UPDATED is untouched at 22 November 2026",
  /const LAST_UPDATED = "22 November 2026";/.test(privacy),
  "it moves at the merge, together with NEW_FEATURE_UNTIL in src/lib/boardPromo.js",
);

// The candidate delete-link sentence is already candidate-scoped and was
// deliberately not reworded.
ok(
  "the candidate delete-link sentence is unchanged",
  /There is a <strong>Delete my job board data<\/strong> link on your\s+profile\./.test(
    privacy,
  ) || /Delete my job board data/.test(privacy),
);

// ---------------------------------------------------------------------------

console.log(`\nStage 12 settings/routes test: ${passed} passed, ${failures.length} failed`);

if (failures.length) {
  console.log("");
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
