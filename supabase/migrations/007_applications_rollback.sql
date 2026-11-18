-- Undo 007_applications.sql.
--
-- WARNING: this drops every application that has been submitted, and the
-- bucket delete fails unless the bucket is empty. Empty it first from
-- Storage in the dashboard if you really mean it.
drop trigger if exists applications_guard on public.applications;
drop table if exists public.applications;
drop function if exists private.applications_guard();
drop function if exists private.job_accepts_applications(bigint);
delete from storage.buckets where id = 'resumes';
