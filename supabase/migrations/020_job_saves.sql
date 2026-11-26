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
-- WHAT THIS MIGRATION DOES NOT DO -- SUPERSEDED, SEE MIGRATION 021
--   As shipped, this migration left /api/delete-my-data alone and raised the
--   question as a decision. Rishi decided it on 23 Nov 2026: saved roles ARE
--   included in "Delete my job board data", and migration 021 adds the delete
--   to public.anonymise_job_data_for().
--
--   The argument this header originally made -- that a saved role holds no
--   personal detail an application does not already hold -- was wrong, and
--   his reason is the one this file should have reached. An application tells
--   an employer something they already know. A saved role says "interested,
--   and did not approach", which nobody knows at all.
--
--   Left here rather than deleted, because a migration is a record of what
--   was run and what was believed at the time. 021 is the current state.
--
--   Deleting the ACCOUNT already cleared these rows either way, by the
--   cascade below.
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
-- CHECKS -- and why they return a table instead of raising notices.
--
-- THE FIRST VERSION OF THIS FILE REPORTED ALL EIGHT CHECKS WITH `raise
-- notice`. Supabase's SQL editor does not display notice output at all, so a
-- completely clean run printed "Success. No rows returned" and every single
-- PASS was invisible. The checks were sound and the figures were real; there
-- was simply no way for the person running the file to see either.
--
-- Rishi, 23 Nov 2026: "From here, migration checks should return a result row
-- like 017/018/019 did, not notices."
--
-- THIS IS THE SAME LESSON FOR THE THIRD TIME, IN ITS THIRD FORM:
--   015's c3   a check that could not FAIL.
--   017's c5   a check that could not PASS.
--   020 v1     eight checks that could not be READ.
-- A check is only a check if its outcome reaches the person running it.
--
-- WHY A TEMPORARY TABLE AND NOT ONE WIDE SELECT, WHICH IS WHAT 019 DID
--   Two reasons. The editor shows the result of the LAST statement only, and
--   c7 has to WRITE rows before it can read them back through the function,
--   so it cannot be a column in a single select. And one row per check reads
--   better than eight columns on one row once there are more than about five.
--
-- EVERY CHECK CARRIES ITS FIGURES IN `detail`, PASS OR FAIL. A check that
-- only shows its numbers when it fails is a check whose numbers nobody ever
-- sees, which is most of how this file went wrong the first time.
--
-- The whole file is re-runnable: the table, index, policies, grants and
-- function are all idempotent, and the checks clear their own results first.
-- ===========================================================================

create temporary table if not exists stage10_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage10_checks;


-- --- c1: the table, its key and its cascades -------------------------------
insert into stage10_checks (seq, label, result, detail)
with pk as (
  select string_agg(a.attname, ',' order by k.ord) as cols
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where c.relname = 'job_saves' and con.contype = 'p'
),
fk as (
  select count(*)::integer as cascades
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'job_saves' and con.contype = 'f' and con.confdeltype = 'c'
)
select 1,
  'c1  table, composite key, both cascades',
  case when pk.cols = 'job_id,user_id' and fk.cascades = 2
       then 'PASS' else 'FAIL' end,
  'primary key: ' || coalesce(pk.cols, '(none)')
    || '  ·  cascading foreign keys: ' || fk.cascades || ' of 2'
from pk, fk;


-- --- c2: RLS on, three policies, every one scoped to the caller ------------
-- Checking the policy TEXT for the ownership clause is crude. The alternative
-- is checking nothing.
insert into stage10_checks (seq, label, result, detail)
with p as (
  select
    count(*)::integer as total,
    count(*) filter (
      where coalesce(qual,'') || coalesce(with_check,'') like '%auth.uid()%'
        and coalesce(qual,'') || coalesce(with_check,'') like '%user_id%'
    )::integer as scoped
  from pg_policies
  where schemaname = 'public' and tablename = 'job_saves'
),
r as (
  select coalesce(relrowsecurity, false) as rls
  from pg_class
  where relname = 'job_saves' and relnamespace = 'public'::regnamespace
)
select 2,
  'c2  RLS on, 3 policies, all scoped to caller',
  case when r.rls and p.total = 3 and p.scoped = 3 then 'PASS' else 'FAIL' end,
  'row level security: ' || case when r.rls then 'enabled' else 'OFF' end
    || '  ·  policies: ' || p.total || ' of 3'
    || '  ·  naming auth.uid() and user_id: ' || p.scoped || ' of 3'
from p, r;


-- --- c3: grants are exactly what was intended, in BOTH directions ----------
-- service_role having nothing is as much a requirement as authenticated
-- having something: no server endpoint touches this table, and a grant that
-- exists without a caller is surface nobody is watching.
insert into stage10_checks (seq, label, result, detail)
with g as (
  select
    has_table_privilege('authenticated','public.job_saves','select') as a_sel,
    has_table_privilege('authenticated','public.job_saves','insert') as a_ins,
    has_table_privilege('authenticated','public.job_saves','delete') as a_del,
    has_table_privilege('authenticated','public.job_saves','update') as a_upd,
    has_table_privilege('anon','public.job_saves','select')
      or has_table_privilege('anon','public.job_saves','insert')
      or has_table_privilege('anon','public.job_saves','delete') as anon_any,
    has_table_privilege('service_role','public.job_saves','select')
      or has_table_privilege('service_role','public.job_saves','insert')
      or has_table_privilege('service_role','public.job_saves','delete') as svc_any
)
select 3,
  'c3  grants, in both directions',
  case when g.a_sel and g.a_ins and g.a_del
            and not g.a_upd and not g.anon_any and not g.svc_any
       then 'PASS' else 'FAIL' end,
  'authenticated select/insert/delete: ' || g.a_sel || '/' || g.a_ins || '/' || g.a_del
    || '  ·  authenticated update (must be false): ' || g.a_upd
    || '  ·  anon has anything: ' || g.anon_any
    || '  ·  service_role has anything: ' || g.svc_any
from g;


-- --- c4: the function is a pinned definer, granted to authenticated only ---
insert into stage10_checks (seq, label, result, detail)
with f as (
  select
    p.prosecdef as definer,
    coalesce(array_to_string(p.proconfig, ' '), '(none)') as cfg,
    has_function_privilege('authenticated','public.my_saved_jobs()','execute') as auth_x,
    has_function_privilege('anon','public.my_saved_jobs()','execute') as anon_x
  from pg_proc p
  where p.oid = 'public.my_saved_jobs()'::regprocedure
)
select 4,
  'c4  definer, search_path pinned, authenticated only',
  case when f.definer
            and f.cfg like '%search_path=public, pg_catalog%'
            and f.auth_x and not f.anon_x
       then 'PASS' else 'FAIL' end,
  'security definer: ' || f.definer
    || '  ·  proconfig: ' || f.cfg
    || '  ·  authenticated can execute: ' || f.auth_x
    || '  ·  anon can execute (must be false): ' || f.anon_x
from f;


-- --- c5: with no session, no rows ------------------------------------------
-- THE GATE. The SQL editor carries no JWT, so auth.uid() is null here. If
-- this ever returned rows, the function would be handing somebody's saved
-- roles to a caller with no identity. Its partner is c7: a check that can
-- only ever return zero rows cannot fail, which was 017's c5 mistake.
insert into stage10_checks (seq, label, result, detail)
select 5,
  'c5  no session, no rows (the gate)',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'rows returned with no session: ' || count(*) || ' (must be 0)'
from public.my_saved_jobs();


-- --- c6: the three states are total and mutually exclusive -----------------
-- Run over EVERY row in public.jobs, not over saved ones, so it tests the
-- classification itself rather than whatever happens to be bookmarked.
insert into stage10_checks (seq, label, result, detail)
with cls as (
  select case
    when private.job_is_public(j.status, j.expires_at, j.posted_by) then 'open'
    when j.status = 'hidden' or exists (
      select 1 from public.recruiter_profiles r
      where r.user_id = j.posted_by and r.is_suspended
    ) then 'withdrawn'
    else 'closed'
  end as s
  from public.jobs j
),
t as (
  select
    count(*)::integer as jobs,
    count(*) filter (where s = 'open')::integer as o,
    count(*) filter (where s = 'closed')::integer as c,
    count(*) filter (where s = 'withdrawn')::integer as w
  from cls
)
select 6,
  'c6  every role classified, exactly once',
  case when t.o + t.c + t.w = t.jobs then 'PASS' else 'FAIL' end,
  t.jobs || ' roles  ·  ' || t.o || ' open, ' || t.c || ' closed, ' || t.w
    || ' withdrawn  ·  sum ' || (t.o + t.c + t.w)
    || case when t.o + t.c + t.w = t.jobs then ' reconciles' else ' DOES NOT RECONCILE' end
from t;


-- --- c7: with a session, that person's saves and only theirs ---------------
-- Inserts three saves -- two for a subject account, one for a different
-- account -- reads them back through the function under the subject's claim,
-- then removes all three. THE THIRD SAVE IS THE POINT: without it the check
-- would prove the function returns rows, not that it filters them.
--
-- Nothing is left behind. The deletes run BEFORE the result is judged, so a
-- failing run cleans up after itself exactly as a passing one does, and a DO
-- block is atomic so an unexpected error rolls the inserts back anyway.
do $$
declare
  v_user     uuid;
  v_other    uuid;
  v_open     bigint;
  v_closed   bigint;
  v_rows     integer;
  v_open_av  text;
  v_open_ttl text;
  v_clo_av   text;
  v_clo_ttl  text;
  v_result   text;
  v_detail   text;
  v_before   integer;
  v_after    integer;
begin
  -- How many saves exist BEFORE this check touches anything. c7 must leave
  -- exactly this many behind. Counting rather than asserting the table is
  -- empty is deliberate: an emptiness check is only true on a fresh install,
  -- so the moment a real save exists it would fail for the wrong reason.
  select count(*)::integer into v_before from public.job_saves;

  select id into v_user  from auth.users order by created_at limit 1;
  select id into v_other from auth.users where id <> v_user order by created_at limit 1;

  select id into v_open from public.jobs
   where private.job_is_public(status, expires_at, posted_by)
   order by id limit 1;

  select id into v_closed from public.jobs
   where not private.job_is_public(status, expires_at, posted_by)
     and status <> 'hidden'
   order by id limit 1;

  -- A check that quietly skips is a check that cannot fail, so missing
  -- fixtures are a FAIL and say which one is missing.
  if v_user is null or v_other is null then
    insert into stage10_checks (seq, label, result, detail)
    values (7, 'c7  with a session, only the caller''s saves', 'FAIL',
            'needs two accounts to test with; found '
              || (select count(*) from auth.users));
    insert into stage10_checks (seq, label, result, detail)
    values (8, 'c8  c7 left nothing behind', 'PASS',
            'c7 did not run, so nothing could be left behind');
    return;
  end if;

  if v_open is null or v_closed is null then
    insert into stage10_checks (seq, label, result, detail)
    values (7, 'c7  with a session, only the caller''s saves', 'FAIL',
            'needs one open and one closed role as fixtures; open='
              || coalesce(v_open::text,'(none)')
              || ', closed=' || coalesce(v_closed::text,'(none)'));
    insert into stage10_checks (seq, label, result, detail)
    values (8, 'c8  c7 left nothing behind', 'PASS',
            'c7 did not run, so nothing could be left behind');
    return;
  end if;

  -- BEFORE INSERTING ANYTHING: prove none of the three fixture rows already
  -- exists. The cleanup below deletes by (job, user) pair, so if one of those
  -- pairs were a REAL bookmark this check would delete somebody's save. It
  -- cannot happen in practice -- v_user and v_other are the two oldest
  -- accounts on the site and the newest feature on it is saving roles -- but
  -- "cannot happen in practice" is not a property, and a check that can
  -- destroy data is worse than no check.
  if exists (
    select 1 from public.job_saves
    where (job_id, user_id) in ((v_open, v_user), (v_closed, v_user), (v_open, v_other))
  ) then
    insert into stage10_checks (seq, label, result, detail)
    values (7, 'c7  with a session, only the caller''s saves', 'FAIL',
            'a fixture row already exists, so c7 refused to run rather than '
              || 'risk deleting a real save. Fixtures: roles ' || v_open || ' and '
              || v_closed || ' for the two oldest accounts.');
    insert into stage10_checks (seq, label, result, detail)
    values (8, 'c8  c7 left nothing behind', 'PASS',
            'c7 did not run, so nothing could be left behind');
    return;
  end if;

  insert into public.job_saves (job_id, user_id) values (v_open,   v_user)  on conflict do nothing;
  insert into public.job_saves (job_id, user_id) values (v_closed, v_user)  on conflict do nothing;
  insert into public.job_saves (job_id, user_id) values (v_open,   v_other) on conflict do nothing;

  -- Transaction-local, the way migration 017 established. The SQL editor has
  -- no JWT of its own, so this is the only way to exercise auth.uid().
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user::text)::text, true);

  select count(*)::integer into v_rows from public.my_saved_jobs();

  select availability, title into v_open_av, v_open_ttl
  from public.my_saved_jobs() where job_id = v_open;

  select availability, title into v_clo_av, v_clo_ttl
  from public.my_saved_jobs() where job_id = v_closed;

  -- Clean up, then judge. Never the other way round.
  delete from public.job_saves
   where user_id in (v_user, v_other) and job_id in (v_open, v_closed);

  perform set_config('request.jwt.claims', '', true);

  select count(*)::integer into v_after from public.job_saves;

  v_detail :=
    'subject saw ' || v_rows || ' of 3 saves (must be 2)'
    || '  ·  open role ' || v_open || ': ' || coalesce(v_open_av,'(missing)')
    || ', title ' || case when v_open_ttl is null then 'NULL' else 'present' end
    || '  ·  closed role ' || v_closed || ': ' || coalesce(v_clo_av,'(missing)')
    || ', title ' || case when v_clo_ttl is null then 'NULL' else 'present' end
    || '  ·  3 test rows inserted and deleted';

  v_result := case
    when v_rows <> 2                        then 'FAIL'
    when v_open_av is distinct from 'open'   then 'FAIL'
    when v_open_ttl is null                  then 'FAIL'
    when v_clo_av  is distinct from 'closed' then 'FAIL'
    when v_clo_ttl is null                   then 'FAIL'
    else 'PASS'
  end;

  insert into stage10_checks (seq, label, result, detail)
  values (7, 'c7  with a session, only the caller''s saves', v_result, v_detail);

  -- c8 is written here rather than as its own statement because only this
  -- block knows what the count was beforehand.
  insert into stage10_checks (seq, label, result, detail)
  values (8, 'c8  c7 left nothing behind',
          case when v_after = v_before then 'PASS' else 'FAIL' end,
          'rows in job_saves before: ' || v_before
            || '  ·  after: ' || v_after
            || case when v_after = v_before
                    then '  ·  unchanged'
                    else '  ·  ' || (v_after - v_before) || ' LEFT BEHIND' end);
end $$;


-- --- the verdict, so a clean run is one word and not eight ----------------
insert into stage10_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage10_checks
where seq < 99;


-- THE LAST STATEMENT IN THE FILE, because the editor shows this one and no
-- other. Everything above is invisible by design now, rather than by accident.
select label, result, detail
from stage10_checks
order by seq;
