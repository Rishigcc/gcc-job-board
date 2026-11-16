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

## Stage 2 onwards

(Appended at the end of each stage.)

## Carried-forward items (must be done before the final merge)

| # | Item | Raised in | Due |
|---|---|---|---|
| 1 | Fix `private.handle_new_recruiter()`: `on conflict do nothing` leaves an existing `candidate` row in place, so a candidate who becomes a recruiter would never get the recruiter role. Should upgrade candidate to recruiter, never demote an admin. | Stage 1 review | Stage 3 migration |
| 2 | Decide the test recruiter email address. The test Gmail account **cannot** be used — gmail.com is blocked by design. Needs a mailbox on a non-free domain. | Stage 1 review | Before stage 3 |
| 3 | Delete the test Gmail account from Authentication → Users | Stage 1 | Before merge |

## Project-wide settings changed (NOT undone by the rollback scripts)

| Setting | Changed in stage | Previous value | Reverted? |
|---|---|---|---|
| _(none yet)_ | | | |
