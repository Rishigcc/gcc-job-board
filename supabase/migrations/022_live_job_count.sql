-- ===========================================================================
-- 022_live_job_count.sql
--
-- public.live_job_count() -- how many roles a stranger would see on
-- /gcc-jobs right now. One integer, no arguments.
--
-- WHY THIS IS NOT JUST A COUNT IN THE CLIENT
--
-- Rishi's decision, 24 Nov 2026: the promo card at the top of /jobs appears
-- only when the board has live roles. "No live roles, no card."
--
-- The obvious implementation -- count public.jobs from the browser and let
-- RLS do the filtering -- is WRONG, and wrong in exactly the way the rule
-- exists to prevent. Postgres ORs a table's policies together, and
-- public.jobs has three SELECT policies:
--
--   anyone reads public jobs     private.job_is_public(status, expires_at, posted_by)
--   recruiter reads own jobs     posted_by = auth.uid()
--   admin reads all jobs         private.is_admin()
--
-- So the same count returns a different number depending on who is asking:
--
--   a visitor          the public roles
--   a recruiter        the public roles PLUS their own pending, closed,
--                      expired and hidden ones
--   an admin           every row in the table
--
-- Rishi is the admin. On a board with no live roles but one closed test
-- posting, he would be the one person on the site to see a card promising
-- roles, clicking through to an empty board. The check would have failed for
-- its author first.
--
-- A definer function fixes it at the source instead of papering over it in
-- the client. It runs as its owner, so no policy applies, and it names the
-- public condition once -- the same private.job_is_public() the "anyone reads
-- public jobs" policy uses, so the card and the board cannot disagree about
-- what "live" means.
--
-- WHY NOT FILTER IN THE QUERY INSTEAD
--   .eq('status','live').gt('expires_at', now) would have needed no migration,
--   and would have been subtly wrong: it misses the suspended-recruiter half
--   of job_is_public(). A suspended recruiter's unexpired role would light
--   the card up over a board that does not show it. src/lib/publicJobs.js
--   already says why filtering client-side is the thing that drifts, and this
--   would have been the drift.
--
-- IS A COUNT SAFE TO EXPOSE? Yes -- /gcc-jobs prints it already ("Showing
-- 1-20 of 23 roles"). This function takes no arguments and returns one
-- integer, which is the whole of its attack surface: there is no parameter to
-- aim at a row it should not see. Anything that would add one should be a
-- different function.
-- ===========================================================================

create or replace function public.live_job_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select count(*)::integer
  from public.jobs j
  where private.job_is_public(j.status, j.expires_at, j.posted_by);
$$;

revoke all on function public.live_job_count() from public;
grant execute on function public.live_job_count() to anon, authenticated;
-- anon AND authenticated: /jobs is a public page and the card must look the
-- same to a visitor and to a signed-in member. NOT service_role -- nothing
-- on the server side needs it, and a grant nobody uses is a grant nobody
-- notices changing.


-- ===========================================================================
-- CHECKS. One row per check, figures in `detail` whether it passed or failed.
-- ===========================================================================

create temporary table if not exists stage10_count_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage10_count_checks;


-- --- c1: the function's shape ---------------------------------------------
insert into stage10_count_checks (seq, label, result, detail)
with f as (
  select
    p.prosecdef                                             as definer,
    p.provolatile                                           as vol,
    coalesce(array_to_string(p.proconfig, ' '), '(none)')   as cfg,
    pg_get_function_identity_arguments(p.oid)               as args,
    pg_catalog.format_type(p.prorettype, null)              as rettype,
    has_function_privilege('anon',          p.oid, 'execute') as anon_x,
    has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
    has_function_privilege('service_role',  p.oid, 'execute') as svc_x,
    p.prosrc                                                as body
  from pg_proc p
  where p.oid = 'public.live_job_count()'::regprocedure
)
select 1,
  'c1  definer, pinned, no arguments, anon + authenticated only',
  case when f.definer
            and f.cfg like '%search_path=public, pg_catalog%'
            and f.args = ''
            and f.rettype = 'integer'
            and f.anon_x and f.auth_x and not f.svc_x
            and f.body like '%job_is_public%'
            and f.body not like '%auth.uid%'
       then 'PASS' else 'FAIL' end,
  'security definer: ' || f.definer
    || '  ·  proconfig: ' || f.cfg
    || '  ·  arguments: "' || f.args || '" (must be empty)'
    || '  ·  returns: ' || f.rettype
    || '  ·  anon: ' || f.anon_x
    || '  ·  authenticated: ' || f.auth_x
    || '  ·  service_role (must be false): ' || f.svc_x
    || '  ·  uses job_is_public: ' || (f.body like '%job_is_public%')
    || '  ·  mentions auth.uid (must be false): ' || (f.body like '%auth.uid%')
from f;


-- --- c2: it agrees with the public condition spelled out longhand ---------
-- Not a tautology: the right-hand side is job_is_public()'s three clauses
-- written out by hand. If someone edits one and not the other, this fails.
insert into stage10_count_checks (seq, label, result, detail)
with n as (
  select
    public.live_job_count() as fn,
    (select count(*)::integer from public.jobs j
      where j.status = 'live'
        and j.expires_at > now()
        and not exists (select 1 from public.recruiter_profiles r
                         where r.user_id = j.posted_by and r.is_suspended)) as longhand,
    (select count(*)::integer from public.jobs) as all_rows
)
select 2,
  'c2  the count matches the public condition written out longhand',
  case when n.fn = n.longhand then 'PASS' else 'FAIL' end,
  'live_job_count(): ' || n.fn
    || '  ·  longhand: ' || n.longhand
    || '  ·  rows in jobs altogether: ' || n.all_rows
    || '  ·  so ' || (n.all_rows - n.fn) || ' row(s) are not public'
from n;


-- --- c3 and c4, from one set of measurements ------------------------------
-- WHY THESE TWO ARE MEASURED TOGETHER, AND WHY THEY USE `set local role`
--
-- The Supabase SQL editor runs as `postgres`, which has BYPASSRLS. A plain
-- `select count(*) from public.jobs` there returns every row no matter whose
-- JWT claim is set, so a check written that way would "prove" the bug while
-- actually proving nothing but its own privilege. Setting the role to anon or
-- authenticated -- the two roles the browser actually uses -- is what puts
-- the policies back in force.
--
-- So this block measures the same two numbers for the three personas:
--
--   persona     role            claim         naive count(*)   live_job_count()
--   visitor     anon            none          public only      public only
--   recruiter   authenticated   their uuid    + their own      public only
--   admin       authenticated   admin uuid    every row        public only
--
-- c3 asserts the last column never moves.  c4 asserts the one before it DOES
-- -- because if a plain count were already correct, this migration would be
-- dead weight and should be deleted rather than trusted.
--
-- Running the visitor row as `anon` also spends the grant c1 only reads: the
-- browser calls this with the publishable key, which is the anon role.
do $$
declare
  v_admin_id   uuid;
  v_rec_id     uuid;
  v_hidden     integer;
  v_rec_rows   integer;
  v_anon_naive integer;  v_anon_fn  integer;
  v_rec_naive  integer;  v_rec_fn   integer;
  v_adm_naive  integer;  v_adm_fn   integer;
  v_failed     boolean := false;
  v_msg        text := '(none)';
begin
  select count(*)::integer into v_hidden
  from public.jobs j
  where not private.job_is_public(j.status, j.expires_at, j.posted_by);

  select user_id into v_admin_id from public.user_roles where role = 'admin' limit 1;

  -- A recruiter who owns at least one NON-PUBLIC role, so their own
  -- "recruiter reads own jobs" policy really would add rows to a plain count.
  select j.posted_by into v_rec_id
  from public.jobs j
  where not private.job_is_public(j.status, j.expires_at, j.posted_by)
    and j.posted_by is not null
  limit 1;

  if v_hidden = 0 or v_admin_id is null or v_rec_id is null then
    insert into stage10_count_checks (seq, label, result, detail)
    values (3, 'c3  the count is the same for a visitor, a recruiter and the admin',
            'FAIL',
            'NOT EXERCISED: needs a non-public role and the two kinds of '
              || 'account that can see one. non-public roles: ' || v_hidden
              || ', admin exists: ' || (v_admin_id is not null)
              || ', a recruiter owns a non-public role: ' || (v_rec_id is not null)),
           (4, 'c4  a plain count really would have been wrong', 'FAIL',
            'NOT EXERCISED: see c3');
    return;
  end if;

  select count(*)::integer into v_rec_rows
  from public.jobs j
  where j.posted_by = v_rec_id
    and not private.job_is_public(j.status, j.expires_at, j.posted_by);

  begin
    -- visitor
    perform set_config('request.jwt.claims', null, true);
    set local role anon;
    select count(*)::integer into v_anon_naive from public.jobs;
    v_anon_fn := public.live_job_count();
    reset role;

    -- the recruiter who owns a non-public role
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_rec_id)::text, true);
    set local role authenticated;
    select count(*)::integer into v_rec_naive from public.jobs;
    v_rec_fn := public.live_job_count();
    reset role;

    -- the admin
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_admin_id)::text, true);
    set local role authenticated;
    select count(*)::integer into v_adm_naive from public.jobs;
    v_adm_fn := public.live_job_count();
    reset role;

    perform set_config('request.jwt.claims', null, true);
  exception when others then
    v_failed := true;
    v_msg := sqlerrm;
    reset role;
    perform set_config('request.jwt.claims', null, true);
  end;

  insert into stage10_count_checks (seq, label, result, detail)
  values (3, 'c3  the count is the same for a visitor, a recruiter and the admin',
          case when not v_failed
                    and v_anon_fn = v_rec_fn
                    and v_anon_fn = v_adm_fn
                    and v_anon_fn is not null
               then 'PASS' else 'FAIL' end,
          case when v_failed then 'could not impersonate: ' || v_msg else
            'live_job_count() as a visitor: ' || v_anon_fn
              || '  ·  as the recruiter: ' || v_rec_fn
              || '  ·  as the admin: ' || v_adm_fn
              || '  ·  (all three must match)'
          end);

  insert into stage10_count_checks (seq, label, result, detail)
  values (4, 'c4  a plain count really would have been wrong',
          case when not v_failed
                    and (v_adm_naive <> v_adm_fn or v_rec_naive <> v_rec_fn)
               then 'PASS' else 'FAIL' end,
          case when v_failed then 'could not impersonate: ' || v_msg else
            'plain count(*) from public.jobs -- as a visitor: ' || v_anon_naive
              || '  ·  as the recruiter: ' || v_rec_naive
              || '  ·  as the admin: ' || v_adm_naive
              || '  ·  against live_job_count() = ' || v_adm_fn
              || '  ·  the recruiter owns ' || v_rec_rows
              || ' non-public role(s) and the admin can see all ' || v_hidden
              || '  ·  if these were all equal, a plain count would be good '
              || 'enough and this migration should be deleted rather than '
              || 'trusted'
          end);
end $$;


-- --- the verdict ----------------------------------------------------------
insert into stage10_count_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage10_count_checks
where seq < 99;


select label, result, detail
from stage10_count_checks
order by seq;
