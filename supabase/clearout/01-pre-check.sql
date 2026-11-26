-- ===========================================================================
-- CLEAROUT, STEP 1 OF 7 -- the pre-check. READ-ONLY. Changes nothing.
--
-- Run this first and keep the output. Every later step's expected numbers
-- come from it, and if a figure here differs from the procedure's table then
-- something changed since 25 Nov 2026 and you should stop and ask rather
-- than carry on.
--
-- WHY THIS EXISTS. A written inventory is only true on the day it was typed.
-- The clearout list in JOB-BOARD-TEST-DATA.md was wrong twice -- it said 24
-- jobs when there were 27, and said a resume row needed deleting when it had
-- already gone. This derives the figures instead of quoting them.
-- ===========================================================================

select label, result, detail
from (
  select 1 as seq, 'jobs' as label, count(*)::text as result,
         'expect 27 -- ALL posted by community@iworkatgcc.com' as detail
    from public.jobs
  union all
  select 2, 'jobs posted by community@', count(*)::text,
         'expect 27. If this is less than the row above, another account owns some'
    from public.jobs
    where posted_by = (select id from auth.users where email = 'community@iworkatgcc.com')
  union all
  select 3, 'applications', count(*)::text,
         'expect 18, all anonymised -- they cascade when the jobs go'
    from public.applications
  union all
  select 4, 'applications still naming a candidate', count(*)::text,
         'expect 0. Anything above 0 is real personal data -- STOP and ask'
    from public.applications where candidate_id is not null
  union all
  select 5, 'candidate_resumes', count(*)::text,
         'expect 0'
    from public.candidate_resumes
  union all
  select 6, 'storage objects in the resumes bucket', count(*)::text,
         'expect 0. These do NOT cascade and must go by hand -- step 2'
    from storage.objects where bucket_id = 'resumes'
  union all
  select 7, 'job_saves', count(*)::text,
         'expect 0 -- they cascade when the jobs go'
    from public.job_saves
  union all
  select 8, 'recruiter_profiles', count(*)::text,
         'expect 2 -- they cascade when the accounts go'
    from public.recruiter_profiles
  union all
  select 9, 'companies', count(*)::text,
         'expect 1816, of which Test Co A and Test Co B are ours'
    from public.companies
  union all
  select 10, 'companies any job points at',
         coalesce(string_agg(distinct c.name, ', '), 'none'),
         'expect Test Co A, Test Co B, Walmart. Walmart MUST SURVIVE'
    from public.jobs j join public.companies c on c.id = j.company_id
  union all
  select 11, 'admin rows in user_roles', count(*)::text,
         'expect 1 -- yours, on the Google account. It is NOT touched'
    from public.user_roles where role = 'admin'
  union all
  select 12, 'the four test accounts that still exist',
         coalesce(string_agg(email, ', ' order by email), 'none'),
         'expect all four'
    from auth.users
    where email in ('community@iworkatgcc.com', 'feedback@iworkatgcc.com',
                    'iworkatgcctest2@gmail.com', 'iworkatgcctest3@gmail.com')
  union all
  select 13, 'community content owned by iworkatgcctest3',
         (select count(*)::text from public.answers
            where user_id = (select id from auth.users where email = 'iworkatgcctest3@gmail.com'))
         || ' answer(s)',
         'expect 1 -- on a REAL member''s question. See step 5: deleting the account deletes the answer'
  union all
  select 14, 'community content owned by iworkatgcctest2',
         (select count(*)::text from public.answers
            where user_id = (select id from auth.users where email = 'iworkatgcctest2@gmail.com'))
         || ' answer(s), '
         || (select count(*)::text from public.questions
            where user_id = (select id from auth.users where email = 'iworkatgcctest2@gmail.com'))
         || ' question(s)',
         'expect 0 and 0 -- nothing of the community''s is lost by deleting it'
  union all
  select 15, 'jobs_description_check validated?',
         case when convalidated then 'already validated' else 'NOT VALID' end,
         'expect NOT VALID -- step 6 validates it'
    from pg_constraint where conname = 'jobs_description_check'
) checks
order by seq;
