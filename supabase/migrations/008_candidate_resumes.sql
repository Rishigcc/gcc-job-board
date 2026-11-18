-- ===========================================================================
-- 008_candidate_resumes.sql   --   stage 6, one resume per candidate
--
-- WHAT CHANGES, AND WHY IT IS A DELIBERATE REVERSAL
--   Migration 007 stored a copy of the resume path on every application, so
--   an application was a record of exactly what was sent on the day. That is
--   replaced here: the resume now lives on the candidate, one row per person,
--   and every application points at whatever is current.
--
--   The trade-off is real and was accepted knowingly. A recruiter who
--   shortlisted someone in March and opens the file in May may be reading a
--   different document. The mitigation is that the resume carries the date it
--   was last updated, and stage 7 shows that date beside the download, so a
--   recruiter is never silently handed a newer file without being told.
--
--   What it buys: a candidate uploads once, not once per role. On a board
--   where someone applies to six roles in an evening, that is the difference
--   between applying and giving up.
--
-- NO ONE WRITES THIS TABLE FROM THE BROWSER
--   There is no insert, update or delete policy and no write grant. The only
--   thing that writes it is /api/upload-resume, running with the service key,
--   which has already read the file's first bytes and built the path from a
--   verified user id. A path is therefore never a value a client chose.
--
--   The guard trigger below is a second lock on the same door: the service
--   key bypasses RLS, but it does not bypass triggers.
--
-- STILL ABSENT: any policy mentioning recruiters. Same design as 007. Stage 7
-- reads this table through a narrow SECURITY DEFINER function that checks the
-- recruiter posted the job and that their company is verified.
--
-- ROLLBACK: 008_candidate_resumes_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.candidate_resumes (
  candidate_id uuid primary key references auth.users(id) on delete cascade,

  -- Path inside the private `resumes` bucket, always under the candidate's
  -- own user id. Pinned by the trigger below.
  resume_path  text not null check (length(resume_path) between 10 and 400),

  created_at   timestamptz not null default now(),

  -- The mitigation, in a column. Stage 7 renders this as
  -- "Resume updated on <date>" beside the recruiter's download.
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. FUNCTIONS  (private schema -- never add `private` to Exposed schemas)
-- ---------------------------------------------------------------------------

create or replace function private.candidate_resumes_guard()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_catalog
as $$
begin
  if new.resume_path !~ ('^' || new.candidate_id::text || '/') then
    raise exception
      'A resume can only be stored under its own candidate folder.';
  end if;

  -- Only on UPDATE, so the backfill below can carry the real dates of the
  -- resumes it is importing rather than stamping them all with today.
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.candidate_resumes_guard() from public, anon, authenticated;

drop trigger if exists candidate_resumes_guard on public.candidate_resumes;
create trigger candidate_resumes_guard
  before insert or update on public.candidate_resumes
  for each row execute function private.candidate_resumes_guard();

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY -- read-only, and only your own row
-- ---------------------------------------------------------------------------
alter table public.candidate_resumes enable row level security;

-- Dropped first so the whole file can be re-run if a run half-fails.
drop policy if exists "candidate reads own resume" on public.candidate_resumes;
drop policy if exists "admin reads all resumes"    on public.candidate_resumes;

create policy "candidate reads own resume" on public.candidate_resumes
  for select to authenticated
  using (candidate_id = auth.uid());

create policy "admin reads all resumes" on public.candidate_resumes
  for select to authenticated
  using (private.is_admin());

revoke all on public.candidate_resumes from anon, authenticated;
grant select on public.candidate_resumes to authenticated;

-- ---------------------------------------------------------------------------
-- 4. BACKFILL -- before the old column is dropped, not after
--
-- The most recent resume each candidate sent becomes their resume on file,
-- carrying the date it was actually sent.
-- ---------------------------------------------------------------------------
insert into public.candidate_resumes (candidate_id, resume_path, created_at, updated_at)
select distinct on (a.candidate_id)
       a.candidate_id, a.resume_path, a.created_at, a.created_at
  from public.applications a
 where a.resume_path is not null
 order by a.candidate_id, a.created_at desc
on conflict (candidate_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. APPLICATIONS -- the per-application copy goes
--
-- Dropping the column also drops its insert grant, so there is no longer any
-- client-supplied path anywhere in the apply flow.
--
-- The guard keeps its job but changes what it guards: an application must
-- still be impossible without a resume, which used to be the NOT NULL on
-- resume_path and is now the existence of a row in candidate_resumes. Only
-- on INSERT -- stage 8 anonymises by UPDATE after the resume is gone.
-- ---------------------------------------------------------------------------
create or replace function private.applications_guard()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT'
     and not exists (
       select 1 from public.candidate_resumes cr
        where cr.candidate_id = new.candidate_id
     ) then
    raise exception
      'Upload your resume before applying. If you have just uploaded one, reload the page and try again.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter table public.applications drop column if exists resume_path;

-- ---------------------------------------------------------------------------
-- 6. CHECKS
--
-- These use has_table_privilege() rather than information_schema, because the
-- information_schema grant views only show grants the CURRENT role can see.
-- Run as the dashboard user they come back empty whether or not the grant
-- exists -- and a check that cannot fail is not a check. has_*_privilege()
-- answers for any role, regardless of who is asking.
--
-- Expect, in order:
--   a) two select policies, neither of them naming a recruiter
--   b) candidate_select true, EVERY OTHER COLUMN FALSE
--   c) resume_path_on_applications = 0
--   d) one row per candidate who had already applied (0 if none had)
-- ---------------------------------------------------------------------------
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'candidate_resumes'
 order by cmd, policyname;

select
  has_table_privilege('authenticated','public.candidate_resumes','SELECT')  as candidate_select,
  has_table_privilege('authenticated','public.candidate_resumes','INSERT')  as candidate_insert,
  has_table_privilege('authenticated','public.candidate_resumes','UPDATE')  as candidate_update,
  has_table_privilege('authenticated','public.candidate_resumes','DELETE')  as candidate_delete,
  has_column_privilege('authenticated','public.candidate_resumes','resume_path','UPDATE') as path_update,
  has_table_privilege('anon','public.candidate_resumes','SELECT')           as anon_select;

select count(*) as resume_path_on_applications
  from information_schema.columns
 where table_schema = 'public' and table_name = 'applications'
   and column_name = 'resume_path';

select count(*) as resumes_on_file from public.candidate_resumes;
