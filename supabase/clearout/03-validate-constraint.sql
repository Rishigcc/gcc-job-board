-- ===========================================================================
-- CLEAROUT, STEP 6 OF 7 -- carried item 26.
--
-- `jobs_description_check` has been NOT VALID since migration 023, because 24
-- of the 25 rows that existed then were shorter than the 400-character
-- minimum it enforces. NOT VALID means Postgres applies it to new and updated
-- rows but has never checked the existing ones.
--
-- After the clearout `public.jobs` is EMPTY, so there is nothing for the
-- validation to object to and it is a formality -- but it is the formality
-- that makes the constraint a guarantee rather than a promise about the
-- future only.
--
-- RUN THIS BEFORE creating any overflow fixture (step 7). The fixture's
-- description is comfortably over 400 characters, so the order does not
-- actually matter -- but validating an empty table is the one case that
-- cannot fail for a reason you would have to investigate.
--
-- It takes an ACCESS EXCLUSIVE lock on public.jobs for the duration. On an
-- empty table that is immeasurably brief.
-- ===========================================================================

alter table public.jobs validate constraint jobs_description_check;

select label, result, detail
from (
  select 1 as seq, 'c1  the constraint is now validated' as label,
         case when convalidated then 'PASS' else 'FAIL' end as result,
         'convalidated = ' || convalidated as detail
    from pg_constraint where conname = 'jobs_description_check'
  union all
  select 2, 'c2  it is still a CHECK on public.jobs',
         case when count(*) = 1 then 'PASS' else 'FAIL' end,
         'matching constraints: ' || count(*)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    where con.conname = 'jobs_description_check' and c.relname = 'jobs'
      and con.contype = 'c'
  union all
  select 3, 'c3  the table it guards is empty, as expected',
         case when count(*) = 0 then 'PASS' else 'CHECK -- a row survived the clearout' end,
         'jobs rows: ' || count(*)
    from public.jobs
) checks
order by seq;
