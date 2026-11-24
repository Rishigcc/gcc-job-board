-- ===========================================================================
-- 023_description_minimum_rollback.sql
--
-- Puts the minimum back to 50.
--
-- Run this ONLY alongside reverting src/lib/jobFormModel.js, or the form will
-- demand 400 while the database accepts 50 -- which is harmless but means the
-- rule lives in one place instead of two, and the browser is the place a
-- recruiter can edit.
--
-- VALIDATED, not NOT VALID: every row that satisfies 400 satisfies 50, so
-- there is nothing for the old constraint to trip over and no reason to leave
-- it unvalidated.
-- ===========================================================================

alter table public.jobs
  drop constraint if exists jobs_description_check;

alter table public.jobs
  add constraint jobs_description_check
  check (
    length(btrim(description)) >= 50
    and length(btrim(description)) <= 20000
  );

select
  case when pg_get_constraintdef(oid) like '%>= 50%'
            and convalidated
       then 'PASS' else 'FAIL — the 50-character minimum was not restored' end
    as rollback_restored_the_old_minimum,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.jobs'::regclass
  and conname = 'jobs_description_check';
