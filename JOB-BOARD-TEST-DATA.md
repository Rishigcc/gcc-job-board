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
| 6 | **10-live-roles cap: the error message.** The rule itself is already enforced by the `jobs` insert policy from migration 001, and recruiter terms section 5 states it. Two of the three requirements are already met: only `status = 'live'` jobs count (expired/closed/hidden do not), and the cap lifts the instant `is_verified` is flipped, because the policy is evaluated per insert. **Still to build:** an RLS rejection returns the opaque `new row violates row-level security policy for table "jobs"`. Needs a `BEFORE INSERT` trigger on `jobs` raising a readable message — "You can post up to 10 live roles until your company is verified. Reply to our signup email with your website and GSTIN and we will verify you within two working days." The policy stays as the unbypassable backstop; the trigger exists only to produce the message. | Rishi, stage 2 sign-off | Stage 4 migration |
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
