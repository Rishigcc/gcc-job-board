-- ===========================================================================
-- 013_candidate_dashboard_rollback.sql
--
-- NOT A CLEAN UNDO, AND IT MUST NOT CLAIM TO BE.
--
-- Putting NOT NULL back on the four columns FAILS if any application has
-- already been anonymised -- correctly, because the data it would need is
-- gone. That is the point of the feature. So this script reports what is in
-- the way instead of forcing it, and the restore of NOT NULL is left
-- commented out for a human to run only once the count is zero.
--
-- Run this only before launch, while every application is test data.
-- ===========================================================================

drop function if exists public.purge_expired_applications(integer);
drop function if exists public.anonymise_job_data_for(uuid);
drop function if exists public.delete_resume_for(uuid);
drop function if exists public.my_applications();

drop trigger if exists jobs_set_closed_at on public.jobs;
drop function if exists private.jobs_set_closed_at();

alter table public.jobs drop column if exists closed_at;

-- Expect 0. Each row here is an anonymised application whose name, email and
-- account reference no longer exist, so NOT NULL cannot be restored over it.
-- The only ways forward are to delete these rows or to leave the columns
-- nullable.
select count(*) as anonymised_applications_blocking_not_null
  from public.applications
 where anonymised_at is not null
    or candidate_id is null
    or full_name is null
    or email is null
    or notice_period is null;

-- Only once the count above is 0:
--
-- alter table public.applications alter column candidate_id  set not null;
-- alter table public.applications alter column full_name     set not null;
-- alter table public.applications alter column email         set not null;
-- alter table public.applications alter column notice_period set not null;
