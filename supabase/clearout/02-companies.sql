-- ===========================================================================
-- CLEAROUT, STEP 4 OF 7 -- the two test companies.
--
-- RUN THIS ONLY AFTER both recruiter accounts are deleted (step 3), because
-- `public.jobs.company_id` -> `public.companies` is ON DELETE **NO ACTION**.
-- That is the one foreign key in the whole graph that does NOT cascade, which
-- is why companies come after jobs. While a job still points at a company,
-- Postgres refuses the delete.
--
-- The `not exists` guard makes that refusal silent and safe rather than an
-- error: if any job still references either company, this deletes NOTHING and
-- c2 below reports it.
--
-- WALMART IS NOT TOUCHED. It is one of the 1,816 seeded companies, and job 42
-- pointed at it only because the picker was tested against the real list.
-- ===========================================================================

delete from public.companies
where name in ('Test Co A', 'Test Co B')
  and not exists (
    select 1 from public.jobs j where j.company_id = companies.id
  );

select label, result, detail
from (
  select 1 as seq, 'c1  both test companies are gone' as label,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
         'Test Co A / Test Co B rows remaining: ' || count(*) as detail
    from public.companies where name in ('Test Co A', 'Test Co B')
  union all
  select 2, 'c2  nothing blocked the delete',
         case when count(*) = 0 then 'PASS' else 'FAIL -- finish step 3 first' end,
         'jobs still pointing at a test company: ' || count(*)
    from public.jobs j join public.companies c on c.id = j.company_id
    where c.name in ('Test Co A', 'Test Co B')
  union all
  select 3, 'c3  the seeded list is intact',
         case when count(*) = 1814 then 'PASS' else 'CHECK' end,
         'companies now: ' || count(*) || ' (1816 minus the 2 test rows = 1814)'
    from public.companies
  union all
  select 4, 'c4  Walmart survived',
         case when count(*) = 1 then 'PASS' else 'FAIL' end,
         'Walmart rows: ' || count(*)
    from public.companies where name = 'Walmart'
) checks
order by seq;
