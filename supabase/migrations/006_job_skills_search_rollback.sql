-- Undo 006_job_skills_search.sql.
-- Searching by skill stops working; nothing else changes.
drop trigger if exists jobs_set_skills_text on public.jobs;
drop function if exists private.jobs_set_skills_text();
alter table public.jobs drop column if exists skills_text;
