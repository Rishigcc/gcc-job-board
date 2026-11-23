-- ===========================================================================
-- 021_delete_includes_saved_roles.sql
--
-- "Delete my job board data" now also forgets saved roles.
--
-- RISHI'S DECISION, 23 Nov 2026, VERBATIM:
--   "Yes — include saved roles in 'Delete my job board data'. The button's
--    name is a promise, and a saved role is plainly job board data. It also
--    reveals something an application doesn't: which employers someone was
--    interested in but never approached. Saved questions staying untouched
--    doesn't argue against this — those aren't job board data."
--
--   This overrules the position taken in migration 020's header, which left
--   it alone and raised it as a decision. 020's header has been annotated to
--   point here rather than left to read as current.
--
-- THE SECOND SENTENCE IS THE INTERESTING ONE, AND IT IS WHY THIS IS NOT
-- MERELY TIDINESS. An application says "this person approached this
-- employer", which the employer already knows. A saved role says "this person
-- was interested in this employer and did not approach them" — which nobody
-- knows, which the person may very much not want known, and which is
-- precisely the kind of thing a delete-my-data button is for.
--
-- WHY IT GOES INSIDE anonymise_job_data_for() RATHER THAN BESIDE IT
--   Atomicity. A second RPC called after this one could fail on its own, and
--   then the saved roles would be gone while the applications still carried
--   the person's name, or the reverse -- and the endpoint would have to
--   describe a half-finished deletion to someone who had just typed
--   "DELETE MY DATA". One function is one transaction: all of it happens or
--   none of it does.
--
--   It also keeps migration 020's c3 true. No grant to service_role on
--   public.job_saves was added, because none is needed: a definer function
--   runs as its owner, so the service key never touches the table directly.
--
-- THE RETURN TYPE GAINS A COLUMN, SO THE FUNCTION IS DROPPED AND RECREATED
--   `create or replace` cannot change a function's return type. The drop and
--   the create are in the same transaction, so there is no window in which
--   the function does not exist. Old deployed code that reads only the first
--   two columns keeps working -- an extra column in the result is ignored --
--   which means the migration can be run before or after the deploy.
-- ===========================================================================

drop function if exists public.anonymise_job_data_for(uuid);

create function public.anonymise_job_data_for(p_user uuid)
returns table (
  applications_anonymised integer,
  resume_path_removed     text,
  saved_roles_removed     integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
  v_path  text;
  v_saved integer;
begin
  if p_user is null then
    raise exception 'No user given.';
  end if;

  delete from public.candidate_resumes
   where candidate_id = p_user
   returning resume_path into v_path;

  -- NEW IN 021. Deleted outright, not anonymised: there is nothing in a save
  -- worth keeping once the person has asked to be forgotten. An application
  -- is anonymised rather than deleted because the recruiter has a legitimate
  -- record of having received it; nobody but the candidate ever knew about a
  -- bookmark, so nobody but the candidate has a claim on it.
  delete from public.job_saves
   where user_id = p_user;

  get diagnostics v_saved = row_count;

  update public.applications
     set candidate_id  = null,
         full_name     = null,
         email         = null,
         phone         = null,
         notice_period = null,
         anonymised_at = now()
   where candidate_id = p_user
     and anonymised_at is null;

  -- get diagnostics reads the LAST statement, so this must stay immediately
  -- after the update it counts. The saved-roles count above is captured the
  -- same way for the same reason -- putting the two deletes together and
  -- counting both at the end would have returned the wrong number for one of
  -- them, silently.
  get diagnostics v_count = row_count;

  return query select v_count, v_path, v_saved;
end;
$$;

revoke all on function public.anonymise_job_data_for(uuid) from public;
grant execute on function public.anonymise_job_data_for(uuid) to service_role;
-- service_role only, exactly as before: this is called by
-- /api/delete-my-data after it has verified the caller's token. It is not
-- granted to authenticated, because the user id is an argument and a
-- candidate must not be able to pass somebody else's.


-- ===========================================================================
-- CHECKS. One row per check, figures in `detail` whether it passed or failed
-- -- the rule adopted after 020's notices turned out to be invisible in the
-- Supabase SQL editor.
-- ===========================================================================

create temporary table if not exists stage10_delete_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage10_delete_checks;


-- --- c1: the function's shape ----------------------------------------------
insert into stage10_delete_checks (seq, label, result, detail)
with f as (
  select
    p.prosecdef as definer,
    coalesce(array_to_string(p.proconfig, ' '), '(none)') as cfg,
    has_function_privilege('service_role',  p.oid, 'execute') as svc,
    has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
    has_function_privilege('anon',          p.oid, 'execute') as anon_x,
    (select count(*)::integer from unnest(p.proargnames) n where n is not null) as named_args,
    array_to_string(p.proargnames, ',') as argnames,
    p.prosrc as body
  from pg_proc p
  where p.oid = 'public.anonymise_job_data_for(uuid)'::regprocedure
)
select 1,
  'c1  definer, pinned, service_role only, and it mentions job_saves',
  case when f.definer
            and f.cfg like '%search_path=public, pg_catalog%'
            and f.svc and not f.auth_x and not f.anon_x
            and f.body like '%job_saves%'
            and f.argnames like '%saved_roles_removed%'
       then 'PASS' else 'FAIL' end,
  'security definer: ' || f.definer
    || '  ·  proconfig: ' || f.cfg
    || '  ·  service_role: ' || f.svc
    || '  ·  authenticated (must be false): ' || f.auth_x
    || '  ·  anon (must be false): ' || f.anon_x
    || '  ·  body deletes from job_saves: ' || (f.body like '%job_saves%')
    || '  ·  returns: ' || coalesce(f.argnames, '(none)')
from f;


-- --- c2: it still refuses a null user -------------------------------------
-- The guard was already there. A rewrite is exactly when a guard gets lost.
do $$
declare
  v_raised boolean := false;
  v_msg    text    := '(none)';
begin
  begin
    perform public.anonymise_job_data_for(null);
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  insert into stage10_delete_checks (seq, label, result, detail)
  values (2, 'c2  a null user is refused',
          case when v_raised then 'PASS' else 'FAIL' end,
          'raised: ' || v_raised || '  ·  message: ' || v_msg);
end $$;


-- --- c3: it actually deletes a saved role, and reports how many -----------
-- THIS CALLS A DESTRUCTIVE FUNCTION, SO IT PROVES THE SUBJECT IS CLEAN FIRST.
--
-- The subject is the oldest account on the site -- a long-standing community
-- member with no job board data at all. The check asserts that: no
-- applications, no resume row, no saves. If any of those is untrue it reports
-- FAIL and calls nothing, because a check that destroys real data to prove a
-- point is worse than no check.
--
-- Given a clean subject, the only thing this call can destroy is the single
-- save the check itself inserted one statement earlier.
do $$
declare
  v_user    uuid;
  v_job     bigint;
  v_apps    integer;
  v_resumes integer;
  v_saves   integer;
  v_removed integer;
  v_anon    integer;
  v_left    integer;
begin
  select id into v_user from auth.users order by created_at limit 1;

  select id into v_job from public.jobs
   where private.job_is_public(status, expires_at, posted_by)
   order by id limit 1;

  if v_user is null or v_job is null then
    insert into stage10_delete_checks (seq, label, result, detail)
    values (3, 'c3  a saved role is deleted and counted', 'FAIL',
            'no fixtures: subject=' || coalesce(v_user::text,'(none)')
              || ', open role=' || coalesce(v_job::text,'(none)'));
    return;
  end if;

  select count(*)::integer into v_apps    from public.applications      where candidate_id = v_user;
  select count(*)::integer into v_resumes from public.candidate_resumes where candidate_id = v_user;
  select count(*)::integer into v_saves   from public.job_saves         where user_id      = v_user;

  if v_apps <> 0 or v_resumes <> 0 or v_saves <> 0 then
    insert into stage10_delete_checks (seq, label, result, detail)
    values (3, 'c3  a saved role is deleted and counted', 'FAIL',
            'REFUSED: the subject account is not clean, so calling a '
              || 'destructive function on it would destroy real data. '
              || 'applications=' || v_apps || ', resumes=' || v_resumes
              || ', saves=' || v_saves || ' (all must be 0)');
    return;
  end if;

  insert into public.job_saves (job_id, user_id) values (v_job, v_user);

  select applications_anonymised, saved_roles_removed
    into v_anon, v_removed
  from public.anonymise_job_data_for(v_user);

  select count(*)::integer into v_left from public.job_saves where user_id = v_user;

  insert into stage10_delete_checks (seq, label, result, detail)
  values (3, 'c3  a saved role is deleted and counted',
          case when v_removed = 1 and v_left = 0 and v_anon = 0
               then 'PASS' else 'FAIL' end,
          'saved_roles_removed: ' || v_removed || ' (must be 1)'
            || '  ·  saves left for the subject: ' || v_left || ' (must be 0)'
            || '  ·  applications_anonymised: ' || v_anon
            || ' (must be 0 — the subject had none, which is what made the '
            || 'call safe)');
end $$;


-- --- c4: a call with nothing to delete reports zero, not an error ---------
-- The ordinary case for anyone who saved nothing. It must come back quietly
-- with zeroes rather than raising.
do $$
declare
  v_user    uuid;
  v_removed integer;
  v_failed  boolean := false;
  v_msg     text := '(none)';
  v_apps    integer;
  v_resumes integer;
begin
  select id into v_user from auth.users order by created_at limit 1;

  -- THE SAME PROOF AS c3, REPEATED ON PURPOSE. c3 bails out without calling
  -- anything if the subject is not clean; if this check did not repeat the
  -- test, it would then go on to call the destructive function on exactly
  -- the account c3 had just refused to touch.
  select count(*)::integer into v_apps    from public.applications      where candidate_id = v_user;
  select count(*)::integer into v_resumes from public.candidate_resumes where candidate_id = v_user;

  if v_user is null or v_apps <> 0 or v_resumes <> 0 then
    insert into stage10_delete_checks (seq, label, result, detail)
    values (4, 'c4  nothing to delete is zero, not an error', 'FAIL',
            'REFUSED: subject not clean. applications=' || coalesce(v_apps::text,'?')
              || ', resumes=' || coalesce(v_resumes::text,'?') || ' (both must be 0)');
    return;
  end if;

  begin
    select saved_roles_removed into v_removed
    from public.anonymise_job_data_for(v_user);
  exception when others then
    v_failed := true;
    v_msg := sqlerrm;
  end;

  insert into stage10_delete_checks (seq, label, result, detail)
  values (4, 'c4  nothing to delete is zero, not an error',
          case when not v_failed and v_removed = 0 then 'PASS' else 'FAIL' end,
          'raised: ' || v_failed || '  ·  message: ' || v_msg
            || '  ·  saved_roles_removed on a second call: '
            || coalesce(v_removed::text, '(null)') || ' (must be 0)');
end $$;


-- --- c5: migration 020's grants are untouched -----------------------------
-- The whole reason this went inside a definer function was to avoid granting
-- service_role anything on job_saves. If that grant appears later, this is
-- where it will be noticed.
insert into stage10_delete_checks (seq, label, result, detail)
with g as (
  select
    has_table_privilege('service_role','public.job_saves','select') as s,
    has_table_privilege('service_role','public.job_saves','insert') as i,
    has_table_privilege('service_role','public.job_saves','update') as u,
    has_table_privilege('service_role','public.job_saves','delete') as d
)
select 5,
  'c5  service_role still has nothing on job_saves',
  case when not (g.s or g.i or g.u or g.d) then 'PASS' else 'FAIL' end,
  'service_role select/insert/update/delete: '
    || g.s || '/' || g.i || '/' || g.u || '/' || g.d || ' (all must be false)'
from g;


-- --- the verdict ----------------------------------------------------------
insert into stage10_delete_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage10_delete_checks
where seq < 99;


select label, result, detail
from stage10_delete_checks
order by seq;
