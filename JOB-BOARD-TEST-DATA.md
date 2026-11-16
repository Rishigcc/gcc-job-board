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
| 9 | **`auth.signUp` is not domain-restricted.** The free-provider blocklist lives in the client form *and* in the `handle_new_recruiter` trigger — but the trigger only fires when the `recruiter_profiles` row is inserted, i.e. after email confirmation. So a scripted call to `/auth/v1/signup` can still create an **unconfirmed** `auth.users` row on any domain, including gmail.com, and burn one Brevo send. Such an account can never become a recruiter (the trigger refuses, and they see the blocked-domain error at `/recruiter`), so it is junk-row pollution and send-quota abuse, not an access hole. Closing it properly needs a **Before User Created** auth hook. Decide whether that is worth it. | Stage 3 review | Before merge — decision |
| 10 | **A recruiter can create a community `profiles` row.** `saveDisplayName()` in `src/lib/useDisplayName.js` does an **upsert**, and it is reachable from three places a recruiter could still type a URL into: `/profile` (Save display name), `/ask`, and answering on a question page. Hiding the nav items (done in stage 3) removes the signposts but not the capability. **Proven contained for now:** the welcome email has exactly one call site (`Welcome.jsx`), which returns early for recruiters; and the digest skips any profile whose `google_email` is null, which it always is on a row created this way. The structural fix conflicts with the "one person may be both candidate and recruiter" decision, so it needs Rishi's call. | Stage 3 review | Before merge — decision |
| 11 | **Stale unconfirmed `auth.users` rows.** Supabase automatically links a new OAuth identity to an existing user with the same email address. If an unconfirmed password signup can keep its password through that link, it is a pre-account-takeover path against *future* community members. Test T2 in the stage 3 retest settles it. If it is a hole, the mitigation is a periodic delete of unconfirmed users older than a few hours, folded into the existing `/api/rebuild` cron (no cron slot is free on the Hobby plan). | Stage 3 review | Pending test T2 |

## Project-wide settings changed (NOT undone by the rollback scripts)

| Setting | Changed in stage | Previous value | Reverted? |
|---|---|---|---|
| **Site URL** → `https://www.iworkatgcc.com` | Stage 3 setup | `http://localhost:5173` | No — and should stay changed. The old value was unused by any code path (the one `signInWithOAuth` call passes `redirectTo` explicitly), but it was the fallback for every auth email. |
| **Redirect URLs** — added 2 preview wildcards | Stage 3 setup | `http://localhost:5173/**` only | No — keep. Harmless after launch; remove the preview wildcards then if you want to tidy up. |
| **Auth SMTP** → Brevo, sender `jobs@iworkatgcc.com`, port 587 | Stage 3 setup | Supabase default sender | No — keep. Nothing used it before: all existing identities are Google OAuth and never trigger a Supabase auth email. |
| **Email provider + Confirm email** | — | Already enabled before this project | n/a |
| **Confirm signup email template** | Stage 3 | Supabase default copy | No — keep. Draft is in `supabase/email-templates/confirm-recruiter-signup.html`. Note this template is project-wide and would also reach any candidate who ever signs up with a password. |
