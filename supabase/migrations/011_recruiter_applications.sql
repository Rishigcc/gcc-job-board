-- ===========================================================================
-- 011_recruiter_applications.sql   --   stage 7, the recruiter side
--
-- THE POINT OF THIS STAGE
--   An UNVERIFIED recruiter sees counts and dates. Never a name, never an
--   email, never a phone number, never a resume. Not hidden in the UI -- the
--   data does not leave the database.
--
-- HOW THAT IS DONE, AND WHY NOT WITH A POLICY
--   public.applications still has NO select policy mentioning recruiters, and
--   this migration does not add one. It adds no policy and no grant to that
--   table at all. Stage 6's design is left exactly as it was tested.
--
--   The reason is that RLS cannot do this job. A policy is row-level: one
--   that lets a recruiter match their applications lets them read EVERY
--   column of those rows, names and emails included, and there is no second
--   policy that can take columns back. Column grants can, but a grant is
--   per-role, not per-row -- it cannot say "this recruiter but not that one".
--   Verification is a per-row, per-column rule, so it belongs in a function
--   that returns only the columns the caller has earned.
--
--   So: four SECURITY DEFINER functions, each with a named column list.
--   A recruiter can call nothing else and reach nothing else.
--
-- THE GRANT RULE (see 009 and the tracker)
--   These functions need NO grant on public.applications. A SECURITY DEFINER
--   function runs as its owner, `postgres`, which already has everything.
--   service_role is deliberately still granted nothing on applications, and
--   must stay that way: /api/resume-url uses the CALLER'S token for the
--   authorisation decision and the service key only to sign a storage URL,
--   which is the one thing only the service key can do.
--
-- WHAT AN UNVERIFIED CALLER GETS: AN EMPTY RESULT, NOT AN ERROR
--   recruiter_applications() returns zero rows when the caller is not
--   verified. That is deliberate and it is what makes the gate checkable in
--   one browser request: `[]` with three applications sitting in the table.
--   The page does not infer "no applications" from that -- it reads
--   is_verified from the recruiter's own profile row and shows the gate.
--
-- ROLLBACK: 011_recruiter_applications_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. COUNTS AND DATES  --  allowed before verification
--
-- The one thing an unverified recruiter may know: how many people applied to
-- each of their own roles, and when the most recent one arrived. No row is
-- per-candidate, so there is nothing here to identify anyone.
--
-- A suspended or unconfirmed recruiter gets nothing at all. Their jobs are
-- already invisible publicly (private.job_is_public), so showing them a live
-- application count would be the only part of the product still treating them
-- as active.
-- ---------------------------------------------------------------------------
create or replace function public.recruiter_application_counts()
  returns table (
    job_id            bigint,
    application_count integer,
    latest_at         timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select a.job_id,
         count(*)::integer,
         max(a.created_at)
    from public.applications a
    join public.jobs j on j.id = a.job_id
   where j.posted_by = auth.uid()
     and private.is_active_recruiter()
   group by a.job_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. THE APPLICATIONS THEMSELVES  --  verified only
--
-- Every column is named. Deliberately absent:
--
--   candidate_id   a recruiter has no use for the uuid, and withholding it
--                  means they cannot carry it to any other table
--   consent_at     our record that consent was given, not theirs to read
--   resume_path    handed out only by function 3, one application at a time
--
-- An anonymised application (stage 8's delete-my-data) keeps its row so a
-- shortlist does not develop holes, but every identifying column comes back
-- null. The UI shows "this candidate removed their data" rather than a blank
-- that looks like a bug.
-- ---------------------------------------------------------------------------
create or replace function public.recruiter_applications(p_job_id bigint)
  returns table (
    id                bigint,
    full_name         text,
    email             text,
    phone             text,
    notice_period     text,
    status            text,
    created_at        timestamptz,
    resume_updated_at timestamptz,
    is_anonymised     boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select a.id,
         case when a.anonymised_at is null then a.full_name end,
         case when a.anonymised_at is null then a.email end,
         case when a.anonymised_at is null then a.phone end,
         a.notice_period,
         a.status,
         a.created_at,
         case when a.anonymised_at is null then cr.updated_at end,
         a.anonymised_at is not null
    from public.applications a
    join public.jobs j on j.id = a.job_id
    left join public.candidate_resumes cr on cr.candidate_id = a.candidate_id
   where a.job_id = p_job_id
     and j.posted_by = auth.uid()
     and private.is_active_recruiter()
     and private.recruiter_is_verified(auth.uid())
   order by a.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 3. ONE RESUME PATH, ONE APPLICATION AT A TIME  --  verified only
--
-- Returns a path, not a URL. The `resumes` bucket has no policies on
-- storage.objects, so a path is not a way in: /api/resume-url exchanges it
-- for a short-lived signed URL using the service key, and only after this
-- function has agreed.
--
-- Returning null means "no" for every reason -- not your job, not verified,
-- suspended, anonymised, no resume on file. The caller gets 403 either way,
-- so the distinction is not something to leak.
-- ---------------------------------------------------------------------------
create or replace function public.recruiter_resume_path(p_application_id bigint)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select cr.resume_path
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.candidate_resumes cr on cr.candidate_id = a.candidate_id
   where a.id = p_application_id
     and a.anonymised_at is null
     and j.posted_by = auth.uid()
     and private.is_active_recruiter()
     and private.recruiter_is_verified(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 4. MOVING AN APPLICATION'S STATUS  --  verified only
--
-- A function rather than an UPDATE policy plus a column grant, which would
-- also have worked. The reason is the instruction this stage was given:
-- prefer a narrow function over widening public.applications. A grant is
-- permanent surface on the table; this is one entry point with one allowed
-- column and three allowed values.
--
-- 'withdrawn' is NOT settable here. It is the candidate's word about their
-- own application and belongs to stage 8.
--
-- The messages are raised as P0001 so they reach the recruiter as sentences
-- rather than as an RLS error, the same reason migration 004 exists.
-- ---------------------------------------------------------------------------
create or replace function public.recruiter_set_application_status(
    p_application_id bigint,
    p_status         text
  )
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_owned boolean;
begin
  if p_status not in ('applied', 'shortlisted', 'not_selected') then
    raise exception 'That is not a status an application can be moved to.';
  end if;

  if not private.is_active_recruiter() then
    raise exception
      'This account cannot update applications. It may be suspended, or its email address may never have been confirmed.';
  end if;

  if not private.recruiter_is_verified(auth.uid()) then
    raise exception
      'Your company has to be verified before you can work through applications.';
  end if;

  select exists (
    select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
     where a.id = p_application_id
       and j.posted_by = auth.uid()
       and a.anonymised_at is null
  ) into v_owned;

  if not v_owned then
    raise exception 'That application could not be updated.';
  end if;

  update public.applications
     set status = p_status
   where id = p_application_id;

  return p_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. GRANTS
--
-- EXECUTE to authenticated only. anon gets nothing: there is no anonymous
-- recruiter. Revoked from public first, because a new function is executable
-- by PUBLIC by default -- which would include anon.
-- ---------------------------------------------------------------------------
revoke all on function public.recruiter_application_counts()                      from public;
revoke all on function public.recruiter_applications(bigint)                      from public;
revoke all on function public.recruiter_resume_path(bigint)                       from public;
revoke all on function public.recruiter_set_application_status(bigint, text)      from public;

grant execute on function public.recruiter_application_counts()                 to authenticated;
grant execute on function public.recruiter_applications(bigint)                 to authenticated;
grant execute on function public.recruiter_resume_path(bigint)                  to authenticated;
grant execute on function public.recruiter_set_application_status(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. CHECKS
--
-- Expect, in order:
--   a) four functions, prosecdef true, search_path pinned on each
--   b) anon_execute false on all four, auth_execute true on all four
--   c) policies on applications UNCHANGED -- still three, still no recruiter
--   d) no new privilege on the table for anyone
-- ---------------------------------------------------------------------------
select p.proname, p.prosecdef, p.provolatile, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('recruiter_application_counts', 'recruiter_applications',
                     'recruiter_resume_path', 'recruiter_set_application_status')
 order by p.proname;

select
  has_function_privilege('anon',          'public.recruiter_applications(bigint)', 'EXECUTE') as anon_applications,
  has_function_privilege('anon',          'public.recruiter_resume_path(bigint)',  'EXECUTE') as anon_resume_path,
  has_function_privilege('authenticated', 'public.recruiter_applications(bigint)', 'EXECUTE') as auth_applications,
  has_function_privilege('authenticated', 'public.recruiter_resume_path(bigint)',  'EXECUTE') as auth_resume_path;

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'applications'
 order by cmd, policyname;

select
  has_table_privilege('authenticated','public.applications','UPDATE') as auth_update,
  has_table_privilege('service_role','public.applications','SELECT')  as service_select,
  has_table_privilege('service_role','public.applications','UPDATE')  as service_update,
  has_table_privilege('anon','public.applications','SELECT')          as anon_select;
