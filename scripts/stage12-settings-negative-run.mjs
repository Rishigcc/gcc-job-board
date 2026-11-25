// ===========================================================================
// THE NEGATIVE RUN for scripts/stage12-settings-test.mjs.
//
// Copies src/ to a temp directory, applies ONE breaking mutation, runs the
// suite against the copy, and asserts that it fails AND fails on the right
// assertion. A mutation the suite does not notice is an assertion that
// cannot fail.
//
//   node scripts/stage12-settings-negative-run.mjs
//
// WHY THIS FILE EXISTS. Four checks have shipped broken on this project: one
// that could not fail, one that could not pass, eight that could not be
// read, and one that compared pg_get_function_identity_arguments() to a bare
// type. The rule that came out of the fourth is that a check must be PROVED
// against a subject, because a check has two failure modes — passing when it
// should fail, and failing when it should pass — and NEITHER IS VISIBLE FROM
// READING IT.
//
// The settings suite is static, so its subjects are files, which means the
// proof can be automated rather than reasoned about: break the thing, and
// see the check go red. It found two real faults in the suite on its first
// run, both of them checks that were matching the prose of a comment instead
// of the code it described.
//
// Re-run it after editing either file. A mutation reported as "MUTATION
// CHANGED NOTHING" means its anchor text has moved, not that the code is
// fine — fix the anchor.
// ===========================================================================
//
// Each mutant below is one deliberate break.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// Resolved from this file's own location, so the harness runs from anywhere
// and on any machine rather than from one hardcoded checkout.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE = join(REPO, "scripts/stage12-settings-test.mjs");

// Each mutant: [label, file, find, replace, expected text in the failure]
const MUTANTS = [
  // --- deliverable 4: the seven ------------------------------------------
  ...[
    ["/profile", 'path="/profile"'],
    ["/profile/asked", 'path="/profile/asked"'],
    ["/profile/saved", 'path="/profile/saved"'],
    ["/profile/saved-jobs", 'path="/profile/saved-jobs"'],
    ["/profile/delete-data", 'path="/profile/delete-data"'],
    ["/my-applications", 'path="/my-applications"'],
    ["/ask", 'path="/ask"'],
  ].map(([route, anchor]) => [
    `guard removed from ${route}`,
    "main.jsx",
    (s) => {
      const at = s.indexOf(anchor);
      const head = s.slice(0, at);
      const tail = s.slice(at).replace("<ProtectedRoute blockRecruiters>", "<ProtectedRoute>");
      return head + tail;
    },
    `${route} is a ProtectedRoute with blockRecruiters`,
  ]),
  [
    "guard removed from /welcome",
    "main.jsx",
    (s) => {
      const at = s.indexOf('path="/welcome"');
      return (
        s.slice(0, at) +
        s.slice(at).replace("<ProtectedRoute blockRecruiters>", "<ProtectedRoute>")
      );
    },
    "/welcome keeps blockRecruiters",
  ],
  [
    "guard added to /admin",
    "main.jsx",
    (s) => {
      const at = s.indexOf('path="/admin"');
      return (
        s.slice(0, at) +
        s.slice(at).replace("<ProtectedRoute>", "<ProtectedRoute blockRecruiters>")
      );
    },
    "/admin is deliberately not blocked",
  ],
  // --- deliverable 3: route and page -------------------------------------
  [
    "settings route removed",
    "main.jsx",
    (s) => s.replace('path="/recruiter/settings"', 'path="/recruiter/settings-x"'),
    "/recruiter/settings exists and is inside RecruiterRoute",
  ],
  [
    "settings route moved outside RecruiterRoute",
    "main.jsx",
    (s) => {
      const at = s.indexOf('path="/recruiter/settings"');
      return (
        s.slice(0, at) +
        s.slice(at).replace("<RecruiterRoute>", "<ProtectedRoute>")
      );
    },
    "/recruiter/settings exists and is inside RecruiterRoute",
  ],
  [
    "import path lower-cased",
    "main.jsx",
    (s) => s.replace('"./Pages/RecruiterSettings.jsx"', '"./pages/RecruiterSettings.jsx"'),
    "RecruiterSettings is imported with the real directory case",
  ],
  [
    "a fourth, editable input added",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace('<input\n              id="current-password"', '<input type="text" id="company" />\n            <input\n              id="current-password"'),
    "the settings page has exactly three inputs",
  ],
  [
    "a password field turned into a text field",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace('type="password"\n              autoComplete="current-password"', 'type="text"\n              autoComplete="current-password"'),
    "every input on the settings page is a password field",
  ],
  [
    "login email made editable",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("<Field label=\"Login email\" value={user.email} />", "<input type=\"password\" onChange={(e) => setEmail(e.target.value)} />"),
    "the login email is displayed, not editable",
  ],
  [
    "the signup company-name label dropped",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace('label="Company name (from your signup)"', 'label="Company name"'),
    "the signup company name is shown and labelled as such",
  ],
  [
    "the posted-under company name dropped",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("Your roles are listed under", "Company"),
    "the name roles are listed under is shown separately",
  ],
  [
    "verification status duplicated onto settings",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("<ChangePasswordBox", "<p>{profile.is_verified ? 'Verified' : 'Not yet'}</p>\n        <ChangePasswordBox"),
    "verification links to /recruiter rather than restating the status",
  ],
  [
    "a community-profile link added back",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace('<Link\n            to="/recruiter"', '<Link\n            to="/profile"'),
    "the settings page does not link to /profile",
  ],
  // --- deliverable 2: the password box -----------------------------------
  [
    "current-password check removed",
    "Pages/RecruiterSettings.jsx",
    (s) =>
      s.replace(
        /const \{ error: signInError \} = await supabase\.auth\.signInWithPassword\(\{[\s\S]*?\}\);/,
        "const signInError = null;",
      ),
    "the box verifies the current password with signInWithPassword",
  ],
  [
    "verification moved AFTER the change",
    "Pages/RecruiterSettings.jsx",
    (s) => {
      const signIn = s.match(
        /    \/\/ STEP 1[\s\S]*?      return;\n    \}\n/,
      );
      if (!signIn) throw new Error("step 1 block not found");
      const without = s.replace(signIn[0], "");
      return without.replace(
        "    setCurrent(\"\");",
        signIn[0] + "    setCurrent(\"\");",
      );
    },
    "the verification happens BEFORE the change",
  ],
  [
    "current_password no longer sent",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("current_password: current,\n      password: next,", "password: next,"),
    "current_password is sent as well",
  ],
  [
    "reauthenticate() actually called",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("    setBusy(true);", "    setBusy(true);\n    await supabase.auth.reauthenticate();"),
    "reauthenticate() is not used",
  ],
  [
    "the nonce flow used",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace("current_password: current,", "current_password: current,\n      nonce: '123456',"),
    "the nonce flow is not used either",
  ],
  [
    "the reasoning about reauthenticate deleted",
    "Pages/RecruiterSettings.jsx",
    (s) => s.replace(/\/\/ DELIBERATELY NOT USED[\s\S]*?same reason\./, ""),
    "the file records why reauthenticate() is avoided",
  ],
  // --- the header --------------------------------------------------------
  [
    "Profile nav shown to recruiters again",
    "components/SiteHeader.jsx",
    (s) => {
      const at = s.indexOf('key: "profile"');
      return (
        s.slice(0, at) +
        s
          .slice(at)
          .replace("show: Boolean(session) && !isRecruiter,", "show: Boolean(session),")
      );
    },
    "the Profile nav item is hidden from recruiters",
  ],
  [
    "Settings nav shown to everyone",
    "components/SiteHeader.jsx",
    (s) => {
      const at = s.indexOf('key: "settings"');
      return (
        s.slice(0, at) +
        s
          .slice(at)
          .replace("show: Boolean(session) && isRecruiter,", "show: Boolean(session),")
      );
    },
    "the Settings nav item is shown only to recruiters",
  ],
  [
    "Settings nav pointed elsewhere",
    "components/SiteHeader.jsx",
    (s) => {
      const at = s.indexOf('key: "settings"');
      return s.slice(0, at) + s.slice(at).replace('to: "/recruiter/settings",', 'to: "/profile",');
    },
    "the Settings nav item points at /recruiter/settings",
  ],
  // --- deliverable 5: the comments ---------------------------------------
  [
    "ProtectedRoute's old comment restored",
    "main.jsx",
    (s) =>
      s.replace(
        /\/\/ `blockRecruiters` is opt-in[\s\S]*?decision 10 was written for\./,
        "// Deliberately opt-in, not applied to every protected route: /profile must\n// stay reachable for recruiters.",
      ),
    "is gone",
  ],
  [
    "ProtectedRoute's comment deleted rather than corrected",
    "main.jsx",
    (s) =>
      s.replace(
        /\/\/ `blockRecruiters` is opt-in[\s\S]*?decision 10 was written for\./,
        "// Opt-in guard.",
      ),
    "is replaced with the correction, not just deleted",
  ],
  [
    "/my-applications' old comment restored",
    "main.jsx",
    (s) =>
      s.replace(
        /\{\/\* The candidate's own applications, and one of the seven routes[\s\S]*?entire page\. \*\/\}/,
        "{/* The candidate's own applications. ProtectedRoute without\n          blockRecruiters: one person may be both a candidate and a\n          recruiter, and the candidate half is theirs to see. */}",
      ),
    "the candidate half is theirs to see",
  ],
  [
    "/profile/saved-jobs' old comment restored",
    "main.jsx",
    (s) =>
      s.replace(
        /\{\/\* Saved roles, closed to recruiters on 25 Nov 2026[\s\S]*?not done here\. \*\/\}/,
        "{/* Saved roles. ProtectedRoute without blockRecruiters, for the same\n          reason /my-applications is: one person may be both a recruiter and\n          a candidate, and the candidate half is theirs. */}",
      ),
    "is gone",
  ],
  [
    "RecruiterRoute's old comment restored",
    "components/RecruiterRoute.jsx",
    (s) =>
      s.replace(
        /\/\/ A community member who wandered in\. Not an error, and the branch[\s\S]*?blockRecruiters in main\.jsx\./,
        "// A community member who wandered in. Not an error — one person is\n        // allowed to be both a candidate and a recruiter.",
      ),
    "is gone",
  ],
  [
    "RecruiterRoute's branch removed with its comment",
    "components/RecruiterRoute.jsx",
    (s) =>
      s.replace(
        /if \(!isRecruiterUser\(user\)\) \{[\s\S]*?return;\n      \}/,
        "",
      ),
    "RecruiterRoute still refuses a non-recruiter session",
  ],
  // --- the route-link sweep, and decision F -----------------------------
  [
    "a NEW file links to a closed route, unclassified",
    "+components/RecruiterShortcut.jsx",
    () =>
      'import { Link } from "react-router-dom";\n' +
      'function RecruiterShortcut() {\n' +
      '  return <Link to="/my-applications">My applications</Link>;\n' +
      '}\n' +
      'export default RecruiterShortcut;\n',
    "links to a closed route and is classified",
  ],
  [
    "the footer's Profile link made unconditional again",
    "components/Footer.jsx",
    (s) =>
      s.replace(
        /\{isRecruiter \? \([\s\S]*?\n                    \)\}/,
        `<Link
                      to="/profile"
                      className="text-slate-600 transition hover:text-blue-600"
                    >
                      Profile
                    </Link>`,
      ),
    "the footer offers Settings to a recruiter",
  ],
  [
    "the footer stops asking the recruiter question at all",
    "components/Footer.jsx",
    (s) =>
      s
        .replace('import { isRecruiterUser } from "../lib/accountType";\n', "")
        .replace(
          "const isRecruiter = session ? isRecruiterUser(session.user) : false;",
          "const isRecruiter = false;",
        ),
    "is gated, so it asks the recruiter question",
  ],
  [
    "the Ask button un-gated on /questions",
    "Pages/Questions.jsx",
    (s) =>
      s
        .replace('import { useViewer, showsCandidateControls } from "../lib/useViewer";\n', "")
        .replace("const viewer = useViewer();\n  const canAsk = showsCandidateControls(viewer);", "const canAsk = true;"),
    "is gated, so it asks the recruiter question",
  ],
  [
    "showsCandidateControls no longer used on /questions",
    "Pages/Questions.jsx",
    (s) => s.replace("showsCandidateControls(viewer)", "!viewer.isRecruiter"),
    "Pages/Questions.jsx decides candidate controls through showsCandidateControls()",
  ],
  [
    "the Save control returned to the board list",
    "Pages/GccJobs.jsx",
    (s) =>
      s.replace(
        /save=\{\s*canSave\s*\?\s*\{/,
        "save={{",
      ),
    "the board list withholds the Save control from a recruiter",
  ],
  [
    "the Save control returned to the detail page",
    "Pages/GccJobDetail.jsx",
    (s) => s.replace("{canSave ? (\n                  <SaveJobButton", "{true ? (\n                  <SaveJobButton"),
    "the job detail page withholds the Save control from a recruiter",
  ],
  [
    "the viewer-resolved requirement dropped",
    "lib/useViewer.js",
    (s) =>
      s.replace(
        "return viewer.resolved && !viewer.isRecruiter;",
        "return !viewer.isRecruiter;",
      ),
    "showsCandidateControls requires the viewer to be resolved",
  ],
  // --- the question-card Save control, and carried item 30 --------------
  [
    "canSave given a default of true",
    "components/QuestionCard.jsx",
    (s) => s.replace("\n  canSave,\n", "\n  canSave = true,\n"),
    "QuestionCard takes canSave with no default",
  ],
  [
    "the Save control un-gated on a question card",
    "components/QuestionCard.jsx",
    (s) => s.replace("{canSave ? (\n        <div className=\"relative\">", '<div className="relative">'),
    "QuestionCard renders its Save control only when canSave",
  ],
  [
    "the hearts gated too",
    "components/QuestionCard.jsx",
    (s) =>
      s.replace(
        '          <button\n            type="button"\n            onClick={(e) => handleHeartToggle(e, question.id)}',
        '          {canSave ? (\n          <button\n            type="button"\n            onClick={(e) => handleHeartToggle(e, question.id)}',
      ),
    "only the Save control is gated, not the hearts",
  ],
  [
    "/questions stops passing canSave",
    "Pages/Questions.jsx",
    (s) => s.replace("                canSave={canAsk}\n", ""),
    "Pages/Questions.jsx passes canSave to QuestionCard",
  ],
  [
    "/questions passes canSave unconditionally",
    "Pages/Questions.jsx",
    (s) => s.replace("canSave={canAsk}", "canSave"),
    "Pages/Questions.jsx passes canSave to QuestionCard",
  ],
  [
    "a NEW page renders QuestionCard without canSave",
    "+Pages/TopQuestions.jsx",
    () =>
      'import QuestionCard from "../components/QuestionCard";\n' +
      'function TopQuestions({ question, interactions }) {\n' +
      '  return <QuestionCard question={question} interactions={interactions} />;\n' +
      '}\n' +
      'export default TopQuestions;\n',
    "the QuestionCard call sites are the three expected ones",
  ],
  [
    "the detail page's Save control un-gated",
    "Pages/QuestionDetail.jsx",
    (s) => s.replace('{canSave ? (\n                    <div className="relative">', '<div className="relative">'),
    "the question detail page gates its Save control",
  ],
  [
    "the Community column hidden on mobile again",
    "components/Footer.jsx",
    (s) => {
      const at = s.indexOf("              Community\n");
      const before = s.slice(0, at);
      const open = before.lastIndexOf("<div>");
      return s.slice(0, open) + '<div className="hidden md:block">' + s.slice(open + "<div>".length);
    },
    "the Community column is visible at every width",
  ],
  [
    "the Explore column shown on mobile without a decision",
    "components/Footer.jsx",
    (s) => {
      const at = s.indexOf("              Explore\n");
      const before = s.slice(0, at);
      const open = before.lastIndexOf('<div className="hidden md:block">');
      return s.slice(0, open) + "<div>" + s.slice(open + '<div className="hidden md:block">'.length);
    },
    "the Explore column stays desktop-only",
  ],
  [
    "the join-mode state dropped from the community link",
    "components/Footer.jsx",
    (s) => s.replace('state={{ mode: "join" }}', ""),
    "the footer's community link still asks for JOIN mode",
  ],
  // --- W1 and W2 ---------------------------------------------------------
  [
    "the gate panel reverts to 'verify your company'",
    "Pages/RecruiterApplications.jsx",
    (s) => s.replace("verify your account", "verify your company"),
    "calls the verified thing an account, not a company",
  ],
  [
    "the dashboard banner reverts to 'Your company is verified'",
    "Pages/RecruiterHome.jsx",
    (s) => s.replace("Your account is verified", "Your company is verified"),
    "calls the verified thing an account, not a company",
  ],
  [
    "the terms heading reverts to 'Company verification'",
    "Pages/RecruiterTerms.jsx",
    (s) => s.replace("<h2>4. Account verification</h2>", "<h2>4. Company verification</h2>"),
    "calls the verified thing an account, not a company",
  ],
  [
    "the wording is deleted rather than corrected",
    "Pages/RecruiterApplications.jsx",
    (s) => s.replace("Please verify your account to see candidate details.", ""),
    "the gate panel says 'verify your account'",
  ],
  [
    "the Verified chip replaced by a sentence again",
    "Pages/RecruiterJobs.jsx",
    (s) =>
      s.replace(
        /\{isRecruiterPlaceholder\}/,
        "",
      ).replace(
        "                <span className=\"rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white\">\n                  Verified\n                </span>",
        "Your account is verified, so there is no limit on live roles.",
      ),
    "My jobs shows a Verified chip",
  ],
  [
    "the no-limit fact dropped from the posting form",
    "components/JobForm.jsx",
    (s) => s.replace("<strong>Verification removes the limit entirely.</strong> Reply", "Reply"),
    "an unverified recruiter still meets the no-limit fact on the posting form",
  ],
  [
    "the no-limit fact dropped from the dashboard banner",
    "Pages/RecruiterHome.jsx",
    (s) =>
      s.replace(
        /There's no limit on how many\n              roles you can have live at once\./,
        "",
      ),
    "a verified recruiter still has it on the dashboard banner",
  ],
  [
    "the unverified slot counter removed with the chip change",
    "Pages/RecruiterJobs.jsx",
    (s) => s.replace("Closing a role, or letting one expire, frees a slot.", ""),
    "the unverified slot counter is untouched",
  ],
  // --- the recruiter sign-in entrance ------------------------------------
  [
    "the sign-in route is removed",
    "main.jsx",
    (s) => s.replace('path="/recruiter/sign-in"', 'path="/recruiter/sign-in-x"'),
    "the route exists and opens the Sign in tab",
  ],
  [
    "the route stops preselecting the Sign in tab",
    "main.jsx",
    (s) => s.replace('<PostAJob initialMode="signin" />', "<PostAJob />"),
    "the route exists and opens the Sign in tab",
  ],
  [
    "the sign-in route is wrapped in RecruiterRoute",
    "main.jsx",
    (s) =>
      s.replace(
        '        path="/recruiter/sign-in"\n        element={<PostAJob initialMode="signin" />}',
        '        path="/recruiter/sign-in"\n        element={\n          <RecruiterRoute>\n            <PostAJob initialMode="signin" />\n          </RecruiterRoute>\n        }',
      ),
    "the sign-in route is outside RecruiterRoute",
  ],
  [
    "the tab goes back to hardcoded signup",
    "Pages/PostAJob.jsx",
    (s) =>
      s.replace(
        'const [mode, setMode] = useState(initialMode === "signin" ? "signin" : "signup");',
        'const [mode, setMode] = useState("signup");',
      ),
    "the tab honours it instead of hardcoding signup",
  ],
  [
    "initialMode defaults to signin, changing /post-a-job",
    "Pages/PostAJob.jsx",
    (s) =>
      s.replace(
        'function PostAJob({ initialMode = "signup" })',
        'function PostAJob({ initialMode = "signin" })',
      ),
    "PostAJob takes initialMode and defaults to signup",
  ],
  [
    "the sign-in route loses its noindex",
    "Pages/PostAJob.jsx",
    (s) =>
      s.replace(
        '          path="/recruiter/sign-in"\n          noindex\n',
        '          path="/recruiter/sign-in"\n',
      ),
    "the sign-in route is noindex",
  ],
  [
    "/post-a-job becomes noindex",
    "Pages/PostAJob.jsx",
    (s) =>
      s.replace(
        '          path="/post-a-job"\n        />',
        '          path="/post-a-job"\n          noindex\n        />',
      ),
    "and /post-a-job is still indexable",
  ],
  [
    "both routes claim the same canonical path",
    "Pages/PostAJob.jsx",
    (s) => s.replace('path="/recruiter/sign-in"\n          noindex', 'path="/post-a-job"\n          noindex'),
    "the head follows the route rather than the component",
  ],
  [
    "the community sign-in page loses the recruiter line",
    "Pages/Signup.jsx",
    (s) =>
      s.replace(
        /\s*Recruiter accounts are separate from community accounts\.\{" "\}/,
        "",
      ),
    "and it says WHY, not just where",
  ],
  [
    "the footer's recruiter link moves to the signed-IN branch",
    "components/Footer.jsx",
    (s) => {
      const link = s.match(
        /\n                  <li>\n                    <Link\n                      to="\/recruiter\/sign-in"[\s\S]*?<\/li>\n/,
      );
      if (!link) throw new Error("footer recruiter link not found");
      return s
        .replace(link[0], "\n")
        .replace(
          '                  <li className="hidden md:block">\n                    {isRecruiter ? (',
          link[0].trimEnd() +
            '\n                  <li className="hidden md:block">\n                    {isRecruiter ? (',
        );
    },
    "the footer's recruiter link is SIGNED-OUT ONLY",
  ],
  [
    "a recruiter sign-in item is added to the header",
    "components/SiteHeader.jsx",
    (s) =>
      s.replace(
        '      key: "settings",',
        '      key: "recruiter-signin",\n      label: "Recruiter sign in",\n      to: "/recruiter/sign-in",\n      show: true,\n      icon: <circle cx="12" cy="12" r="3" />,\n    },\n    {\n      key: "settings",',
      ),
    "there is no recruiter sign-in item in the header",
  ],
  // --- deliverable 6: the policy ----------------------------------------
  [
    "the approved paragraph reworded",
    "Pages/Privacy.jsx",
    (s) => s.replace("Your recruiter account is separate from a community account", "Your recruiter account is a separate account"),
    "the policy carries the approved wording",
  ],
  [
    "the by-hand deletion promise dropped",
    "Pages/Privacy.jsx",
    (s) => s.replace("will do it by hand", "will consider it"),
    "the policy carries the approved wording",
  ],
  [
    "the paragraph moved out of the recruiter section",
    "Pages/Privacy.jsx",
    (s) => {
      const para = s.match(/      <p>\n        Your recruiter account is separate[\s\S]*?<\/p>\n/);
      if (!para) throw new Error("paragraph not found");
      return s.replace(para[0], "").replace("      <h2>If you are a recruiter</h2>", para[0] + "      <h2>If you are a recruiter</h2>");
    },
    "the paragraph sits inside the recruiter section",
  ],
  [
    "LAST_UPDATED bumped early",
    "Pages/Privacy.jsx",
    (s) => s.replace('const LAST_UPDATED = "22 November 2026";', 'const LAST_UPDATED = "25 November 2026";'),
    "LAST_UPDATED is untouched at 22 November 2026",
  ],
];

let caught = 0;
const missed = [];

for (const [label, file, mutate, expected] of MUTANTS) {
  const dir = mkdtempSync(join(tmpdir(), "mutant-"));
  const src = join(dir, "src");
  cpSync(join(REPO, "src"), src, { recursive: true });

  // A leading "+" means the mutation CREATES this file rather than editing
  // one, which is how the sweep is proved against a link that does not exist
  // yet -- the case it is really there to catch.
  const creating = file.startsWith("+");
  const path = join(src, creating ? file.slice(1) : file);
  const before = creating ? "" : readFileSync(path, "utf8");
  let after;
  try {
    after = typeof mutate === "function" ? mutate(before) : before;
  } catch (err) {
    missed.push(`${label} — MUTATION ITSELF FAILED: ${err.message}`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  if (after === before) {
    missed.push(`${label} — MUTATION CHANGED NOTHING (the anchor no longer matches)`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  writeFileSync(path, after);

  let output = "";
  let failed = false;
  try {
    output = execFileSync("node", [SUITE], {
      env: { ...process.env, SRC_ROOT: src },
      encoding: "utf8",
    });
  } catch (err) {
    failed = true;
    output = (err.stdout || "") + (err.stderr || "");
  }

  rmSync(dir, { recursive: true, force: true });

  if (!failed) {
    missed.push(`${label} — SUITE STILL PASSED`);
    continue;
  }

  if (!output.includes(expected)) {
    missed.push(`${label} — failed, but not on "${expected}"`);
    continue;
  }

  caught += 1;
  console.log(`  caught   ${label}`);
}

console.log(`\nNegative run: ${caught}/${MUTANTS.length} mutations caught`);

if (missed.length) {
  console.log("");
  for (const m of missed) console.log(`  MISSED   ${m}`);
  process.exit(1);
}
