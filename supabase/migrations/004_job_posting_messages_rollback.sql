-- ===========================================================================
-- ROLLBACK for 004_job_posting_messages.sql
--
-- Removes the trigger and its function. The 10-live-roles cap is UNAFFECTED:
-- it lives in the `active recruiters post own jobs` insert policy from
-- migration 001 and is not touched here. After running this, a recruiter who
-- hits the cap goes back to seeing:
--
--     new row violates row-level security policy for table "jobs"
--
-- So this rollback makes the product worse, not less safe.
-- ===========================================================================

drop trigger if exists jobs_cap_guard on public.jobs;
drop function if exists private.jobs_cap_guard();
