-- ===========================================================================
-- 020_job_saves.sql   --   Stage 10, round one. Saving a role for later.
--
-- WHAT THIS ADDS
--   public.job_saves        one row per (job, person). A bookmark, nothing more.
--   public.my_saved_jobs()  the saved list, with each role's availability.
--
-- IT IS A DELIBERATE COPY OF public.question_saves
--   Same shape (composite primary key, both foreign keys cascading), same
--   three policies, same grants. The community has used question_saves since
--   before the job board existed and it has never misbehaved, so the job
--   board's version is not an opportunity to do it differently.
--
-- WHY THERE IS A FUNCTION AS WELL AS A TABLE
--   The saved list cannot be a plain join from the browser. public.jobs has
--   a select policy built on private.job_is_public(), so a role that closed,
--   expired, was hidden by an admin, or whose recruiter was suspended simply
--   stops being returned -- and a saved role that vanishes from the list with
--   no explanation reads as a bug. Worse, the count on /profile counts rows
--   in job_saves, so the number and the page would disagree.
--
--   So the function returns EVERY save, always, and says which of three
--   states each one is in:
--
--     open        still accepting applications
--     closed      filled, closed by the recruiter, or past its closing date
--     withdrawn   hidden by an admin, or its recruiter is suspended
--
--   THE DIFFERENCE BETWEEN 'closed' AND 'withdrawn' IS NOT COSMETIC. A closed
--   role was a real posting that ran its course, so its title and company are
--   still shown -- the person saved it and is entitled to know which role it
--   was. A withdrawn role was taken down by us, which is the one case where
--   continuing to display the recruiter's words would be wrong. For those the
--   function returns the save and NULLS EVERY DISPLAY COLUMN, so the page can
--   account for the row without repeating anything an admin removed.
--
-- NO SERVICE-ROLE GRANT, AND THAT IS CHECKED
--   No server endpoint reads or writes this table: the browser does, under
--   its own policies, and the saved list comes from the definer function
--   below. Migrations 008/009 and 015 were all the same trap in reverse (a
--   table server code HAD to write with no grant to service_role), so the
--   rule is worth stating in both directions: the grant goes in the same
--   migration as the table when server code needs it, and does not exist
--   when nothing server-side touches it. c3 asserts that is still true.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It does not change /api/delete-my-data. Whether "Delete my job board
--   data" should also forget saved roles is a decision, not an oversight:
--   saved QUESTIONS are deliberately untouched by it, the privacy policy
--   lists applications and the resume by name, and a saved role holds no
--   personal detail that an application does not already hold. It is raised
--   as a [DECIDE] in the stage 10 checklist. Deleting the ACCOUNT already
--   clears these rows, by the cascade below.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists public.job_saves (
  job_id     bigint      not null references public.jobs (id)      on delete cascade,
  user_id    uuid        not null references auth.users (id)        on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

comment on table public.job_saves is
  'A candidate bookmarking a role. Mirrors public.question_saves. Read by the '
  'browser under its own policies and by public.my_saved_jobs(); no server '
  'endpoint touches it, so there is no grant to service_role.';

-- A person opening /profile/saved-jobs reads their own rows, newest first.
create index if not exists job_saves_user_created_idx
  on public.job_saves (user_id, created_at desc);

alter table public.job_saves enable row level security;


-- ---------------------------------------------------------------------------
-- Policies. Three, each one the same clause: your rows, nobody else's.
--
-- There is no update policy and no update grant, because there is nothing in
-- a row to update. A save is created or it is removed.
-- ---------------------------------------------------------------------------
drop policy if exists "job_saves_select_own" on public.job_saves;
create policy "job_saves_select_own"
  on public.job_saves for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "job_saves_insert_own" on public.job_saves;
create policy "job_saves_insert_own"
  on public.job_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "job_saves_delete_own" on public.job_saves;
create policy "job_saves_delete_own"
  on public.job_saves for delete
  to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Grants. This project's default privileges hand new public tables only
-- Dxtm, so every one of these has to be said out loud.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.job_saves to authenticated;
-- anon gets nothing: saving requires an account. Not stated as a revoke
-- because it was never granted; c3 proves it.


-- ---------------------------------------------------------------------------
-- The saved list.
--
-- SECURITY DEFINER because it has to see rows in public.jobs that the
-- caller's own policy hides -- that is the entire reason it exists. It is
-- safe to do so because the only rows it can reach are ones the caller
-- themselves saved: the join starts from job_saves filtered by auth.uid(),
-- and auth.uid() cannot be passed in. There is no argument.
--
-- search_path is pinned, per migration 012.
-- ---------------------------------------------------------------------------
create or replace function public.my_saved_jobs()
returns table (
  job_id           bigint,
  saved_at         timestamptz,
  availability     text,
  title            text,
  slug             text,
  city             text,
  work_mode        text,
  job_function     text,
  employment_type  text,
  experience_min   integer,
  experience_max   integer,
  salary_min       integer,
  salary_max       integer,
  salary_currency  text,
  salary_period    text,
  skills           text[],
  published_at     timestamptz,
  expires_at       timestamptz,
  company_name     text,
  company_logo_url text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with mine as (
    select s.job_id, s.created_at as saved_at
    from public.job_saves s
    where s.user_id = auth.uid()
  ),
  classified as (
    select
      m.job_id,
      m.saved_at,
      j.*,
      c.name     as company_name,
      c.logo_url as company_logo_url,
      case
        when private.job_is_public(j.status, j.expires_at, j.posted_by)
          then 'open'
        when j.status = 'hidden'
          or exists (
            select 1 from public.recruiter_profiles r
            where r.user_id = j.posted_by and r.is_suspended
          )
          then 'withdrawn'
        else 'closed'
      end as availability
    from mine m
    join public.jobs j on j.id = m.job_id
    left join public.companies c on c.id = j.company_id
  )
  select
    k.job_id,
    k.saved_at,
    k.availability,
    -- Everything below is withheld for a withdrawn role. Listing the columns
    -- one by one rather than building the row conditionally is deliberate:
    -- a column added to public.jobs later cannot leak through this function
    -- by accident, because it will not be here at all.
    case when k.availability = 'withdrawn' then null else k.title end,
    case when k.availability = 'withdrawn' then null else k.slug end,
    case when k.availability = 'withdrawn' then null else k.city end,
    case when k.availability = 'withdrawn' then null else k.work_mode end,
    case when k.availability = 'withdrawn' then null else k.job_function end,
    case when k.availability = 'withdrawn' then null else k.employment_type end,
    case when k.availability = 'withdrawn' then null else k.experience_min end,
    case when k.availability = 'withdrawn' then null else k.experience_max end,
    case when k.availability = 'withdrawn' then null else k.salary_min end,
    case when k.availability = 'withdrawn' then null else k.salary_max end,
    case when k.availability = 'withdrawn' then null else k.salary_currency end,
    case when k.availability = 'withdrawn' then null else k.salary_period end,
    case when k.availability = 'withdrawn' then null else k.skills end,
    case when k.availability = 'withdrawn' then null else k.published_at end,
    case when k.availability = 'withdrawn' then null else k.expires_at end,
    case when k.availability = 'withdrawn' then null else k.company_name end,
    case when k.availability = 'withdrawn' then null else k.company_logo_url end
  from classified k
  -- Open roles first, then the ones that have stopped accepting applications,
  -- then the ones we took down; newest save first within each group.
  order by
    case k.availability when 'open' then 0 when 'closed' then 1 else 2 end,
    k.saved_at desc;
$$;

revoke all on function public.my_saved_jobs() from public;
grant execute on function public.my_saved_jobs() to authenticated;
-- Not granted to anon: with no session auth.uid() is null and it would
-- return nothing anyway, but "returns nothing" is a weaker promise than
-- "cannot be called".


-- ===========================================================================
-- CHECKS. Run the whole file; every check prints PASS or raises.
--
-- c5 and c7 are the pair that matters. c5 proves the function is tied to the
-- session, by calling it from the SQL editor where there is no session at
-- all. c7 proves it actually works when there IS one, using the
-- transaction-local claim trick from migration 017 -- because a check that
-- can only ever return zero rows cannot fail, and migration 017's c5 was
-- exactly that mistake.
-- ===========================================================================

-- --- c1: the table, its key and its cascades -------------------------------
do $$
declare
  v_pk    text;
  v_casc  integer;
begin
  select string_agg(a.attname, ',' order by k.ord)
    into v_pk
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where c.relname = 'job_saves' and con.contype = 'p';

  select count(*) into v_casc
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'job_saves' and con.contype = 'f' and con.confdeltype = 'c';

  if v_pk is distinct from 'job_id,user_id' then
    raise exception 'c1 FAIL: primary key is %, expected job_id,user_id', v_pk;
  end if;

  if v_casc <> 2 then
    raise exception 'c1 FAIL: % cascading foreign keys, expected 2', v_casc;
  end if;

  raise notice 'c1 PASS  table, composite key and both cascades in place';
end $$;

-- --- c2: three policies, every one of them scoped to the caller ------------
do $$
declare
  v_total integer;
  v_scoped integer;
  v_rls boolean;
begin
  select relrowsecurity into v_rls
  from pg_class where relname = 'job_saves' and relnamespace = 'public'::regnamespace;

  select count(*) into v_total
  from pg_policies where schemaname = 'public' and tablename = 'job_saves';

  -- Every policy's expression must contain the ownership clause. Checking the
  -- text is crude, but the alternative is checking nothing.
  select count(*) into v_scoped
  from pg_policies
  where schemaname = 'public' and tablename = 'job_saves'
    and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
    and coalesce(qual, '') || coalesce(with_check, '') like '%user_id%';

  if not coalesce(v_rls, false) then
    raise exception 'c2 FAIL: row level security is not enabled';
  end if;

  if v_total <> 3 then
    raise exception 'c2 FAIL: % policies, expected exactly 3', v_total;
  end if;

  if v_scoped <> 3 then
    raise exception 'c2 FAIL: only % of 3 policies name auth.uid() and user_id', v_scoped;
  end if;

  raise notice 'c2 PASS  RLS on, 3 policies, all three scoped to the caller';
end $$;

-- --- c3: grants are exactly what was intended, in both directions ----------
do $$
declare
  v_auth_sel boolean;
  v_auth_ins boolean;
  v_auth_del boolean;
  v_auth_upd boolean;
  v_anon      boolean;
  v_service   boolean;
begin
  v_auth_sel := has_table_privilege('authenticated', 'public.job_saves', 'select');
  v_auth_ins := has_table_privilege('authenticated', 'public.job_saves', 'insert');
  v_auth_del := has_table_privilege('authenticated', 'public.job_saves', 'delete');
  v_auth_upd := has_table_privilege('authenticated', 'public.job_saves', 'update');

  v_anon := has_table_privilege('anon', 'public.job_saves', 'select')
         or has_table_privilege('anon', 'public.job_saves', 'insert')
         or has_table_privilege('anon', 'public.job_saves', 'delete');

  v_service := has_table_privilege('service_role', 'public.job_saves', 'select')
            or has_table_privilege('service_role', 'public.job_saves', 'insert')
            or has_table_privilege('service_role', 'public.job_saves', 'delete');

  if not (v_auth_sel and v_auth_ins and v_auth_del) then
    raise exception 'c3 FAIL: authenticated is missing select/insert/delete (% % %)',
      v_auth_sel, v_auth_ins, v_auth_del;
  end if;

  if v_auth_upd then
    raise exception 'c3 FAIL: authenticated can update job_saves; there is nothing to update';
  end if;

  if v_anon then
    raise exception 'c3 FAIL: anon has access to job_saves';
  end if;

  if v_service then
    raise exception 'c3 FAIL: service_role has access to job_saves, but no server code uses it';
  end if;

  raise notice 'c3 PASS  authenticated select/insert/delete only; anon and service_role have nothing';
end $$;

-- --- c4: the function is a pinned definer, granted to authenticated only ---
do $$
declare
  v_definer boolean;
  v_path    text;
  v_anon    boolean;
  v_auth    boolean;
begin
  select p.prosecdef, array_to_string(p.proconfig, ' ')
    into v_definer, v_path
  from pg_proc p
  where p.oid = 'public.my_saved_jobs()'::regprocedure;

  v_auth := has_function_privilege('authenticated', 'public.my_saved_jobs()', 'execute');
  v_anon := has_function_privilege('anon', 'public.my_saved_jobs()', 'execute');

  if not v_definer then
    raise exception 'c4 FAIL: my_saved_jobs is not SECURITY DEFINER';
  end if;

  if coalesce(v_path, '') not like '%search_path=public, pg_catalog%' then
    raise exception 'c4 FAIL: search_path is not pinned (%)', v_path;
  end if;

  if not v_auth then
    raise exception 'c4 FAIL: authenticated cannot execute my_saved_jobs';
  end if;

  if v_anon then
    raise exception 'c4 FAIL: anon can execute my_saved_jobs';
  end if;

  raise notice 'c4 PASS  definer, search_path pinned, authenticated only';
end $$;

-- --- c5: with no session it returns nothing --------------------------------
-- The SQL editor carries no JWT, so auth.uid() is null here. This is the
-- gate: if the function ever returned rows from this statement it would be
-- returning somebody's saved roles to a caller with no identity.
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.my_saved_jobs();

  if v_rows <> 0 then
    raise exception 'c5 FAIL: % rows returned with no session', v_rows;
  end if;

  raise notice 'c5 PASS  no session, no rows';
end $$;

-- --- c6: the three states are total and mutually exclusive -----------------
-- Run over every row in public.jobs, not over saved ones, so it tests the
-- classification itself rather than whatever happens to be bookmarked.
do $$
declare
  v_jobs   integer;
  v_open   integer;
  v_closed integer;
  v_gone   integer;
begin
  select count(*) into v_jobs from public.jobs;

  select
    count(*) filter (where s = 'open'),
    count(*) filter (where s = 'closed'),
    count(*) filter (where s = 'withdrawn')
    into v_open, v_closed, v_gone
  from (
    select case
      when private.job_is_public(j.status, j.expires_at, j.posted_by) then 'open'
      when j.status = 'hidden' or exists (
        select 1 from public.recruiter_profiles r
        where r.user_id = j.posted_by and r.is_suspended
      ) then 'withdrawn'
      else 'closed'
    end as s
    from public.jobs j
  ) t;

  if v_open + v_closed + v_gone <> v_jobs then
    raise exception 'c6 FAIL: % jobs but % classified', v_jobs, v_open + v_closed + v_gone;
  end if;

  raise notice 'c6 PASS  % jobs: % open, % closed, % withdrawn (totals reconcile)',
    v_jobs, v_open, v_closed, v_gone;
end $$;

-- --- c7: with a session it returns that person's saves, and only theirs ----
-- Inserts two saves for a real account, reads them back through the function
-- under that account's claim, then removes them again. Nothing is left
-- behind: the deletes run before the result is judged, so a failure cleans up
-- after itself as well as a pass does.
do $$
declare
  v_user     uuid;
  v_other    uuid;
  v_live     bigint;
  v_closed   bigint;
  v_rows     integer;
  v_live_av  text;
  v_live_ttl text;
  v_clo_av   text;
  v_err      text := null;
begin
  select id into v_user from auth.users order by created_at limit 1;
  select id into v_other from auth.users where id <> v_user order by created_at limit 1;

  select id into v_live from public.jobs
   where private.job_is_public(status, expires_at, posted_by) order by id limit 1;

  select id into v_closed from public.jobs
   where not private.job_is_public(status, expires_at, posted_by)
     and status <> 'hidden' order by id limit 1;

  -- A check that quietly skips is a check that cannot fail.
  if v_user is null or v_other is null then
    raise exception 'c7 FAIL: needs two accounts to test with';
  end if;
  if v_live is null or v_closed is null then
    raise exception 'c7 FAIL: needs one open and one closed role to test with (open=%, closed=%)',
      v_live, v_closed;
  end if;

  -- Two saves for our subject, one for somebody else. The third is what
  -- proves the function filters rather than simply returning job_saves.
  insert into public.job_saves (job_id, user_id) values (v_live, v_user)   on conflict do nothing;
  insert into public.job_saves (job_id, user_id) values (v_closed, v_user) on conflict do nothing;
  insert into public.job_saves (job_id, user_id) values (v_live, v_other)  on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user::text)::text, true);

  select count(*) into v_rows from public.my_saved_jobs();

  select availability, title into v_live_av, v_live_ttl
  from public.my_saved_jobs() where job_id = v_live;

  select availability into v_clo_av
  from public.my_saved_jobs() where job_id = v_closed;

  -- Judge after cleaning up, never before.
  delete from public.job_saves
   where user_id in (v_user, v_other) and job_id in (v_live, v_closed);

  if v_rows <> 2 then
    v_err := format('returned %s rows, expected exactly 2 (the third save belongs to another account)', v_rows);
  elsif v_live_av is distinct from 'open' then
    v_err := format('open role came back as %s', v_live_av);
  elsif v_live_ttl is null then
    v_err := 'open role came back with no title';
  elsif v_clo_av is distinct from 'closed' then
    v_err := format('closed role came back as %s', v_clo_av);
  end if;

  if v_err is not null then
    raise exception 'c7 FAIL: %', v_err;
  end if;

  raise notice 'c7 PASS  2 of 3 saves returned, open and closed classified correctly, test rows removed';
end $$;

-- --- c8: nothing was left behind by c7 -------------------------------------
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.job_saves;

  if v_rows <> 0 then
    raise exception 'c8 FAIL: job_saves holds % rows; c7 should have left it empty', v_rows;
  end if;

  raise notice 'c8 PASS  job_saves is empty';
end $$;
