# The pre-merge clearout

**RUN 25 November 2026. Complete.** Steps 1 to 7 ran clean, nothing errored,
and the storage bucket was already empty. The outcome is recorded at the
bottom, under "What actually happened."

**Every test row, file and account created while building the job board against
the live database, removed in the order the foreign keys require.**

Written 25 November 2026. **Every figure here was derived from the live
database on that date, not copied from `JOB-BOARD-TEST-DATA.md`** — that
file's clearout list had been wrong twice, in both directions. Step 1 re-derives
them so you can tell if anything has changed since.

---

## Before you start

**You need:** the Supabase dashboard (SQL Editor, Authentication → Users,
Storage) and about fifteen minutes. Nothing here touches the repo.

**Read this first, because it changes what the steps have to do.**

Almost everything **cascades from the account**. `public.jobs.posted_by`,
`applications.candidate_id`, `candidate_resumes`, `job_saves`,
`recruiter_profiles`, `user_roles`, `profiles`, `questions`, `answers` and the
hearts and saves tables are all `ON DELETE CASCADE` from `auth.users`. And
`applications.job_id` and `job_saves.job_id` cascade from `jobs`.

So deleting **one** account — `community@iworkatgcc.com`, which posted **all
27** test roles — removes the 27 roles and, through them, all 18 applications.
Most of this procedure is verification rather than deletion.

**The one foreign key that does NOT cascade** is
`jobs.company_id → companies`, which is `ON DELETE NO ACTION`. That is the
whole reason companies come after jobs: while a job points at a company,
Postgres refuses to delete it.

**Three things are not reversible:** the account deletions, the company
deletions and the row cascades. There is no undo. Step 1 exists so you know
what you are about to remove before you remove it.

**What is NOT touched:** your admin account and its `user_roles` row, the
1,814 seeded companies including Walmart, and the 2,642 community profiles.

---

## Step 1 — the pre-check. Changes nothing.

Paste **`supabase/clearout/01-pre-check.sql`** into the SQL Editor and run it.

**You should see 15 rows.** Compare them to this table. Every `result` should
match. If one does not, stop and ask rather than carrying on — a figure that
has moved means something happened since 25 November.

| label | expected result |
|---|---|
| jobs | **27** |
| jobs posted by community@ | **27** |
| applications | **18** |
| applications still naming a candidate | **0** ← if this is not 0, **stop** |
| candidate_resumes | **0** |
| storage objects in the resumes bucket | **0** |
| job_saves | **0** |
| recruiter_profiles | **2** |
| companies | **1816** |
| companies any job points at | **Test Co A, Test Co B, Walmart** |
| admin rows in user_roles | **1** |
| the four test accounts that still exist | all four |
| community content owned by iworkatgcctest3 | **1 answer(s)** |
| community content owned by iworkatgcctest2 | **0 answer(s), 0 question(s)** |
| jobs_description_check validated? | **NOT VALID** |

---

## Step 2 — the resume files in Storage. By hand, because nothing cascades.

`storage.objects` has **no foreign key** to `auth.users`, so deleting an
account leaves its uploaded file behind. That is why this is its own step, and
why stage 8 redefined deletion as *"the folder is empty"* rather than *"the
named file is gone"*.

1. Dashboard → **Storage** → the **`resumes`** bucket.
2. **Expect it to be empty.** Step 1 said 0 objects.
3. If anything is there: select all, delete, and confirm the bucket is empty.

**Do this before the account deletions**, not after — once the accounts are
gone, a stray file has no owner to trace it back to.

---

## Step 3 — the two recruiter accounts. This is the big one.

Dashboard → **Authentication** → **Users**. Search each address, use the row
menu → **Delete user**, and confirm.

1. **`community@iworkatgcc.com`** — deleting this cascades **27 jobs**, **18
   applications**, its `recruiter_profiles` row, its `user_roles` row and 2
   `user_activity` rows.
2. **`feedback@iworkatgcc.com`** — its `recruiter_profiles` row and
   `user_roles` row. It posted nothing.

Then verify, in the SQL Editor:

```sql
select 'jobs' as t, count(*)::text as n from public.jobs
union all select 'applications', count(*)::text from public.applications
union all select 'recruiter_profiles', count(*)::text from public.recruiter_profiles
union all select 'recruiter role rows', count(*)::text from public.user_roles where role = 'recruiter'
union all select 'the two accounts', coalesce(string_agg(email, ', '), 'both gone')
  from auth.users where email in ('community@iworkatgcc.com','feedback@iworkatgcc.com');
```

**All four counts must be 0, and the last row must read `both gone`.**

> **If `jobs` is not 0:** a job is owned by an account you have not deleted.
> Run `select distinct posted_by from public.jobs;` and stop — do not delete an
> account you have not identified.

---

## Step 4 — the two test companies.

Paste **`supabase/clearout/02-companies.sql`** and run it.

**Four rows, all PASS:**

| check | expect |
|---|---|
| c1 both test companies are gone | PASS |
| c2 nothing blocked the delete | PASS |
| c3 the seeded list is intact | PASS — `companies now: 1814` |
| c4 Walmart survived | PASS |

> **If c2 fails,** a job still points at a test company, so the delete did
> nothing. Finish step 3 and run this file again. It is safe to re-run.

---

## Step 5 — the two test Google accounts. One of them is a decision.

**`iworkatgcctest2@gmail.com` — delete it.** Authentication → Users → delete.
It has a `profiles` row, a `candidate` role row and one activity row, and
**no community content at all** — 0 questions, 0 answers. Nothing is lost.

**`iworkatgcctest3@gmail.com` — my recommendation was to KEEP it, and he
decided to keep BOTH.**

It has **no job-board data left**: no applications, no resume, no saved roles.
The clearout list named it because it once had a resume row and applications,
and those are already gone. What it does have is **one answer, on a real
member's question** — *"Head - Delivery and Operations"*, asked by another
member — posted under the display name **hitesh1**.

**Deleting the account deletes that answer**, because `answers.user_id`
cascades. A real member's question would lose a reply, and there is no way to
keep the answer and delete the account.

**DECIDED: he kept `iworkatgcctest2@gmail.com` too**, for a reason this
procedure did not anticipate — *"I'll want a candidate account to test v2
with and creating one later is more work than keeping one now."* That is not
the same reason as keeping `test3`, and worth separating: `test3` is kept
because deleting it costs a real member their answer; `test2` is kept because
it is a convenience for work that has not started yet.

**The consequence of keeping either:** both have real Google addresses, so
both will receive the **community digest** going forward — the weekly email
`user_activity`-tracked members get, which predates the job board and is out
of its scope. Neither account posts, answers or applies, so the digest is the
only thing that treats them as live members from here on.

---

## Step 6 — carried item 26, the description constraint.

Paste **`supabase/clearout/03-validate-constraint.sql`** and run it.

`jobs_description_check` has been `NOT VALID` since migration 023, because 24
of the 25 rows that existed then were under the 400-character minimum. With
`public.jobs` now empty there is nothing to object to, and validating it turns
the constraint from a rule about future rows into a guarantee about all of
them.

**Three rows, all PASS.** It takes a brief exclusive lock on an empty table.

---

## Step 7 — the final verification.

Paste **`supabase/clearout/04-final-verify.sql`** and run it.

**Fifteen rows. Every one must read PASS**, except `c15`, which is an `INFO`
row reporting your step 5 decision.

This is the statement that the job board carries no test data into production.
**Keep the output.**

---

## What actually happened — 25 November 2026

Step 7's final verification: **14 of 15 rows PASS.** The one that read FAIL
was `c11`, and it is a decision, not a problem:

| | |
|---|---|
| c11 the recruiter and candidate test accounts are gone | **FAIL** — `iworkatgcctest2@gmail.com` |
| Everything else | PASS |

He kept both test Google accounts deliberately — see the decision above.
**`c11` checks for the Google accounts' absence, so keeping one was always
going to read FAIL there.** That is the check doing its job: it would be worse
for a kept account to pass silently as though nothing had been decided.

The other fourteen, as reported: **0 jobs, 0 applications, 0 candidate
resumes, 0 storage objects, 0 saved roles, 0 recruiter profiles, 0 recruiter
role rows**, both test companies gone, **1,814** companies intact, Walmart
survived, the admin row untouched, `convalidated = true`, and **2,643**
profiles — one more than the 2,642 this file expected, because someone joined
the community while the clearout was running. That is not a discrepancy to
chase; the count was never going to be perfectly still.

## After the clearout: the overflow fixture

**`scripts/check-overflow.mjs` loses both of its description subjects here** —
jobs 42 and 13 are among the 27. Run it once and it will tell you so itself:

```
21 checks, 0 failed, 3 page(s) skipped

*** DESCRIPTION OVERFLOW WAS NOT MEASURED ***
```

**That is the expected state and not a failure.** A description is the only
place that sweep tests a long unbroken word inside a heading and a list item,
which are different measurements from a paragraph.

**A permanent replacement was tried and does not work.** A *closed* role would
be invisible to the board, the sitemap and the promo count — but its detail
page shows "This role is no longer open" and no description at all, identical
to a role that never existed, because `private.job_is_public()` requires
`status = 'live'`. So a fixture has to be live, which means it is on the public
board while it exists.

**So it is created and removed around a run:**

1. `supabase/test-fixtures/overflow-fixture-create.sql` — 9 rows, all PASS.
   It brings its own company, `[FIXTURE] Overflow Test`, so no real company is
   made to look as though it is hiring, and it takes a **fixed id of 999999**
   so its URL is knowable.
2. `node scripts/check-overflow.mjs` — expect **24 checks, 0 failed, 0
   skipped**.
3. `supabase/test-fixtures/overflow-fixture-remove.sql` — 4 rows, all PASS.

**Only do this when you have changed `JobDescription.jsx`,
`descriptionMarkdown.js` or a wrap class on a job page.** That is the only
thing it can catch. Before launch there is no hurry; after launch, the fixture
is on the public board for the minute or two it exists.

---

## What is deliberately left behind

- **The 1,814 seeded companies**, Walmart included.
- **Your admin row** in `user_roles`.
- **`admin_audit` rows describing jobs and recruiters that no longer exist.**
  That is what a log is. They are not orphans and nothing should clean them up.
  The admin Reports tab will show counts whose subjects are gone.
- **`iworkatgcctest3@gmail.com`**, if you kept it at step 5.

## If something goes wrong

- **A SQL file errors part-way:** the editor runs a multi-statement file as one
  implicit transaction, so **nothing in that file applied**. Fix and re-run.
- **A syntax error:** nothing ran at all — Postgres parses the whole batch
  before executing any of it. Check `updated_at` on anything you are unsure
  about rather than guessing.
- **Every file here is safe to re-run.** The deletes are `where`-guarded and
  the verifications are read-only.
- **The one thing to stop for** is step 1 reporting applications that still
  name a candidate, or step 3 leaving jobs behind. Both mean there is data
  nobody has accounted for.
