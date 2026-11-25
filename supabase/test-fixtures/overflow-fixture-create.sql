-- ===========================================================================
-- THE OVERFLOW FIXTURE -- create. Run it, run check-overflow.mjs, remove it.
--
-- WHY IT IS TEMPORARY NOW, when it used to be two permanent test rows.
--
-- `check-overflow.mjs` measures the RENDERED page, because `break-words` was
-- inert on a flex child for a whole day in stage 10 and a class can compile,
-- apply and do nothing. Its two description subjects were job 42 (a
-- 180-character word in the title, plus a heading and a list item from item
-- 27's proof 6) and job 13 (real Markdown). THE CLEAROUT DELETES BOTH.
--
-- A PERMANENT REPLACEMENT WAS TRIED AND RULED OUT. The obvious answer was a
-- CLOSED role: invisible to the board, the sitemap and the promo count, but
-- reachable by URL. It does not work -- measured 25 Nov 2026: a closed role's
-- detail page shows "This role is no longer open" and NO DESCRIPTION AT ALL,
-- byte-identical to a role that never existed. `private.job_is_public()`
-- requires `status = 'live' and expires_at > now()`, and the page honours it.
--
-- So the fixture has to be LIVE, which means that while it exists it is on
-- the public board, in the sitemap and counted by `live_job_count()` -- which
-- also makes the promo card appear. That is fine for the few minutes of a
-- test run and not fine permanently, so it is created and removed around the
-- run rather than left in place.
--
-- IT BRINGS ITS OWN COMPANY, so no real seeded company is made to look as
-- though it is hiring. The name is deliberately unmistakable.
--
-- WHEN TO RUN IT: after editing `JobDescription.jsx`, `descriptionMarkdown.js`
-- or any wrap class on a job page. That is the only thing it can catch.
-- ===========================================================================

insert into public.companies (name, slug)
select '[FIXTURE] Overflow Test', 'fixture-overflow-test'
where not exists (select 1 from public.companies where slug = 'fixture-overflow-test');

-- A FIXED id, 999999, so the URL is knowable before the row exists.
--
-- The public URL is /gcc-jobs/<slug>-<id> and THE ID IS WHAT THE PAGE LOOKS
-- UP -- the slug is decorative, which the project recorded in migration 020
-- ("a job slug need not be unique"). The first version of this fixture let
-- the sequence choose, and check-overflow.mjs was pointed at a guessed
-- /gcc-jobs/fixture-overflow-28. That resolved to REAL JOB 28, "[T5]
-- Operations Associate", and the sweep reported `ok` on a page that had
-- nothing to do with the fixture. A guessed id is not a missing page; it is
-- a different page.
--
-- 999999 is far above the highest id in use (42) and the sequence will not
-- reach it, so an explicit id collides with nothing. It does not advance
-- jobs_id_seq, which is correct -- real postings keep counting from where
-- they were.
insert into public.jobs (
  id,
  company_id, posted_by, title, slug, city, work_mode, job_function,
  employment_type, experience_min, experience_max, description, apply_mode,
  skills, status, published_at, expires_at
)
select
  999999,
  (select id from public.companies where slug = 'fixture-overflow-test'),
  -- Owned by the admin account, because the recruiter accounts are gone by
  -- now. It never appears in a recruiter view: that account has no
  -- recruiter_profiles row and no `account_type` metadata, so RecruiterRoute
  -- refuses it.
  (select user_id from public.user_roles where role = 'admin' limit 1),
  -- 190 characters: 10 for the prefix plus the 180-character word.
  -- jobs_title_check caps a title at 200, so there are 10 to spare -- do not
  -- lengthen the prefix.
  '[FIXTURE] ' || repeat('trial', 36),
  'fixture-overflow',
  'Bengaluru', 'hybrid', 'Engineering', 'full_time', 3, 8,
  -- Three shapes in one description, because a paragraph, a heading and a
  -- list item are three different measurements once a description has
  -- structure. Comfortably over the 400-character minimum.
  E'This role exists only so that scripts/check-overflow.mjs can measure how '
  || E'the job detail page handles a very long unbroken word in each of the '
  || E'three places a description can now put one. It is created immediately '
  || E'before a test run and removed immediately after, and it should never be '
  || E'visible to anyone for more than a few minutes. If you are reading this '
  || E'on the live site, the removal step was missed: run '
  || E'supabase/test-fixtures/overflow-fixture-remove.sql.\n\n'
  || E'## ' || repeat('trial', 36) || E'\n\n'
  || E'- ' || repeat('trial', 36) || E'\n'
  || E'- a second, ordinary bullet so the list is a list\n\n'
  || repeat('trial', 36),
  -- 'in_platform', NOT 'internal'. jobs_apply_mode_check allows exactly
  -- 'in_platform' and 'external', and the first draft of this file used a
  -- word that is in neither -- caught by reading the table's CHECK
  -- constraints rather than by running it.
  'in_platform',
  array['Overflow'], 'live', now(), now() + interval '30 days'
where not exists (select 1 from public.jobs where slug = 'fixture-overflow');

select label, result, detail
from (
  select 1 as seq, 'c1  the fixture role exists and is LIVE' as label,
         case when count(*) = 1 then 'PASS' else 'FAIL' end as result,
         'rows: ' || count(*) as detail
    from public.jobs where slug = 'fixture-overflow' and status = 'live'
  union all
  select 2, 'c2  its URL matches the one check-overflow.mjs expects',
         case when exists (select 1 from public.jobs
                           where slug = 'fixture-overflow' and id = 999999)
              then 'PASS' else 'FAIL' end,
         coalesce((select '/gcc-jobs/' || slug || '-' || id from public.jobs
                   where slug = 'fixture-overflow'), 'not created')
             || '  (the script expects /gcc-jobs/fixture-overflow-999999)'
  union all
  select 3, 'c3  a 180-character word in the TITLE',
         case when count(*) = 1 then 'PASS' else 'FAIL' end, 'rows: ' || count(*)
    from public.jobs where slug = 'fixture-overflow' and title like '%' || repeat('trial', 36) || '%'
  union all
  select 4, 'c4  one in a HEADING',
         case when count(*) = 1 then 'PASS' else 'FAIL' end, 'rows: ' || count(*)
    from public.jobs where slug = 'fixture-overflow'
      and description ~ ('(^|\n)## ' || repeat('trial', 36))
  union all
  select 5, 'c5  one in a LIST ITEM',
         case when count(*) = 1 then 'PASS' else 'FAIL' end, 'rows: ' || count(*)
    from public.jobs where slug = 'fixture-overflow'
      and description ~ ('(^|\n)- ' || repeat('trial', 36))
  union all
  select 6, 'c6  one in a PARAGRAPH',
         case when count(*) = 1 then 'PASS' else 'FAIL' end, 'rows: ' || count(*)
    from public.jobs where slug = 'fixture-overflow'
      and description ~ ('(^|\n)' || repeat('trial', 36) || '$')
  union all
  select 7, 'c7  the description clears the 400-character minimum',
         case when coalesce(min(length(description)), 0) >= 400 then 'PASS' else 'FAIL' end,
         -- coalesce, because min() over zero rows is NULL and 'length: ' || NULL
         -- is NULL -- an empty cell rather than a readable "0". Caught by
         -- running this block before handing the file over.
         'length: ' || coalesce(min(length(description))::text, '0 (no fixture row)')
    from public.jobs where slug = 'fixture-overflow'
  union all
  select 8, 'c8  it brought its own company, not a real one',
         case when count(*) = 1 then 'PASS' else 'FAIL' end,
         'rows: ' || count(*)
    from public.companies where slug = 'fixture-overflow-test'
  union all
  select 9, 'c9  REMEMBER',
         'INFO',
         'it is LIVE and therefore on the public board. Run the remove file when the sweep is done'
) checks
order by seq;
