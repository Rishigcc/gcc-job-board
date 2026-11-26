-- ===========================================================================
-- CLEAROUT, STEP 7 OF 7 -- the final verification. READ-ONLY.
--
-- Every row must read PASS. This is the statement that the job board carries
-- no test data into production.
--
-- WHAT IS DELIBERATELY STILL HERE:
--   * the 1,814 seeded companies, including Walmart
--   * your admin row in user_roles
--   * iworkatgcctest3@gmail.com, IF you chose to keep it at step 5 -- it has
--     no job-board data at all, and deleting it would delete a real member's
--     answer along with it
--   * admin_audit rows describing jobs and recruiters that no longer exist.
--     That is what a log is. They are not orphans to clean up.
-- ===========================================================================

select label, result, detail
from (
  select 1 as seq, 'c1  no jobs' as label,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
         'jobs: ' || count(*) as detail
    from public.jobs
  union all
  select 2, 'c2  no applications',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'applications: ' || count(*)
    from public.applications
  union all
  select 3, 'c3  no candidate resume rows',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'candidate_resumes: ' || count(*)
    from public.candidate_resumes
  union all
  select 4, 'c4  no resume files in storage',
         case when count(*) = 0 then 'PASS' else 'FAIL -- delete them in Storage' end,
         'objects in the resumes bucket: ' || count(*)
    from storage.objects where bucket_id = 'resumes'
  union all
  select 5, 'c5  no saved roles',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'job_saves: ' || count(*)
    from public.job_saves
  union all
  select 6, 'c6  no recruiter profiles',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'recruiter_profiles: ' || count(*)
    from public.recruiter_profiles
  union all
  select 7, 'c7  no recruiter role rows',
         case when count(*) = 0 then 'PASS' else 'FAIL' end, 'user_roles with role recruiter: ' || count(*)
    from public.user_roles where role = 'recruiter'
  union all
  select 8, 'c8  the test companies are gone',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         'Test Co A / Test Co B: ' || count(*)
    from public.companies where name in ('Test Co A', 'Test Co B')
  union all
  select 9, 'c9  the seeded companies are intact',
         case when count(*) between 1800 and 1815 then 'PASS' else 'CHECK' end,
         'companies: ' || count(*) || ' (expect 1814)'
    from public.companies
  union all
  select 10, 'c10 Walmart survived',
         case when count(*) = 1 then 'PASS' else 'FAIL' end, 'Walmart rows: ' || count(*)
    from public.companies where name = 'Walmart'
  union all
  select 11, 'c11 the recruiter and candidate test accounts are gone',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         coalesce(string_agg(email, ', '), 'none remaining')
    from auth.users
    where email in ('community@iworkatgcc.com', 'feedback@iworkatgcc.com',
                    'iworkatgcctest2@gmail.com')
  union all
  select 12, 'c12 your admin row is untouched',
         case when count(*) = 1 then 'PASS' else 'FAIL -- STOP' end,
         'admin rows: ' || count(*)
    from public.user_roles where role = 'admin'
  union all
  select 13, 'c13 the description constraint is validated',
         case when convalidated then 'PASS' else 'FAIL -- run step 6' end,
         'convalidated = ' || convalidated
    from pg_constraint where conname = 'jobs_description_check'
  union all
  select 14, 'c14 the community is undisturbed',
         case when count(*) > 2400 then 'PASS' else 'CHECK' end,
         -- profiles is NOT the account count: 2,642 profiles against 2,656
         -- auth.users rows before the clearout, because an account only gets
         -- a profiles row once it has signed in with Google.
         'profiles: ' || count(*) || ' (2642 before the clearout, minus any test rows you deleted)'
    from public.profiles
  union all
  select 15, 'c15 iworkatgcctest3 -- whichever you chose at step 5',
         'INFO',
         case when exists (select 1 from auth.users where email = 'iworkatgcctest3@gmail.com')
              then 'kept, with its 1 answer on a real question -- the recommended choice'
              else 'deleted, and its answer went with it' end
) checks
order by seq;
