-- ============================================================================
-- ROLLBACK for 001_job_board_foundation.sql
--
-- Safe to run at any time before real recruiters exist. It drops only objects
-- that 001 created. It does not touch profiles, questions, answers, hearts,
-- saves, user_activity, feature_interest, resume_preparer_interest, or any
-- existing policy, function or trigger.
--
-- `cascade` on the tables removes their own policies, triggers and indexes.
-- Run the statements in this order: jobs references companies, and both
-- reference auth.users.
-- ============================================================================

drop table if exists public.jobs               cascade;
drop table if exists public.companies          cascade;
drop table if exists public.recruiter_profiles cascade;
drop table if exists public.user_roles         cascade;

drop function if exists private.job_is_public(text, timestamptz, uuid);
drop function if exists private.recruiter_live_job_count(uuid);
drop function if exists private.recruiter_is_verified(uuid);
drop function if exists private.is_active_recruiter();
drop function if exists private.is_admin();
drop function if exists private.handle_new_recruiter();
drop function if exists private.touch_updated_at();

-- Only drops the schema if 001 was the only thing using it.
drop schema if exists private restrict;
