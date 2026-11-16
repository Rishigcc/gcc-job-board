-- ===========================================================================
-- Stage 1 — RLS simulation. Run these THREE queries in the Supabase SQL
-- editor, one at a time. Each one impersonates a real persona: it sets the
-- Postgres role and the JWT claim that Supabase itself sets, so the actual
-- policy engine runs. This is a stronger test than the browser one and needs
-- no second account.
--
-- Everything runs inside a transaction that is rolled back. Nothing is
-- written. If the result pane comes back empty, delete the final `rollback;`
-- line, run again, then run `rollback;` on its own.
-- ===========================================================================


-- --- QUERY A — the admin (you) ---------------------------------------------
-- EXPECT: rows_visible = 2, verdict = PASS
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"060329b6-7b9e-45e2-89cf-f0406f236659","role":"authenticated"}';

  select 'A. ADMIN'                              as persona,
         count(*)                                as rows_visible,
         2                                       as expected,
         case when count(*) = 2 then 'PASS'
              else 'FAIL — tell Claude' end      as verdict
  from public.user_roles;
rollback;


-- --- QUERY B — a non-admin who HAS a role row ------------------------------
-- Replace the sub with the UID of your second Google account once it has a
-- role row (step 5 of the checklist).
-- EXPECT: rows_visible = 1, verdict = PASS.
-- This is the one that proves row filtering: the table holds 2 rows and this
-- persona may see only its own.
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"PASTE-SECOND-ACCOUNT-UID-HERE","role":"authenticated"}';

  select 'B. NON-ADMIN with a role row'          as persona,
         count(*)                                as rows_visible,
         1                                       as expected,
         case when count(*) = 1 then 'PASS'
              else 'FAIL — tell Claude' end      as verdict
  from public.user_roles;
rollback;


-- --- QUERY C — a signed-out visitor ----------------------------------------
-- EXPECT: this query ERRORS with "permission denied for table user_roles".
-- That error IS the pass. anon has no SELECT privilege, by design.
begin;
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';

  select 'C. SIGNED OUT' as persona, count(*) as rows_visible
  from public.user_roles;
rollback;


-- --- QUERY D — the public jobs rule, as a signed-out visitor ----------------
-- EXPECT: rows_visible = 0 and NO error. anon can read the jobs table; the
-- job_is_public() rule is what leaves nothing to see.
begin;
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';

  select 'D. SIGNED OUT reading jobs'            as persona,
         count(*)                                as rows_visible,
         0                                       as expected,
         case when count(*) = 0 then 'PASS'
              else 'FAIL — tell Claude' end      as verdict
  from public.jobs;
rollback;
