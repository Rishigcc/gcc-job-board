-- ===========================================================================
-- THE OVERFLOW FIXTURE -- remove. Run this as soon as the sweep is done.
--
-- The fixture role is LIVE while it exists, so it is on the public board, in
-- sitemap-jobs.xml and counted by live_job_count() -- which also makes the
-- promo card on /jobs appear. None of that is acceptable for longer than a
-- test run.
--
-- The job goes first and the company second, because
-- jobs.company_id -> companies is ON DELETE NO ACTION. Deleting the job also
-- cascades any applications or saves it somehow collected.
-- ===========================================================================

delete from public.jobs where slug = 'fixture-overflow';

delete from public.companies
where slug = 'fixture-overflow-test'
  and not exists (select 1 from public.jobs j where j.company_id = companies.id);

select label, result, detail
from (
  select 1 as seq, 'c1  the fixture role is gone' as label,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
         'rows: ' || count(*) as detail
    from public.jobs where slug = 'fixture-overflow'
  union all
  select 2, 'c2  its company is gone',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'rows: ' || count(*)
    from public.companies where slug = 'fixture-overflow-test'
  union all
  select 3, 'c3  nothing else was removed with it',
         case when count(*) = 0 then 'PASS' else 'CHECK' end,
         'jobs remaining: ' || count(*) || ' (expect 0 before launch, or your real roles after)'
    from public.jobs
  union all
  select 4, 'c4  no fixture row is left anywhere',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         'companies whose name starts [FIXTURE]: ' || count(*)
    from public.companies where name like '[FIXTURE]%'
) checks
order by seq;
