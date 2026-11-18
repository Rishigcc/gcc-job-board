-- Undo 005_public_job_detail.sql.
-- The job detail page stops showing the posting agency; nothing else changes.
drop function if exists public.job_posting_agency(bigint);
