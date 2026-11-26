-- ===========================================================================
-- 008_candidate_resumes_rollback.sql
--
-- NOT A CLEAN UNDO, AND IT SHOULD NOT PRETEND TO BE.
--
-- Going forward dropped applications.resume_path. Coming back restores the
-- column, but the per-application history it held is gone: every application
-- is repointed at the candidate's current resume, which is the best that can
-- be reconstructed. Applications by a candidate with no resume on file end up
-- with no path at all, so the column comes back NULLABLE.
--
-- Run this only if migration 008 has to be reversed before launch, while the
-- only applications are test ones.
-- ===========================================================================

alter table public.applications
  add column if not exists resume_path text;

update public.applications a
   set resume_path = cr.resume_path
  from public.candidate_resumes cr
 where cr.candidate_id = a.candidate_id
   and a.resume_path is null;

-- The 007 guard: pin the path to the candidate's own folder.
create or replace function private.applications_guard()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_catalog
as $$
begin
  if new.resume_path !~ ('^' || new.candidate_id::text || '/') then
    raise exception
      'A resume can only be attached from your own upload. Please upload the file again.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

grant insert (resume_path) on public.applications to authenticated;

drop trigger if exists candidate_resumes_guard on public.candidate_resumes;
drop function if exists private.candidate_resumes_guard();
drop table if exists public.candidate_resumes;

select count(*) as applications_without_a_resume
  from public.applications where resume_path is null;
