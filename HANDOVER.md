# HANDOVER — iWorkAtGCC job board, stage 12

Written 25 November 2026 and **refreshed the same day**, after the
consolidation and the reset flow were signed off. For someone picking this
up with no prior context.

Read this file, then `JOB-BOARD-TEST-DATA.md` — that is the project's real
memory and it is long. This file is the map; that file is the territory.

---

## 1. What this is

`iworkatgcc.com` is a live Q&A community of about **2,650 accounts** for
professionals at India's Global Capability Centres. A **direct job board** is
being added to it: recruiters post roles themselves at `/gcc-jobs`, candidates
apply with a resume. All of it is on the branch `job-board`.

**Rishi Nigam owns the site and is not a developer.** His words: *"I can read
code and follow instructions, but I cannot review a large diff and spot a
mistake."* That single fact shapes every working rule below.

**Nothing has been merged to `main`. Nothing is live.** The whole board exists
only on the branch and its Vercel preview.

---

## 2. The working rules — follow these exactly

These are not preferences. Several were earned by breaking something.

1. **All work on `job-board`. Never commit to `main`.**
2. **Nothing goes live until every stage is done.** Testing happens on the
   branch's Vercel preview; there is one deliberate merge at the end.
3. **Build one stage, then stop.** Never mark a stage complete — **he does,
   in writing.** If he reports something broken, that is still the current
   stage.
4. **Push before handing over a checklist.** *"'Built but not committed' is
   not testable for me."*
5. **End every stage with a numbered checklist**, each step marked
   **[CHECK]** (one correct answer) or **[DECIDE]** (needs his judgement),
   written so a non-developer can follow it without deciding anything.
6. **The Supabase MCP connection is read-only.** Every schema change is a
   migration **he** runs in the SQL editor. Tell him exactly what to run and
   what he should see.
7. **Migration checks must return a result table**, one row per check with
   the figures in a `detail` column — not `raise notice`, which the Supabase
   SQL editor does not display at all.
8. **Dry-run every migration read-only before handing it over**, and that
   includes **evaluating what each check asserts**, not just what the
   migration does. Four checks have shipped broken: one that could not fail,
   one that could not pass, eight that could not be read, and one that
   compared `pg_get_function_identity_arguments()` to a bare type. **A check
   meant to pass must be proven to pass against a subject that already
   satisfies it.**
9. **Tell him what is needed before starting, not partway through.**
10. **Brevo sends transactional account-access emails only, both
    user-initiated** — the recruiter signup confirmation and the recruiter
    password reset. Nothing else, ever. No digests, no alerts, no
    notifications. (The community digest and welcome email predate the job
    board and are out of scope.)
11. **Don't invent a visual identity.** He has one — muted plum, mauve and
    warm rose with amber accents — and will supply exact colours at the
    design pass. Until then, plain and consistent.
12. **Keep the list of everything created while testing in production**, for
    the pre-merge clearout. It is in `JOB-BOARD-TEST-DATA.md`.

His preview, the only place he can test:

```
https://gcc-job-board-git-job-board-rishigccs-projects.vercel.app
```

---

## 3. Where the project is

| Stage | State |
|---|---|
| 1–9b | **Signed off** |
| 10 (SEO, findability, saved roles) | **Signed off 25 Nov**, both halves |
| 11 (analytics) | **Deferred to v2.** GA4 already records per-role page views, so what was deferred is a number inside the product, not the ability to measure. **The data is not retroactive** — that is the accepted cost. |
| 12 (recruiter password reset, settings) | **SIGNED OFF 25 Nov. FINAL.** Both retests pass, including the two decisions taken after the sign-off. Nothing in stage 12 is open |

Then: the design pass, the pre-merge clearout, and one merge.

**Nothing is outstanding inside stage 12.** Every stage is signed off except
11, which is deferred to v2. Two decisions were taken after the sign-off and
are built: the **Save control on a question card** is withheld from a
recruiter (hearts deliberately untouched), and **carried item 30** — the
footer's Community column now shows at every width, because
`Join the Community` is the one footer link with no mobile equivalent.

**What is left is not a stage.** See section 9 and the carried-items table in
the tracker: the design pass, the live Markdown defect (item 27), the
clearout, and the production-dependent checks.

**The wording pass is nearly done.** W1, W5 and W6 shipped on 25 Nov; **W7
was closed as superseded** — `Apply Directly` no longer exists anywhere, so
the item described a string that had been removed. **Only W2 remains**, and
it is waiting on his approval of proposed wording, not on build time: the
verified state becomes a plain chip and the "no limit on live roles" fact
moves to the **posting form**, where the cap actually bites.

---

## 4. Stage 12 — six deliverables, three done

| | Deliverable | State |
|---|---|---|
| 1 | **Migration 025** — `public.reset_eligibility_for_email(text)`, the reset gate | **DONE**, run by him, 7 checks + verdict all PASS |
| 1a | **`api/password.js`** — the request endpoint and the landing-page gate | **DONE**, 69 assertions |
| 1b | **`/recruiter/forgot-password`** and **`/recruiter/reset-password`** | **SIGNED OFF 25 Nov** — full flow tested end to end |
| 2 | **The change-password box** | **BUILT.** Verifies the current password **twice** — see below, this is not belt-and-braces |
| 3 | **`/recruiter/settings`** | **BUILT.** Three read-only fields as decided; header shows Settings in place of Profile |
| 4 | **Close seven candidate-only routes to recruiters** | **BUILT.** All seven, asserted individually |
| 5 | **Correct the comments** resting on a disproved premise | **BUILT — there were THREE in `main.jsx`, not two**, plus `RecruiterRoute`'s |
| 6 | **The privacy policy's recruiter paragraph** (approved wording) | **BUILT**, verbatim, in the recruiter section |

**Everything in stage 12 is now built.** Nothing in it added a migration, a
database change or a serverless function — still **10**. What is outstanding
is his test round; the checklist is the one handed over on 25 Nov. The build
record, including the two findings below, is in `JOB-BOARD-TEST-DATA.md`
under "Stage 12 deliverables 2–6".

**READ THIS BEFORE TOUCHING THE CHANGE-PASSWORD BOX.** It calls
`signInWithPassword` with the current password *before* `updateUser`, and
that call is **not redundant**. `current_password` on `updateUser` is
honoured only when `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`
is true — project-wide Auth configuration the browser cannot assert, and
which could not be read from `/auth/v1/settings` or without a Management API
token. **With it off, sending only `current_password` is a gate that compiles,
applies and does nothing**, the same shape as the inert `break-words`. The
sign-in call is the half that is certain to run. `reauthenticate()` is
deliberately unused: it emails a one-time code, which would be a third
transactional email.

**THE RULE DELIVERABLE 4 IS REALLY ABOUT, and it was applied incompletely
twice.** Closing the seven routes is half of it; the other half is that
**nothing offers a recruiter a link to one**. That half was applied at the
header and missed at the **footer**, then applied at the job pages and missed
at **`/questions`** — both found by Rishi or by sweeping after he asked for
one, not by the build. The cause was that three public pages each resolved the
viewer themselves, so the rule lived in whoever remembered it.
**`src/lib/useViewer.js` resolves it once**, `showsCandidateControls()` is the
only question such a control asks, and
`scripts/stage12-settings-test.mjs` now holds a table classifying **every file
that links to one of the seven**. A new link that is not classified fails the
suite. Read that table before adding any link to `/profile`, `/ask` or
`/my-applications`.

**Deliverable 4's trap, and how it went.** `blockRecruiters` already existed
on `ProtectedRoute`; the seven routes are `/profile`, `/profile/asked`,
`/profile/saved`, `/profile/saved-jobs`, `/profile/delete-data`,
`/my-applications` and `/ask`. The scope said **two** of them carried comments
*justifying* their openness with reasoning disproved on 25 November.
**There were three** — `/profile/saved-jobs` was the one the scope missed, and
it is one of the seven, so adding the guard without touching its comment would
have left a comment stating the exact opposite of the line above it. Correcting
them is deliverable 5, and doing it in the same pass is the point, because a
wrong premise left in a comment is how the next person re-derives the error.

**Nothing in stage 12 needed a new serverless function.** The change-password
box is a client call; settings reads through RLS; the blocked routes are client
routing. Still **10** functions.

### The gate's design, in one paragraph

A reset is sent only if the address belongs to an account whose **role** is
eligible **and** which has a **password identity at all**. Role decides
policy and is widened by one line in `eligible_roles`; identity stops a
password being created on an OAuth-only account — the identity-linking risk.
**A later change must not collapse this to the role test**; see invariant I3
in the tracker. Every reply from `/api/password` action `request` is
byte-identical and padded to a 1,200ms floor, so the endpoint cannot be used
to discover who is registered.

---

## 5. The four prerequisites

| | What | Status |
|---|---|---|
| **A** | Supabase Redirect URLs | **DONE.** Four entries: the preview host, `https://www.iworkatgcc.com/**`, `http://localhost:5173/**`, and the existing per-deployment wildcard. Site URL untouched. This also closed carried item 8. |
| **B** | "Password changed" notification off | **DONE.** **Authentication → Emails → Security section**, seven toggles, all already off. The docs name no dashboard control and claim the Management API is the only route — that is wrong, and the dashboard path above is correct. |
| **C** | The reset email template | **DONE.** `supabase/email-templates/reset-recruiter-password.html`, pasted and saved with its subject line. |
| **D** | Brevo log check after the first real send | **DONE 25 Nov.** One send at 11:57, `jobs@iworkatgcc.com` to the recruiter address, with his template. **Nothing** for the nonsense address and **nothing** for the Google account — the identical-reply rule proved where only the sender can prove it. |

**All four prerequisites are closed.** Nothing is waiting on him.

### One outstanding dashboard fix, not in the repo

The reset email arrived with Supabase's **default** subject, "Reset your
password". The subject is a **separate dashboard field** and pasting the body
does not touch it. Fix: Authentication → Emails → Reset Password → the
**Subject** field → `Reset your iWorkAtGCC recruiter password`. **The signup
template has the same trap** and should read "Confirm your iWorkAtGCC
recruiter account". Both are documented in
`supabase/email-templates/reset-recruiter-password.html`'s header.

---

## 6. The serverless function limit — read this before adding a file

**Vercel's Hobby plan allows 12 serverless functions per deployment.** The
project reached 14 on 25 Nov and **the build stopped**. He will not upgrade.

Four merges brought it to **10**, and all four were **signed off on 25 Nov**
— including the two with no automated test, which he verified in the browser
in exactly the way that mattered: he typed one admin action's confirmation
into the other's box to prove they had not crossed.

| File | Actions |
|---|---|
| `api/password.js` | `request`, `may-set` |
| `api/public.js` | `page=job`, `page=sitemap-jobs` (both arrive via `vercel.json` rewrites) |
| `api/admin.js` | `anonymise`, `delete-orphan` |
| `api/my-data.js` | `resume-url`, `delete-resume` |

Unmerged, each for a reason recorded in its file: `delete-my-data.js` (erases
people's data — **if a thirteenth function is ever needed, this is not the
slot to take**), `upload-resume.js` (`bodyParser: false` is per-file),
`resume-url.js` (a recruiter reading a candidate's file — a different
authorisation model), `rebuild.js` and `send-digest.js` (crons **cannot be
tested on a preview at all**), `send-welcome-email.js`.

**THE DISPATCH IS THE CONVENTION, NOT A ONE-OFF.** A new endpoint joins an
existing file as another `action`. Two spare slots are for emergencies, not
for features.

**`vercel.json`'s `functions` key is `api/public.js` and carries
`includeFiles: "dist/app.html"`.** That is what puts the app shell on the
function's filesystem. **Re-key it wrong and every job page answers 503 while
nothing else on the site looks wrong.**

---

## 7. How to run the tests

`npm run build` runs Vite **and** `scripts/prerender.mjs`, which writes 87
pages, `sitemap.xml`, and `dist/app.html`. **`npm run build:spa` empties
`dist/` and does not recreate `app.html`** — only the full build leaves a
complete `dist/`.

Two suites run directly:

```sh
node scripts/stage12-reset-gate-test.mjs     # 69 — hits the live DB, sends nothing
node scripts/check-overflow.mjs              # 18 — needs npm run build first
```

The rest must be **bundled first**, because they import extensionless
modules:

```sh
npx esbuild scripts/stage4-validation-test.mjs --bundle --format=esm \
  --platform=node --packages=external --outfile=/tmp/t.mjs && node /tmp/t.mjs
```

Two more run directly, added 25 Nov:

```sh
node scripts/stage12-settings-test.mjs          # 109 — static, reads src/
node scripts/stage12-settings-negative-run.mjs  # 56 mutations, all must be caught
```

The negative run is the check-the-check rule made executable: it breaks one
thing at a time in a copy of `src/` and asserts the suite fails **on the
right assertion**. **Re-run it after editing `main.jsx`, `SiteHeader.jsx`,
`RecruiterRoute.jsx`, `Privacy.jsx` or `RecruiterSettings.jsx`.** A mutation
reported as "MUTATION CHANGED NOTHING" means its anchor text moved, not that
the code is fine.

Current counts: stage4 **52**, stage5 **42**, stage6 **62**, stage7 **60**,
stage8 **44**, stage9 **90**, stage10 **116 + 111 + 62 + 121**, stage12
**69 + 109**, check-overflow **18**. **stage7 is 60, not 56** — W6 added four. **eslint has exactly 8 pre-existing
errors** — 2 in `Jobs.jsx`, 1 in `Signup.jsx`, 5 in `main.jsx`. That is the
baseline, not a problem to fix.

`npm run build` now writes **88** pages, not 87 — one new community
question.

### What the tests do NOT cover

**Almost none of the serverless endpoints has an automated test.** The suites
cover the **pure modules beside** them. `api/admin.js` and `api/my-data.js`
have no coverage at all and need a human in a browser. See **"KNOWN GAP"** in
the tracker before quoting an assertion count as reassurance.

---

## 8. Traps that have already cost time

- **`current_role` is a reserved SQL keyword.** Alias a column that way and
  you silently get the session role.
- **`pg_get_function_identity_arguments()` returns argument NAMES AND TYPES**
  (`p_email text`). For arity use `pronargs` and `proargtypes`.
- **`has_table_privilege(..., 'insert')` is false for a column-level grant.**
  `public.companies` grants `insert (name, slug)`; use
  `has_column_privilege`.
- **Never infer a column's type from a related one.** `jobs.id` is `bigint`
  but `jobs.company_id` is a `uuid`, because `companies.id` is.
- **New `public` tables get no `service_role` grant by default** in this
  project. A table the server writes needs an explicit grant in the same
  migration. This has caught three stages.
- **A multi-statement script in the Supabase SQL editor is one implicit
  transaction**, so a failure part-way rolls back the whole file, DDL
  included. Say so when a migration fails — it is his first question.
- **A candidate-only control asks `showsCandidateControls(useViewer())`**, and
  `QuestionCard`'s `canSave` has **no default on purpose**: a forgetful call
  site then hides the control rather than showing one that leads nowhere. The
  fail-safe direction is the one that fails loudly.
- **The footer hides four things below 768px** via `hidden md:block`, which is
  **pre-existing and on `main`** (from `f368c95`, eight days before this
  branch). It is not a bug — the header's menu carries all four. The
  **Community** column was the exception and now shows at every width.
- **The pages directory is `src/Pages`, capital P**, and every import says
  `./Pages/`. macOS resolves `src/pages` to it too, so a lower-case import
  builds locally and **fails on Vercel's Linux**.
- **`break-words` is inert on a flex child.** A flex item's `min-width`
  defaults to its min-content size and `overflow-wrap: break-word` does not
  reduce it. `min-w-0` is the other half. **A class can compile, apply, and
  still do nothing** — `scripts/check-overflow.mjs` measures the rendered
  page because of this.
- **The reset flow depends on `flowType: 'implicit'`**, the installed default.
  The reset is initiated server-side, so under PKCE the verifier would be
  generated in a serverless function and thrown away. **Switching the client
  to PKCE breaks the reset silently.**
- **A logged WORDING item is about a string, so search for the string before
  discussing it.** W7 was debated as a live concern and the text it named had
  been deleted a day later in stage 10 round two. Same class as quoting a
  stale count: the note outlived the thing.
- **Changing a shared constant invalidates fixtures in suites you did not
  think to run.** Raising `DESCRIPTION_MIN` to 400 broke 40 of
  `stage4-validation-test.mjs`'s 52 assertions and nobody noticed for a day.
  Run everything after touching a shared module.

---

## 9. Before the merge

`JOB-BOARD-TEST-DATA.md` has the full list.

> **COUNTS IN THAT FILE ARE A RECORD, NOT A SOURCE OF TRUTH.** Every figure
> below was re-derived read-only against live on **25 Nov 2026**, after a
> pre-merge list quoted this file and got the company seed wrong — it had
> been run the day before and a heading still said `NOT YET RUN`. Two other
> figures were stale **in opposite directions**. **Re-derive before acting;
> never adjust a written count.**

- **The clearout** (carried item 13), verified 25 Nov — in order:
  `applications` (**18 rows, all already anonymised**) → **all 27 jobs**, not
  24 → `Test Co A`/`Test Co B` **only** → the two recruiter accounts →
  **both** test Google accounts (`iworkatgcctest2@` *and*
  `iworkatgcctest3@gmail.com`). `candidate_resumes` and the `resumes` bucket
  are **already empty**, so those two steps are no-ops — but check, because
  more testing recreates them.
  - The 27 is the 24 `[T5]` roles **plus three**: job **13**
    `Program manager`, job **41** `trial job`, and job **42**.
  - **`Walmart` must survive the companies step** — job 42 sits under it and
    it is one of the 1,816 real seeded names.
- **Role 42** (a 180-character unbroken title, **under `Walmart`**) is the
  fixture `check-overflow.mjs` drives. **Delete it last**, and expect that
  script to need a new fixture.
- **Item 26** — `alter table public.jobs validate constraint
  jobs_description_check;` **after** the clearout. **Confirmed still
  `NOT VALID`** on 25 Nov.
- **Items 1 and 20 — THREE dates, not two.** `LAST_UPDATED` in
  `src/Pages/Privacy.jsx` (22 Nov) **and in `src/Pages/RecruiterTerms.jsx`
  (16 Nov)**, plus `NEW_FEATURE_UNTIL` in `src/lib/boardPromo.js`
  (`2027-01-19`). Same moment, or the site contradicts itself.
- **Item 27** — a **live defect**: recruiters paste Markdown and
  `/gcc-jobs/:slugId` renders it literally. **One job carries it today**: job
  13, `Program manager`.
- **Item 23** — add a second admin account. **Confirmed exactly one `admin`
  row** on 25 Nov, on a Google-only account.
- **Item 14** — `supabase/post-merge/drop_question_authors.sql`, **after**
  the merge is deployed and verified. **The view is confirmed still present.**
- **The company seed is DONE** — run 24 Nov, 1,816 companies, picker tested
  end to end. Do not re-report it as outstanding.

---

## 10. Things that live nowhere else

- **He runs every migration.** Never assume one has been applied; check with
  the read-only MCP connection. **This was broken on 25 Nov 2026** — a
  pre-merge list reported the company seed as unrun because a heading in the
  tracker still said so, a day after he had run it. **The seed is a migration
  he runs, the rule covered it, and the connection was open in the same
  session.** Anything countable — rows, objects, accounts, constraint
  validity, which migrations exist — is re-derived before it is reported.
- **Decision 10 was amended on 25 Nov.** It used to say `/ask` and `/profile`
  stay reachable for recruiters. **It no longer does:** 0 of 2,656 accounts
  have two identities, and the code and database make a dual-use account
  unreachable. Decision 10 protects a **person** with two logins, not one
  account. Do not re-derive the old reading — the two comments that still
  state it are deliverable 5.
- **The plan page** is a private artifact he reads, kept in step with the
  tracker: `https://claude.ai/artifact/HaQoBgQhig9DR4uUjC1Uqm` (version 20).
  Its source is a scratchpad file, **not in the repo** — a fresh session will
  have to read the artifact to update it.
- **He catches things.** The promo card's inert `break-words`, a faulty
  migration check, an endpoint claim that was wrong, a commit message that
  described work not done. Expect to be corrected, check claims before
  making them, and say plainly when something was wrong rather than quietly
  fixing it.
