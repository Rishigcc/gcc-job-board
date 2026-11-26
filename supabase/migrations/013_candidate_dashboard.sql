-- ===========================================================================
-- 013_candidate_dashboard.sql   --   stage 8, the candidate's own side
--
-- WHAT THIS STAGE PROMISES, IN THE PRIVACY POLICY'S OWN WORDS
--   "Your name, email address, phone number, notice period and the reference
--    linking the application to your account are all erased from our
--    database -- not hidden, erased."
--
--   So this migration starts by making those columns nullable. Hiding them
--   behind a function, which is what stage 7 does for an unverified
--   recruiter, is the right answer when the data must still exist. It is the
--   WRONG answer here: the policy says erased, and a column that still holds
--   the name has not erased anything.
--
--   "Once anonymised, neither we nor the recruiter can connect that
--    application back to you."
--
--   That sentence is why candidate_id goes too. Nulling the name while
--   keeping the account reference would leave the link intact and the
--   sentence false. Two consequences follow, and both are now stated on the
--   button and in the policy: the candidate loses sight of the application
--   as well, and they may apply to that role again afterwards.
--
-- NO WITHDRAW IN VERSION 1
--   Decided 22 Nov 2026. 'withdrawn' stays in the status CHECK, where it has
--   been since migration 007, so version 2 is a screen and not a migration.
--   Nothing in this file sets it.
--
-- THE WRITE FUNCTIONS ARE NOT CALLABLE FROM A BROWSER, ON PURPOSE
--   Deleting a resume is two things that must both happen: a row goes, and a
--   file in private storage goes. Only the service key can delete the file.
--   If the database half were callable by the browser, a hand-written RPC
--   call would anonymise the row and leave the file sitting there -- and the
--   policy's "permanently deleted" would be false with nothing to notice it.
--
--   So delete_resume_for() and anonymise_job_data_for() take a user id and
--   are granted to service_role ONLY. There is no client-callable path to
--   either. The endpoints verify the bearer token with the service key,
--   exactly as /api/upload-resume already does, and pass the verified id.
--   my_applications() is read-only and stays callable by the candidate.
--
-- ROLLBACK: 013_candidate_dashboard_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ERASABLE COLUMNS
--
-- Every CHECK constraint on these columns already tolerates NULL, because a
-- CHECK that evaluates to NULL passes. Verified against the live definitions
-- before writing this, so none of them needs altering:
--
--   applications_full_name_check      length(btrim(full_name)) between 2..120
--   applications_email_check          position('@' in email) > 1
--   applications_notice_period_check  notice_period = any (...)
--
-- one_application_per_job is UNIQUE (job_id, candidate_id). In Postgres NULLs
-- do not collide in a unique index, so several anonymised applications to the
-- same role coexist, and the same person may apply to that role again. That
-- is the decided behaviour, not a side effect being tolerated.
--
-- The foreign key to auth.users is ON DELETE CASCADE. Once candidate_id is
-- null, deleting the auth account no longer takes the anonymous record with
-- it -- which is what we want, because the record is the recruiter's.
-- ---------------------------------------------------------------------------
alter table public.applications alter column candidate_id  drop not null;
alter table public.applications alter column full_name     drop not null;
alter table public.applications alter column email         drop not null;
alter table public.applications alter column notice_period drop not null;

-- ---------------------------------------------------------------------------
-- 2. WHEN A ROLE CLOSED
--
-- The policy says applications are kept "for up to 12 months after it closes
-- or expires". That could not be computed: closing early was not recorded
-- anywhere, and updated_at moves on any edit. Measuring from expires_at
-- instead would BREACH the sentence rather than satisfy it -- a role closed
-- on day 3 still expires on day 30, so its applications would be held about
-- 12.9 months after closing.
--
-- Rishi's decision, 22 Nov 2026: record the date rather than reword around
-- not having it, because once roles close without it that date is gone for
-- good, and stage 9's admin queue will want it.
--
-- Reopening clears it, so retention always measures from the most recent
-- close. There is deliberately NO backfill: for roles already closed the
-- date genuinely is not recoverable, and inventing one would be worse than
-- the coalesce fallback. All such rows today are test data.
--
-- closed_at is not in any recruiter column grant and must not be added to
-- one. The trigger sets it; a trigger function is not subject to the caller's
-- column privileges.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists closed_at timestamptz;

create or replace function private.jobs_set_closed_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
begin
  if new.status = 'closed' and coalesce(old.status, '') <> 'closed' then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.jobs_set_closed_at() from public, anon, authenticated;

-- BEFORE UPDATE only: a job cannot be inserted closed. The insert policy
-- requires the column default, which is 'live'.
drop trigger if exists jobs_set_closed_at on public.jobs;
create trigger jobs_set_closed_at
  before update on public.jobs
  for each row execute function private.jobs_set_closed_at();

-- ---------------------------------------------------------------------------
-- 3. THE CANDIDATE'S OWN APPLICATIONS  --  readable by them
--
-- A definer function rather than a direct read, for one reason: a candidate
-- must still see an application to a role that has since closed or expired,
-- and private.job_is_public() hides exactly those. A plain join from
-- applications to jobs would make an application vanish the day its role
-- ended, which is the moment the candidate most wants to know what happened.
--
-- job_has_ended is derived here and never stored, the same way the recruiter
-- side derives expiry. The page turns it into "Closed" only when the
-- recruiter has not already said something more specific.
--
-- Anonymised applications do not appear, and need no filter to exclude them:
-- their candidate_id is null, so they match nobody.
-- ---------------------------------------------------------------------------
create or replace function public.my_applications()
  returns table (
    id            bigint,
    job_id        bigint,
    job_title     text,
    job_slug      text,
    company_name  text,
    city          text,
    status        text,
    created_at    timestamptz,
    job_has_ended boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select a.id,
         j.id,
         j.title,
         j.slug,
         c.name,
         j.city,
         a.status,
         a.created_at,
         (j.status <> 'live' or j.expires_at <= now())
    from public.applications a
    join public.jobs j on j.id = a.job_id
    left join public.companies c on c.id = j.company_id
   where a.candidate_id = auth.uid()
   order by a.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. DELETING A RESUME ON ITS OWN  --  service_role only
--
-- Returns the path it removed so the caller can confirm what it deleted, or
-- null if there was nothing on file. The endpoint deletes the FILE first and
-- calls this second: that way a failed file delete changes nothing and can
-- be retried, where the other order would leave the policy's "permanently
-- deleted" untrue.
-- ---------------------------------------------------------------------------
create or replace function public.delete_resume_for(p_user uuid)
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_path text;
begin
  if p_user is null then
    raise exception 'No user given.';
  end if;

  delete from public.candidate_resumes
   where candidate_id = p_user
   returning resume_path into v_path;

  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. DELETE MY JOB BOARD DATA  --  service_role only
--
-- Job board only. It does not touch public.profiles, questions, answers,
-- hearts, saves or the auth account -- that is the decided scope, it is what
-- the policy says, and it is printed on the button itself.
--
-- status is deliberately left alone. A recruiter who shortlisted someone
-- keeps that fact; what they lose is who it was.
--
-- consent_at stays too. It is our own record that permission was given at
-- the time, it names nobody once candidate_id is gone, and deleting it would
-- destroy the evidence that the original sharing was lawful.
-- ---------------------------------------------------------------------------
create or replace function public.anonymise_job_data_for(p_user uuid)
  returns table (
    applications_anonymised integer,
    resume_path_removed     text
  )
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_count integer;
  v_path  text;
begin
  if p_user is null then
    raise exception 'No user given.';
  end if;

  delete from public.candidate_resumes
   where candidate_id = p_user
   returning resume_path into v_path;

  update public.applications
     set candidate_id  = null,
         full_name     = null,
         email         = null,
         phone         = null,
         notice_period = null,
         anonymised_at = now()
   where candidate_id = p_user
     and anonymised_at is null;

  get diagnostics v_count = row_count;

  return query select v_count, v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. THE 12-MONTH RETENTION SWEEP  --  service_role only
--
-- Called once a day from api/rebuild.js, after the deploy hook has fired.
-- It runs inside an existing cron rather than needing a third slot, which
-- the Hobby plan does not have.
--
-- It touches no files. Resumes have their own retention -- "until you
-- replace or delete it" -- and there is one per candidate, not one per
-- application, so an application sweep never deletes a resume. One
-- statement, nothing to half-finish.
--
-- A hard delete, not an anonymise. The policy says we keep applications for
-- up to 12 months; after that the honest thing is that they are gone.
--
-- p_limit caps one run so a backlog cannot turn into a long transaction.
-- At one run a day the cap only matters after an outage.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_applications(p_limit integer default 5000)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  with doomed as (
    select a.id
      from public.applications a
      join public.jobs j on j.id = a.job_id
     where coalesce(j.closed_at, j.expires_at) < now() - interval '12 months'
     order by a.id
     limit greatest(coalesce(p_limit, 5000), 1)
  )
  delete from public.applications
   where id in (select id from doomed);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. GRANTS
--
-- The read is the candidate's. The three writes are the server's, and the
-- grant is the only thing standing between "pass your own id" and "pass
-- anybody's" -- which is why none of them is granted to authenticated and
-- why that must not change.
-- ---------------------------------------------------------------------------
revoke all on function public.my_applications()                      from public;
revoke all on function public.delete_resume_for(uuid)                from public;
revoke all on function public.anonymise_job_data_for(uuid)           from public;
revoke all on function public.purge_expired_applications(integer)    from public;

grant execute on function public.my_applications() to authenticated;

grant execute on function public.delete_resume_for(uuid)             to service_role;
grant execute on function public.anonymise_job_data_for(uuid)        to service_role;
grant execute on function public.purge_expired_applications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. CHECKS
--
-- Expect, in order:
--   a) the four columns nullable, closed_at present
--   b) all four functions prosecdef true with search_path pinned
--   c) auth_* true ONLY for my_applications; anon_* all false;
--      service_* true for the three writes
--   d) applications policies unchanged -- still three, still no recruiter
--   e) purge_preview = how many applications TODAY are already past 12
--      months. Expect 0; anything else means the sweep would delete on its
--      first run, which you want to know before the cron does it.
-- ---------------------------------------------------------------------------
select column_name, is_nullable, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (table_name = 'applications'
          and column_name in ('candidate_id','full_name','email','notice_period','phone')
        or table_name = 'jobs' and column_name = 'closed_at')
 order by table_name, column_name;

select p.proname, p.prosecdef, p.provolatile, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private')
   and p.proname in ('my_applications','delete_resume_for','anonymise_job_data_for',
                     'purge_expired_applications','jobs_set_closed_at')
 order by p.proname;

select
  has_function_privilege('authenticated','public.my_applications()','EXECUTE')                   as auth_my_applications,
  has_function_privilege('authenticated','public.anonymise_job_data_for(uuid)','EXECUTE')        as auth_anonymise,
  has_function_privilege('authenticated','public.delete_resume_for(uuid)','EXECUTE')             as auth_delete_resume,
  has_function_privilege('authenticated','public.purge_expired_applications(integer)','EXECUTE') as auth_purge,
  has_function_privilege('anon','public.my_applications()','EXECUTE')                            as anon_my_applications,
  has_function_privilege('service_role','public.anonymise_job_data_for(uuid)','EXECUTE')         as service_anonymise,
  has_function_privilege('service_role','public.delete_resume_for(uuid)','EXECUTE')              as service_delete_resume,
  has_function_privilege('service_role','public.purge_expired_applications(integer)','EXECUTE')  as service_purge;

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'applications'
 order by cmd, policyname;

select count(*) as purge_preview
  from public.applications a
  join public.jobs j on j.id = a.job_id
 where coalesce(j.closed_at, j.expires_at) < now() - interval '12 months';

select count(*) as unpinned_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private') and p.prokind = 'f'
   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
