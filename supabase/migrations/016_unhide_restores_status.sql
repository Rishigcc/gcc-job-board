-- ===========================================================================
-- 016_unhide_restores_status.sql   --   unhiding restored 'live' instead of
--                                       whatever the status actually was
--
-- THE BUG
--   A recruiter closed a role early. An admin hid it, then unhid it, and it
--   came back LIVE -- publicly visible and taking applications, on a role its
--   owner had deliberately shut, with no notification to them.
--
--   admin_set_job_hidden() computed its target as
--
--     case when p_hidden then 'hidden' else 'live' end
--
--   so the inverse ASSUMED a default rather than reading what had been
--   recorded. The audit row already held before = {"status": "closed"}: the
--   information was there and unused.
--
-- A SECOND CONSEQUENCE, FOUND WHILE FIXING THE FIRST
--   private.jobs_set_closed_at() clears closed_at whenever status is not
--   'closed'. So the wrong unhide also wiped the close date, moving that
--   role's 12-month retention clock from "after it closed" to "after it
--   expires". Restoring the status alone would have left that silently wrong,
--   so the audit row now records closed_at too and the restore puts it back.
--
-- WHY THIS WAS THE ONLY ACTION WITH THE BUG, AND HOW TO SPOT THE NEXT ONE
--   Hide/unhide is the only reversible action whose inverse has to
--   RECONSTRUCT a value. The others are told one:
--
--     admin_set_recruiter_verified(p_user, p_verified)   explicit boolean
--     admin_set_recruiter_suspended(p_user, p_suspended) explicit boolean
--     admin_rename_company(id, p_name, p_slug)           explicit strings
--
--   An inverse that infers is the one to check. An inverse that is told is
--   only as wrong as its caller.
--
-- ROLLBACK: 016_unhide_restores_status_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE TRIGGER STOPS CLOBBERING AN EXPLICIT closed_at
--
-- Only stamps now() when the caller did not supply one. A recruiter closing a
-- role never touches closed_at, so it is still null when the trigger sees it
-- and still gets stamped. An admin restoring a previously closed role
-- supplies the original date, and it survives.
-- ---------------------------------------------------------------------------
create or replace function private.jobs_set_closed_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
begin
  if new.status = 'closed' and coalesce(old.status, '') <> 'closed' then
    -- Supplied by a restore -> keep it. Not supplied -> this is the moment of
    -- closing, so stamp it.
    if new.closed_at is null then
      new.closed_at := now();
    end if;
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.jobs_set_closed_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. UNHIDE RESTORES WHAT WAS RECORDED
--
-- The previous status comes from the most recent 'job_hidden' audit row for
-- this job. Validated against the two values a hidden job can have come from,
-- because a stored value is still a value that could be wrong.
--
-- THE FALLBACK IS 'closed', NOT 'live', AND THAT IS DELIBERATE.
--   If no audit row exists -- a job hidden before this migration, or by hand
--   in SQL -- there is nothing to restore from, so one of the two has to be
--   assumed. The asymmetry decides it:
--
--     assume 'live' wrongly   a role its owner shut is publicly taking
--                             applications, and only an admin can undo it
--     assume 'closed' wrongly a role is not visible, and the RECRUITER can
--                             reopen it themselves -- 'closed' -> 'live' is
--                             inside their own update policy
--
--   One failure is silent and needs an admin; the other is visible and
--   self-service. So the safe default is the restrictive one.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_job_hidden(
    p_job_id bigint,
    p_hidden boolean
  )
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_title     text;
  v_status    text;
  v_closed_at timestamptz;
  v_target    text;
  v_restore   timestamptz;
  v_recorded  text;
begin
  if not private.is_admin() then
    raise exception 'Only an administrator can do that.';
  end if;

  select j.title, j.status, j.closed_at
    into v_title, v_status, v_closed_at
    from public.jobs j where j.id = p_job_id;

  if not found then
    raise exception 'That role could not be found.';
  end if;

  if p_hidden and v_status = 'hidden' then
    return 'Already hidden.';
  end if;

  if not p_hidden and v_status <> 'hidden' then
    return 'That role is not hidden.';
  end if;

  if p_hidden then
    v_target  := 'hidden';
    v_restore := null;
  else
    -- What was it before someone hid it?
    select a.before->>'status', (a.before->>'closed_at')::timestamptz
      into v_recorded, v_restore
      from public.admin_audit a
     where a.action = 'job_hidden'
       and a.target_type = 'job'
       and a.target_id = p_job_id::text
     order by a.id desc
     limit 1;

    v_target := case
      when v_recorded in ('live', 'closed') then v_recorded
      else 'closed'   -- nothing recorded, or something unexpected
    end;

    if v_target <> 'closed' then
      v_restore := null;
    end if;
  end if;

  update public.jobs
     set status    = v_target,
         closed_at = case when v_target = 'closed' then v_restore else null end
   where id = p_job_id;

  perform private.audit(
    auth.uid(),
    case when p_hidden then 'job_hidden' else 'job_unhidden' end,
    'job',
    p_job_id::text,
    case
      when p_hidden then
        '"' || v_title || '" hidden — gone from the public board, and its poster cannot edit or reopen it'
      when v_target = 'closed' and v_recorded is null then
        '"' || v_title || '" unhidden as closed — nothing was recorded about its previous state, so it was restored to the safe one. The recruiter can reopen it themselves.'
      when v_target = 'closed' then
        '"' || v_title || '" unhidden and restored to closed, which is what it was before it was hidden. It is NOT back on the public board; the recruiter can reopen it themselves.'
      else
        '"' || v_title || '" unhidden and restored to live, which is what it was before it was hidden. It is public again unless it has passed its closing date.'
    end,
    -- closed_at is recorded from here on, so a restore can put it back and the
    -- retention clock does not move.
    jsonb_build_object('status', v_status, 'closed_at', v_closed_at),
    jsonb_build_object('status', v_target, 'closed_at',
                       case when v_target = 'closed' then v_restore else null end),
    true
  );

  return case
    when p_hidden then 'Hidden.'
    when v_target = 'closed' then 'Unhidden, and restored to closed.'
    else 'Unhidden, and restored to live.'
  end;
end;
$$;

revoke all on function public.admin_set_job_hidden(bigint, boolean) from public;
grant execute on function public.admin_set_job_hidden(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. CHECKS -- every column must read PASS.
--
-- c4 is the regression itself, run as data rather than as a click: it finds
-- any job that is live today whose most recent hide recorded it as closed.
-- That is exactly the bug, and it should read 0 once job 17 is put back.
-- ---------------------------------------------------------------------------
select
  case when (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='admin_set_job_hidden')
       then 'PASS' else 'FAIL' end as c1_function_still_definer,

  case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname in ('public','private') and p.prokind='f'
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                 where c like 'search_path=%')) = 0
       then 'PASS' else 'FAIL — an unpinned function exists' end as c2_search_paths_pinned,

  case when has_function_privilege('authenticated','public.admin_set_job_hidden(bigint, boolean)','EXECUTE')
        and not has_function_privilege('anon','public.admin_set_job_hidden(bigint, boolean)','EXECUTE')
       then 'PASS' else 'FAIL — the grant changed' end as c3_grant_unchanged,

  case when (select count(*) from public.jobs j
              where j.status = 'live'
                and (select a.before->>'status' from public.admin_audit a
                      where a.action='job_hidden' and a.target_type='job'
                        and a.target_id = j.id::text
                      order by a.id desc limit 1) = 'closed') = 0
       then 'PASS'
       else 'FAIL — ' || (select count(*) from public.jobs j
              where j.status = 'live'
                and (select a.before->>'status' from public.admin_audit a
                      where a.action='job_hidden' and a.target_type='job'
                        and a.target_id = j.id::text
                      order by a.id desc limit 1) = 'closed')
            || ' role(s) are live that were closed before being hidden' end
    as c4_no_role_wrongly_live;
