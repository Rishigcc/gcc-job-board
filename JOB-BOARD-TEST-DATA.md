# Job board — test data created in production

Everything below was created in the **live** Supabase project while testing,
because migrations, Storage buckets and auth settings cannot be branched.
Clean this out before the final merge to `main`.

Status key: `LIVE` = still present, `CLEANED` = removed.

## Stage 1 — schema

| What | Where | How to remove | Status |
|---|---|---|---|
| Your admin row | `public.user_roles` | Delete the row whose `user_id` is yours | LIVE |
| Decoy `candidate` role row, pointed at a random real member | `public.user_roles` | n/a | CLEANED — deleted during stage 1 |
| `candidate` role row for your 2nd Google account | `public.user_roles` | `delete from public.user_roles where user_id = '<2nd account uid>';` | **LIVE — kept deliberately.** Rishi decided in stage 3 testing to keep it: it is the candidate persona for stages 6-8. Delete before merge. |
| Your 2nd Google test account | `auth.users` + `public.profiles` | Keep it — needed again for candidate testing in stages 6-8. Delete from Authentication → Users before launch. | LIVE — keep until stage 8 |

**Correction (stage 3 testing).** An earlier version of this file said the
`candidate` role row would be removed "at the end of stage 1", and the stage 3
checklist wrongly told Rishi to expect **two** rows in `user_roles`. The row was
never deleted and is useful, so the correct expectation from here on is:

| `user_roles` rows | Who | Status |
|---|---|---|
| `admin` | Rishi | LIVE |
| `candidate` | 2nd Google test account | LIVE — kept on purpose |
| `recruiter` × 2 | `community@` and `feedback@iworkatgcc.com` | LIVE |

So **four** rows after stage 3, not two.

The four job board tables are otherwise empty.

Note: signing in with the second Google account creates a `profiles` row,
which triggers the **existing** community welcome email to that address. That
is the welcome email that already ships today, not a new one, and it lands in
your own inbox.

## Stage 2 — policy pages

No database or test data created. Nothing to clean up.

## Stage 3 — recruiter accounts

**SIGNED OFF by Rishi, 18 November 2026.** Verified on the branch preview:
recruiter signup with the free-provider block, the single Brevo confirmation
email, the amber and green company-verification banners, the community nav
hidden in both the header and the footer, `/welcome` redirecting with no
flash, and both account-takeover tests. Commits `9382154`, `8da7cce`,
`f2ee13e`, `8a8e9b6`.


Two test recruiter accounts, both mailboxes Rishi owns and can read. Two
rather than one so we can prove recruiter A cannot read recruiter B's
applicants.

| What | Where | How to remove | Status |
|---|---|---|---|
| Test recruiter A — `community@iworkatgcc.com` | `auth.users`, `public.recruiter_profiles`, `public.user_roles` | Authentication → Users → delete. Cascades to both tables. | LIVE — created and confirmed 16 Nov 2026 |
| Test recruiter B — `feedback@iworkatgcc.com` | same | same | LIVE — created and confirmed 16 Nov 2026 |
| Stray `user_activity` row for `community@` | `public.user_activity` | `delete from public.user_activity where user_id = (select id from auth.users where email = 'community@iworkatgcc.com');` — or just delete the account, which cascades | LIVE — written before the ActivityTracker guard existed |
| Any companies, jobs and applications these two create | `public.companies`, `public.jobs`, `public.applications` | Delete the jobs first (applications cascade), then any company rows they created | PLANNED |

**Both accounts, and everything they create, get deleted before the merge
to `main`.** Nothing these accounts produce is real data.

Known wrinkles with these two addresses, both flagged to Rishi:

- Both are on `iworkatgcc.com`, so `recruiter_profiles.email_domain` is
  identical for both. That does not weaken the isolation test — a job is
  owned by `posted_by` (a user id), never by domain.
- `jobs@` is deliberately NOT a test account: it is the sender and
  reply-to on the recruiter signup email, and self-addressed mail through
  Brevo is a delivery problem not worth debugging.
- Mail still goes from `iworkatgcc.com` to `iworkatgcc.com` via an
  external relay, which is the classic shape for spam quarantine. Treat
  the **Brevo transactional log** as ground truth for "did we send it",
  not the inbox.
- `community@` is the sender on the existing welcome and digest emails.
  Using it as a recruiter test account is fine — recruiters get no
  `profiles` row, so neither of those emails can reach it.
- Do **not** sign in to the community side with either address via Google.
  If `iworkatgcc.com` runs on Google Workspace that would create a second
  identity on the same email and muddy every test.

### Stage 3 — account-takeover testing (settled 18 Nov 2026)

Enabling the email/password provider meant anyone could POST to
`/auth/v1/signup` with any address. 2,486 of the accounts on this project are
Google-only with no password, and several sit on real company domains that
pass the free-provider blocklist. Two tests, run with
`scripts/stage3-takeover-check.js` and `.sql`:

**T1 — password signup against an address that already exists as Google-only.
PASS.** HTTP 200, no session, `identities` length 0, and a *fabricated* user
id that matches no real row. The real row was untouched: `has_password` false,
one identity, provider google. No Brevo send. This is Supabase's documented
enumeration protection, and it means **all existing members are immune**.

**T2 — pre-register an unconfirmed password account, then have the real owner
sign in with Google. PASS, outcome B.** The merge kept the same user id
(`2db00631-…`) but Supabase wiped **both** the attacker's password and the
attacker's `user_metadata`:

| | after T2A (pre-registered) | after the owner's Google sign-in |
|---|---|---|
| `confirmed` | false | true |
| `has_password` | **true** | **false** |
| `providers` | email | google |
| `identity_count` | 1 | 1 |
| `account_type` metadata | recruiter | **null** |
| `recruiter_name` metadata | "Takeover probe" | **null** |

`signInWithPassword` with the attacker's password then returned 400
"Invalid login credentials".

This is better than the Supabase docs promise — they only commit to removing
the unconfirmed *identity*, and say nothing about the password or the
metadata. Both were cleared. The metadata-poisoning sub-case does not occur,
so no mitigation is needed and no cleanup cron is required. Item 11 closed.

While unconfirmed, the pre-registered account owned nothing: zero rows in
`profiles`, `recruiter_profiles` and `user_roles`.

**Note on baselines.** An earlier version of the `.sql` file hardcoded
`2446 / 2444 / 2 / 0` as the expected counts. That was wrong — this is a live
site and people join during testing (2,447 at the start of the stage 3
retest, 2,488 two days later). Always run section 0 on the day and compare
against that, never against a number written down earlier.

## Stage 4 — posting a job

| What | Where | How to remove | Status |
|---|---|---|---|
| Test job postings by the two recruiter accounts | `public.jobs` | `delete from public.jobs where posted_by in (select id from auth.users where email in ('community@iworkatgcc.com','feedback@iworkatgcc.com'));` | PLANNED |
| Company rows created while testing | `public.companies` | Delete the jobs first, then the company rows. **Companies are shared**, so check nothing else references one before deleting it. | PLANNED |
| `jobs_cap_guard` trigger + `private.jobs_cap_guard()` | database | `supabase/migrations/004_job_posting_messages_rollback.sql` — but keep it, it is product behaviour, not test scaffolding | LIVE after migration 004 |

Notes for testing:

- **Use obviously fake company names.** New tables are published to the
  production API the moment they exist, so a test job is readable by anyone
  holding the public key even though no production page links to it. "Test Co
  A" is fine; a real GCC's name is not.
- Reaching the 10-live-roles cap needs **10 live roles on one unverified
  account**. They can be thin — the only long field is the description, at 50
  characters minimum.
- A job cannot be deleted through the UI by design: there is no DELETE grant
  on `public.jobs` for `authenticated`. Closing is the recruiter's action;
  deleting is yours, in the SQL editor.

### Stage 4 — first test round, 18 Nov 2026

Rishi tested the whole of stage 4 and everything passed, including the cap
test (HTTP 400, `P0001`, our own sentence, not the RLS message). Nine UI
issues and one design change were raised. All were fixed in the same stage.

| # | Issue | Resolution |
|---|---|---|
| 1 | Checklist said 8 fields need attention on an empty submit; the form says 7 | My count was wrong, not the form. Later checklists state the rule, not the number. |
| 2 | Page did not scroll to the first error | **Real bug.** `data-invalid` was passed to `<Field>` as a prop and `Field` never put it on a DOM node, so `querySelector("[data-invalid='true']")` matched nothing. The attribute is now on the wrapper `<div>`. |
| 3 | Experience from/to inputs vertically misaligned | Hints moved from above the control to below it. Labels are one line everywhere, so paired fields in a grid now line up by construction. Also fixed Location vs Work mode, which had the same fault unreported. |
| 4 | Error messages did not clear when a field was fixed | Errors were held in `useState` and only recomputed on submit. They are now derived — `const errors = touched ? validateJob(values) : {}` — so they cannot go stale. |
| 5 | Enter submitted the whole form | Form-level `onKeyDown` blocks Enter unless the target is a `<textarea>` or a `<button>`. |
| 6 | No confirmation before posting | Two-step: **Review this role** → summary panel (title, hiring company with a new/existing badge, location, function) → **Confirm and publish**. On edit the panel appears only when the hiring company changed. |
| 7 | Public link preview under the job title | Removed. |
| 8 | Grey slot counter did not mention that verification lifts the limit | It does now. |
| 9 | Dropdown type-ahead appeared not to work | **Cause: the `Choose…` placeholder.** Browsers' native type-ahead walks option *text*, so the letter C matched "Choose…" before Cybersecurity or Coimbatore. The placeholder is now `disabled`, which type-ahead and the arrow keys skip. |
| 10 | Free-text hiring company fragments the company table | **Replaced with a picker.** See below. |

### Stage 4 — the hiring company picker (issue 10)

`src/components/CompanyPicker.jsx`. Typing searches `public.companies`
server-side (debounced, `ilike`, 8 results). Typing resolves to **nothing**:
the recruiter must either click an existing company or click
"Add *name* as a new company", and `validateJob` refuses to submit until one
of those has happened. The review panel then restates which it was.

**Correction to something I told Rishi earlier.** I said slug matching meant
"HSBC" and "H.S.B.C." resolved to one row. That was wrong: `slugify` turns
every run of non-alphanumerics into a hyphen, so they became `hsbc` and
`h-s-b-c`. There is now a separate `companySlug()` which deletes in-word
punctuation first, so they do collide. But the wider point stands — no slug
rule can know that "Walmart Global Tech India" and "Walmart" are one
employer. The picker is the fix; the slug is only a spelling backstop.

**Seeding.** `scripts/build-company-seed.mjs` turns a plain list of names
into `supabase/migrations/005_seed_companies.sql`, deduplicating by
`companySlug` and printing every collision for a human to settle. Input
format: UTF-8 text, one company name per line, no header, no numbering,
written exactly as it should display. The migration is data-only and
`on conflict (slug) do nothing`, so it is safe to run twice and will never
overwrite a name a recruiter created. **Note that `public.companies` is
readable by `anon`, so seeded names are on the public API immediately.**

### Stage 4 — second test round, 18 Nov 2026

One real failure, two cosmetic, two new requests. All fixed.

| # | Issue | Resolution |
|---|---|---|
| 1 | **The duplicate backstop did not work.** Typing `test co a.` returned "no company matches" and offered to create a duplicate. | **Real failure, and the one that mattered.** `companySlug()` was applied at insert time but not at search time, so a collision could only be found by causing it. The picker now runs **two** queries — `name ilike %term%` **and** `slug ilike %companySlug(term)%` — merges them, and sorts an exact slug match to the top. Verified against the live table: the name query returns nothing for `test co a.`, the slug query returns Test Co A. |
| 2 | Prefill fired against an empty companies table | My description was wrong, not just the code: only the *id* was conditional, the *name* was always prefilled. That is how the stray `iworkatgcctest1` row was created. **Prefill dropped entirely**, per Rishi — for an agency their own company is never the hiring company. |
| 3 | `\u2014` rendered as literal text under "Post a role" | JSX text is not a JS string literal, so the escape never ran. One instance; the two in `jobFormModel.js` are inside real string literals and were always correct. |
| 4 | Location type-ahead: `c` → Chennai, `c` → Chandigarh, third press nothing | **Not fixed, by agreement.** Native macOS select behaviour. The bug that *was* ours — the enabled `Choose…` placeholder swallowing the first keystroke — is fixed. Replacing native selects with custom components would be worse on phones and for screen readers. |
| R1 | Remove the external-apply option | Done. The radio group is gone and `insertPayload()` pins `apply_mode` to `in_platform` and `external_url` to null. **`jobs.apply_mode` and `jobs.external_url` deliberately stay in the schema**, so reversing this is a form change and never a migration. |
| R2 | Warn before losing a half-filled form | `src/lib/useUnsavedChanges.js`. See the limit below. |

**Known limit of the unsaved-work warning: the browser Back button is not
covered.** Blocking it needs React Router's `useBlocker`, which only works
on a data router (`createBrowserRouter`). This app uses `<BrowserRouter>`
with `<Routes>`, so `useBlocker` throws. Converting the app to a data router
touches every route on the site, community pages included, and is not a
change to make from inside the posting form. Links, the logo, Cancel, tab
close and reload are all covered.

**Known limit of the company search:** it matches on the name, and on the
slug of what was typed. It will not connect a name typed with the word
breaks removed — `testcoa` does not find `Test Co A` — because that slug has
no hyphens to match. Punctuation, casing and spacing are all handled.

### Stage 4 — still to clean up before the merge

- **All test jobs** in `public.jobs`, from both test rounds.
- **All company rows** created while testing — `Test Co A`, `Test Co B`, and
  anything else added through the picker. `iworkatgcctest1` was deleted
  during the second round.
- Deletion SQL is in the table above. **Jobs first, then companies**, because
  of the foreign key. No DELETE grant on `public.jobs` for `authenticated`,
  so this is Rishi's to run in the SQL editor.

## Stage 4 onwards

(Appended at the end of each stage.)

## Carried-forward items (must be done before the final merge)

| # | Item | Raised in | Due |
|---|---|---|---|
| 1 | Change `LAST_UPDATED` in `src/Pages/Privacy.jsx` and `src/Pages/RecruiterTerms.jsx` to the real launch date | Stage 2 | Before merge |
| 2 | Verify in the Microsoft Clarity dashboard that form-input masking is ON. The privacy policy states that text typed into forms is masked. | Stage 2 | Stage 6 |
| 3 | ~~Fix `private.handle_new_recruiter()` `on conflict do nothing`.~~ **DONE** — migration 003 upgrades a candidate to recruiter and never demotes an admin. | Stage 1 review | Closed |
| 4 | ~~Decide the test recruiter email address.~~ **DONE** — `community@` and `feedback@iworkatgcc.com`. | Stage 1 review | Closed |
| 5 | Delete the test Gmail account from Authentication → Users | Stage 1 | Before merge |
| 7 | **Turn on leaked-password protection** (Auth → Policies). Pro-plan only and Rishi is on Free, so it is skipped for now. It checks new passwords against HaveIBeenPwned. Only affects password accounts, i.e. recruiters. Do this if the plan is ever upgraded. | Rishi, stage 3 setup | If/when on Pro |
| 8 | **Add `http://localhost:5173/**` to Supabase Redirect URLs before changing Site URL**, or local `npm run dev` sign-in breaks. Localhost is currently allowed only because it *is* the Site URL. | Stage 3 review | Before changing Site URL |
| 6 | ~~**10-live-roles cap: the error message.**~~ **DONE in stage 4.** Migration 004 adds a `BEFORE INSERT` trigger, `private.jobs_cap_guard()`, which raises a readable sentence before the insert policy is evaluated. The policy from migration 001 is untouched and remains the enforcement; the trigger only supplies the message. It also gives a suspended recruiter a plain explanation instead of the same opaque RLS error. The cap number appears in two places now — the policy and the trigger — and each carries a comment saying to keep them in step. | Rishi, stage 2 sign-off | Closed |
| 9 | ~~**`auth.signUp` is not domain-restricted.**~~ **DEFERRED by Rishi, 18 Nov 2026.** The free-provider blocklist lives in the client form and in the `handle_new_recruiter` trigger, but the trigger only fires when the `recruiter_profiles` row is inserted, so a scripted call to `/auth/v1/signup` can still create an **unconfirmed** `auth.users` row on any domain and burn one Brevo send. Rishi's call: the trigger still stops them becoming a recruiter, so it is a junk account that can do nothing. Not worth a Before User Created auth hook. Revisit only if junk signups or send quota ever become a real problem. | Stage 3 review | Deferred — no action |
| 10 | **A recruiter can create a community `profiles` row — and that is now intended.** `saveDisplayName()` in `src/lib/useDisplayName.js` upserts one, reachable from `/profile`, `/ask` and any question page. **Rishi's decision, 18 Nov 2026: leave the behaviour as it is.** Someone who deliberately sets a display name is choosing to join the community, which matches the "one person can be both" decision. `/ask` and `/profile` stay reachable for recruiters. **The guard is the invariant below, not a code change.** | Stage 3 review | Decided — see the invariant |
| 11 | ~~**Stale unconfirmed `auth.users` rows / pre-account-takeover.**~~ **CLOSED 18 Nov 2026 by test T2 — outcome B.** A pre-registered unconfirmed password account was merged into the same user id when the real owner signed in with Google, and Supabase wiped **both** the attacker's password (`has_password` false, `providers` google only) **and** the attacker's `user_metadata`. `signInWithPassword` with the attacker's password returned 400 "Invalid login credentials". No cleanup cron is needed. | Stage 3 review | Closed |
| 12 | **`user_activity` now skips recruiters.** `ActivityTracker` is mounted at the app root and ran `record_activity()` for every signed-in user, recruiters included — proven by the one row `community@iworkatgcc.com` had accumulated. That table feeds the digest's active-user set and the community stats, so recruiters were inflating both. Guarded in stage 3. The guard keys off `account_type` metadata; if one account ever needs to be both candidate and recruiter, change it to key off the presence of a `profiles` row instead. | Rishi, stage 3 retest | Closed (guard shipped); stray row listed above for cleanup |

## Invariants — things a later stage must not quietly break

These are not to-do items. They are rules that currently hold, that nothing
enforces mechanically, and that a reasonable-looking future change could
break without any test failing.

### I1 — `profiles.google_email` must stay null for recruiters

**The rule.** `profiles.google_email` is written by exactly one thing: the
Google sign-in sync in `src/Pages/Welcome.jsx`. Nothing else may write it.

**What depends on it.** It is the only thing keeping recruiters out of the
weekly digest. `api/send-digest.js` skips any profile whose `google_email` is
null (`reason: "no_email"`). A recruiter is allowed to have a `profiles` row
— see item 10 — so the row's existence cannot be the filter. The null column
is the filter.

**How it breaks.** Any of these would silently start emailing recruiters:

- backfilling `google_email` from `auth.users.email`
- setting `google_email` in `saveDisplayName()` or anywhere in the recruiter
  signup path
- a migration that adds a `not null` default or copies `email` into it
- a new "complete your profile" screen that asks for and saves an email

**Why not just filter on role.** One person is allowed to be both a candidate
and a recruiter, and that person *should* get the digest. The real question is
"did they join the community through Google", and a non-null `google_email` is
exactly that. A role-based filter would exclude the dual-role case wrongly.

**How to check it still holds.** Before any stage that touches `profiles`,
the digest, or recruiter signup:

```sql
-- Must return 0. Any row here is a recruiter who will receive the digest.
select count(*)
  from public.profiles p
  join public.user_roles r on r.user_id = p.id
 where r.role = 'recruiter'
   and p.google_email is not null;
```

The reasoning is also written at the check itself in `api/send-digest.js`,
so whoever edits that line sees it.

## Project-wide settings changed (NOT undone by the rollback scripts)

| Setting | Changed in stage | Previous value | Reverted? |
|---|---|---|---|
| **Site URL** → `https://www.iworkatgcc.com` | Stage 3 setup | `http://localhost:5173` | No — and should stay changed. The old value was unused by any code path (the one `signInWithOAuth` call passes `redirectTo` explicitly), but it was the fallback for every auth email. |
| **Redirect URLs** — added 2 preview wildcards | Stage 3 setup | `http://localhost:5173/**` only | No — keep. Harmless after launch; remove the preview wildcards then if you want to tidy up. |
| **Auth SMTP** → Brevo, sender `jobs@iworkatgcc.com`, port 587 | Stage 3 setup | Supabase default sender | No — keep. Nothing used it before: all existing identities are Google OAuth and never trigger a Supabase auth email. |
| **Email provider + Confirm email** | — | Already enabled before this project | n/a |
| **Confirm signup email template** | Stage 3 | Supabase default copy | No — keep. Draft is in `supabase/email-templates/confirm-recruiter-signup.html`. Note this template is project-wide and would also reach any candidate who ever signs up with a password. |
