# HANDOVER — iWorkAtGCC job board, stage 12

Written 25 November 2026, **refreshed 26 November** after the clearout ran
and the three merge-date edits landed. For someone picking this up with no
prior context.

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

**The clearout has already run** (26 Nov), and **nothing is blocking the
merge.** The design pass is a **v2 item**, decided on 25 Nov — not
outstanding work. `MERGE.md` is the procedure.

**Nothing is outstanding inside stage 12.** Every stage is signed off except
11, which is deferred to v2. Two decisions were taken after the sign-off and
are built: the **Save control on a question card** is withheld from a
recruiter (hearts deliberately untouched), and **carried item 30** — the
footer's Community column now shows at every width, because
`Join the Community` is the one footer link with no mobile equivalent.

**NOTHING IS BLOCKING THE MERGE.** The clearout ran, the three merge dates
are set, items 27 and 29 are built and passed, and P4 is checked. **The
design pass is a v2 item**, decided on 25 Nov — I listed it once as the last
piece of work before the merge, which contradicted the decision recorded in
this file, and Rishi corrected it. The remaining P-checks (P1, P2, P3, P5, P6)
are **post-merge by definition** — they cannot run on a preview.

**`MERGE.md` is the procedure**: eleven numbered steps, the post-merge checks
in the order they have to run, and the rollback paths. Written 26 Nov with
every fact derived from the repo and the live database.

**THE WORDING PASS IS DONE.** W1, W2, W5 and W6 all shipped on 25 Nov, and
**W7 was closed as superseded** — `Apply Directly` no longer exists anywhere,
so the item described a string that had been removed. W3 and W4 closed
earlier. **Nothing in the wording pass is open.**

Two things from it are worth carrying:

- **The verified thing is an ACCOUNT, everywhere.** W1 was scoped as "four
  occurrences" and the concept turned out to live under five different
  phrases in **twelve** places — after the first pass one page said "verify
  your account" and "Your company is verified" in the two branches of one
  condition. The suite now asserts the subject-naming phrases appear in **no**
  `.jsx` file, rather than counting occurrences. "Your company website" and
  "the name of your company" are deliberately untouched: the company is the
  evidence, the account is what gains access.
- **W2 needed no new copy.** The "no limit on live roles" fact was already on
  the posting form (unverified) and `/recruiter`'s banner (verified), so
  shortening the My jobs line to a chip lost nothing. **Both are asserted
  present**, because the risk in shortening a line is losing what it carried.

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

### The dashboard email fixes — ALL CLOSED 25 Nov 2026

**Nothing about the emails is outstanding.** He has re-pasted **both**
templates with **both subject lines**, which closed three things at once: the
default subject trap, the `/recruiter/sign-in` address now in each email, and
W1's wording, which survived in the signup template until 25 Nov because the
templates sit **outside every test in this repo**.

The trap, kept because it recurs on every future edit: **the subject is a
separate dashboard field and pasting the body does not touch it.**
Authentication → Emails → each template → the **Subject** field above the body
editor. They should read `Reset your iWorkAtGCC recruiter password` and
`Confirm your iWorkAtGCC recruiter account`. **Editing a template in the repo
changes nothing until it is re-pasted**, and nothing in the repo can detect
that it has not been.

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

**It also carries `X-Robots-Tag: noindex, nofollow` on `/recruiter` and
`/recruiter/(.*)`**, because **none of `/recruiter/*` is prerendered** — each
is served as the bare `app.html` with no head tags, so the `noindex` was
client-side only while `robots.txt` says `Allow: /`. Added 25 Nov 2026 after
Rishi found that `view-source:` on `/recruiter/sign-in` had no `noindex` at
all.

- **THE SLASH IS LOAD-BEARING.** `/recruiter-terms` is a **public** page and
  matches `/recruiter(.*)` but **not** `/recruiter/(.*)`, so the two patterns
  must never be merged into one.
- **Keep `robots.txt` allowing these paths.** Disallowing them would hide the
  header from the crawler that needs to read it, and a disallowed URL can
  still be indexed as a bare link. Allow the crawl, serve the refusal.
- **NEVER PUT A COMMENT KEY IN `vercel.json`.** A header entry's keys are
  `source`, `headers`, `has`, `missing`. Vercel validates the schema and an
  unknown key risks failing the deployment. Reasoning goes in the tracker.
- **`vite preview` does not read `vercel.json`**, so headers and rewrites
  cannot be tested locally at all. The suite asserts the configuration; the
  live response has to be read in DevTools — **`curl` is 302'd by deployment
  protection** on the preview.
- **VERCEL PUTS `X-Robots-Tag: noindex` ON EVERY PREVIEW DEPLOYMENT ITSELF.**
  So on a preview every page carries a noindex, and "this page has no header"
  is unobservable there. **The VALUE is the discriminator:** ours is
  `noindex, nofollow`, Vercel's is a bare `noindex`, so `nofollow` appears
  only where our pattern matched. **That is a second reason the configured
  value keeps `nofollow`** — collapsing it would make the rule
  indistinguishable from Vercel's and the check unrunnable before production.
  The production-only half is **P6** in the launch checklist.

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
node scripts/stage12-settings-test.mjs          # 209 — static, reads src/
node scripts/stage12-settings-negative-run.mjs  # 80 mutations, all must be caught
node scripts/item27-markdown-negative-run.mjs   # 16 mutations, all must be caught
node scripts/sql-reserved-words-test.mjs        # 64 — scans every .sql file
```

`item27-markdown-test.mjs` (**133**) needs bundling like the stage suites.
**`esbuild` is not a local dependency** — always `npx esbuild`. A harness that
assumed `node_modules/.bin/esbuild` reported all 16 mutations as "did not
bundle" with an empty stderr.

The negative run is the check-the-check rule made executable: it breaks one
thing at a time in a copy of `src/` and asserts the suite fails **on the
right assertion**. **Re-run it after editing `main.jsx`, `SiteHeader.jsx`,
`RecruiterRoute.jsx`, `Privacy.jsx` or `RecruiterSettings.jsx`.** A mutation
reported as "MUTATION CHANGED NOTHING" means its anchor text moved, not that
the code is fine.

Current counts: stage4 **52**, stage5 **42**, stage6 **62**, stage7 **60**,
stage8 **44**, stage9 **90**, stage10 **116 + 111 + 62 + 121**, stage12
**69 + 209**, item 27 **133**, sql-reserved **64**, check-overflow **21**. **stage7 is 60, not 56** — W6 added four. **eslint has exactly 8 pre-existing
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

- **RESERVED WORDS, TWICE NOW, AND THE TWO FAIL DIFFERENTLY.**
  `current_role` as a column alias **does not error at all** — you silently
  get the session role. `check` as a column alias **is accepted after `AS`**
  and then fails at parse time the moment a bare `check` appears in
  `ORDER BY`. **`node scripts/sql-reserved-words-test.mjs`** scans all 53
  `.sql` files against the 101 reserved words from `pg_get_keywords()`; run it
  after writing any SQL. Result tables use the existing convention —
  `label, result, detail`, sorted by a numeric `seq` — which contains no
  reserved word.
- **A CHECKLIST GOES STALE THE SAME WAY A FACT DOES, and it is easier to
  miss.** Half of carried item 29's checklist was obsolete before he ran it:
  four steps described what a recruiter sees on `/profile` and
  `/profile/delete-data`, and stage 12 had closed both routes to recruiters in
  between. Rishi: *"A checklist written before a change that invalidates it is
  the same stale-list problem as the company seed."* **A fact is stale when the
  world moves; a checklist is stale when the world moves in the direction the
  checklist was testing** — so it reads as plausible right up to the step that
  cannot be performed. **Re-derive a checklist against the code as it is now
  before handing it over, not against the code it was written for**, and say
  which steps were dropped so the gap is visible.
- **DRY-RUN THE FILE'S OWN TEXT, not a paraphrase of it.** A dry run that
  reproduced each check's logic in a hand-written query proved every predicate
  right and still handed over a file that would not parse. For a statement the
  read-only connection cannot execute, **`EXPLAIN` it**: parsing precedes the
  privilege check, so **42601 means a syntax error and 42501 means it
  parsed**. Both verified 25 Nov 2026.
- **A SYNTAX ERROR ANYWHERE MEANS NOTHING IN THE FILE RAN.** Postgres parses
  the whole batch before executing any of it, and the SQL editor's implicit
  transaction would roll back the rest regardless. When he reports a parse
  error, the answer to "did part of it apply" is **no** — but check
  `updated_at` and say so from the data.
- **ROUGHLY HALF THE `.sql` FILES HAVE NEVER BEEN PARSED.** Every migration
  ships a `_rollback.sql` that is never run, plus
  `post-merge/drop_question_authors.sql`. A mistake in one of those surfaces
  during a rollback, which is an emergency.
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
- **`/recruiter/sign-in` renders `PostAJob` with `initialMode="signin"`**, and
  the prop defaults to `"signup"` so `/post-a-job` is unchanged. The tab used
  to be hardcoded, so every link opened on *Create account*. The head follows
  the ROUTE, not the component: two routes on one component must not claim the
  same canonical path. **No header item**, by decision, and a test asserts it.
- **THE EMAIL TEMPLATES ARE OUTSIDE EVERY TEST.** They are HTML pasted into
  the Supabase dashboard, so the suites cannot see them — W1's wording survived
  in two of them until 25 Nov for exactly that reason. **A wording change has
  to be applied there by hand, and he has to re-paste both templates for it to
  reach anyone.**
- **A job description is MARKDOWN, parsed once and rendered twice** — React
  elements for the page, an HTML string for the JSON-LD, both from
  `src/lib/descriptionMarkdown.js`. **There is no `dangerouslySetInnerHTML`
  anywhere in `src/` and it must stay that way**; that is the entire injection
  surface for the detail page, and the suite asserts it. A second parser would
  break the rule that the markup says what the page shows.
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

**`MERGE.md` IS THE PROCEDURE.** Eleven steps, derived 26 Nov 2026. Read it
rather than reconstructing the merge from this section, which is now only the
reasoning behind it. Three things in it are load-bearing and easy to miss:

1. **The checks are deliberately NOT in the order they were asked for.** P5
   fires the deploy hook, the hook creates a production deployment, and **on
   Hobby, Vercel's Instant Rollback reaches only the immediately previous
   deployment** — so firing the hook early spends the one rollback slot
   before you have finished looking for reasons to use it. Every read-only
   check comes first.
2. **The instant-rollback window closes by itself at 02:00 UTC**, when the
   nightly cron fires the same hook. After that, rolling back is
   `git revert -m 1` and a rebuild, which is plan-independent but takes
   minutes rather than a second.
3. **Item 14 is last, and it is the only step that makes a rollback
   destructive.** `main`'s `src/lib/authors.js` reads
   `public.question_authors`; the branch's does not. Drop the view and a
   rollback breaks author names for all 2,643 members.

**THE CLEAROUT HAS RUN.** 26 Nov 2026, `CLEAROUT.md`'s procedure, 14 of 15
final-verification rows PASS. The fifteenth is a deliberate decision — Rishi
kept both test Google accounts — not a defect. Full outcome in
`JOB-BOARD-TEST-DATA.md` under "THE CLEAROUT RAN, THE THREE DATES ARE SET, P4
PASSED". **`CLEAROUT.md` itself now documents its own outcome** at the bottom
and does not need re-running.

**Item 1 and 20 (the three dates) are DONE.** `LAST_UPDATED` in
`Privacy.jsx` and `RecruiterTerms.jsx` is **25 November 2026**;
`NEW_FEATURE_UNTIL` in `boardPromo.js` is **`2027-01-20`**, eight weeks past
it. Two suite assertions that had guarded the OLD placeholder values were
rewritten to guard the new ones, because they had been written to fail if the
date moved before the merge — and it has now moved, correctly.

**Item 29 is DONE, passed 26 Nov**, with a lesson worth carrying: half its
checklist was already obsolete when handed over, because stage 12 had closed
the routes it described in between. See the entry two bullets below.

**P4 is checked and passes.** One structural note, not a blocker: see the
entry below.

**What that leaves, as of 26 Nov 2026:**

- **Item 26** — `alter table public.jobs validate constraint
  jobs_description_check;`. **DONE as part of the clearout run** —
  `CLEAROUT.md` step 6, `convalidated = true`, confirmed in step 7's final
  verification.
- **Item 27** — the Markdown-rendering defect itself is **DONE**, built and
  proved (see item 27 in the tracker). The data it was found on is gone after
  the clearout; the fix is in the code, not the row.
- **Item 23** — the second admin account, **deferred to v2**. The Supabase
  SQL editor is an independent way to re-grant the one admin row, and the
  account holding it was confirmed on a different mailbox from the Supabase
  dashboard login, so losing the Google account is recoverable rather than a
  lockout.
- **Item 14** — `supabase/post-merge/drop_question_authors.sql`, **after**
  the merge is deployed and a live question page is confirmed to still show
  author names. Not before.
- **A checklist goes stale the same way a fact does, more invisibly.** A fact
  is stale when the world moves. A checklist is stale when the world moves
  **in the direction the checklist was testing** — so it still reads as
  plausible, right up to the step that cannot be performed. Item 29's
  checklist described a recruiter on `/profile`, which stage 12 had closed to
  recruiters in between. **Re-derive a checklist against the code as it is
  now before handing it over**, not against the code it was written for, and
  say which steps were dropped so the gap is visible rather than silent.
- **`SUPABASE_SERVICE_ROLE_KEY` is two separate Vercel entries**, Production
  (10 Sep) and Preview (18 Nov), rather than one value scoped to both. Both
  work today — Supabase is one shared project, so the key is one secret by
  definition, and both entries authenticating is itself evidence they already
  match. **The risk is prospective**: a future rotation updated in only one
  place would fail the environment nobody was looking at. **Deferred to v2**:
  delete both, re-add one value with Production, Preview and Development all
  ticked in the same action.
- **Nothing else is outstanding.** The company seed is done (run 24 Nov,
  1,816 companies). `check-overflow.mjs` reports its expected post-clearout
  state — 15 checks, 0 failed, 3 pages skipped with a named banner — and the
  overflow fixture pair is unused until a job-page wrap class changes again.

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
