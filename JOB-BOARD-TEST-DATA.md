# Job board — test data created in production

Everything below was created in the **live** Supabase project while testing,
because migrations, Storage buckets and auth settings cannot be branched.
Clean this out before the final merge to `main`.

Status key: `LIVE` = still present, `CLEANED` = removed.

## Stage 1 — schema

| What | Where | How to remove | Status |
|---|---|---|---|
| Your admin row | `public.user_roles` | Delete the row whose `user_id` is yours | LIVE |
| Decoy `candidate` role row, pointed at a random real member | `public.user_roles` | `delete from public.user_roles where role = 'candidate';` | **DELETE NOW** — replaced by the row below |
| `candidate` role row for your 2nd Google account | `public.user_roles` | `delete from public.user_roles where user_id = '<2nd account uid>';` | LIVE — remove at the end of stage 1 |
| Your 2nd Google test account | `auth.users` + `public.profiles` | Keep it — needed again for candidate testing in stages 6-8. Delete from Authentication → Users before launch. | LIVE — keep until stage 8 |

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
| Test recruiter A — `jobs@iworkatgcc.com` | `auth.users`, `public.recruiter_profiles`, `public.user_roles` | Authentication → Users → delete. Cascades to both tables. | PLANNED |
| Test recruiter B — `feedback@iworkatgcc.com` | same | same | PLANNED |
| Any companies, jobs and applications these two create | `public.companies`, `public.jobs`, `public.applications` | Delete the jobs first (applications cascade), then any company rows they created | PLANNED |

**Both accounts, and everything they create, get deleted before the merge
to `main`.** Nothing these accounts produce is real data.

Known wrinkles with these two addresses, both flagged to Rishi:

- Both are on `iworkatgcc.com`, so `recruiter_profiles.email_domain` is
  identical for both. That does not weaken the isolation test — a job is
  owned by `posted_by` (a user id), never by domain.
- `jobs@` is also the reply-to on the recruiter signup email, so that
  inbox will hold both real recruiter replies and this account's own test
  confirmation. Filter by the subject line.
- Brevo will be sending to `iworkatgcc.com` **from** `iworkatgcc.com` via
  an external relay. Self-domain mail through a third-party relay is the
  classic case for spam quarantine. Treat the **Brevo transactional log**
  as ground truth for "did we send it", not the inbox.
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
| 3 | Fix `private.handle_new_recruiter()`: `on conflict do nothing` leaves an existing `candidate` row in place, so a candidate who becomes a recruiter would never get the recruiter role. Should upgrade candidate to recruiter, never demote an admin. | Stage 1 review | Stage 3 migration |
| 4 | Decide the test recruiter email address. The test Gmail account **cannot** be used — gmail.com is blocked by design. Needs a mailbox on a non-free domain. | Stage 1 review | Before stage 3 |
| 5 | Delete the test Gmail account from Authentication → Users | Stage 1 | Before merge |
| 6 | **10-live-roles cap: the error message.** The rule itself is already enforced by the `jobs` insert policy from migration 001, and recruiter terms section 5 states it. Two of the three requirements are already met: only `status = 'live'` jobs count (expired/closed/hidden do not), and the cap lifts the instant `is_verified` is flipped, because the policy is evaluated per insert. **Still to build:** an RLS rejection returns the opaque `new row violates row-level security policy for table "jobs"`. Needs a `BEFORE INSERT` trigger on `jobs` raising a readable message — "You can post up to 10 live roles until your company is verified. Reply to our signup email with your website and GSTIN and we will verify you within two working days." The policy stays as the unbypassable backstop; the trigger exists only to produce the message. | Rishi, stage 2 sign-off | Stage 4 migration |

## Project-wide settings changed (NOT undone by the rollback scripts)

| Setting | Changed in stage | Previous value | Reverted? |
|---|---|---|---|
| _(none yet)_ | | | |
