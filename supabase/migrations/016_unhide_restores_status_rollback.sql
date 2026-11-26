-- ===========================================================================
-- 016_unhide_restores_status_rollback.sql
--
-- Returns admin_set_job_hidden() to assuming 'live' on unhide, and the trigger
-- to overwriting closed_at. Running this reintroduces the bug where unhiding a
-- role its recruiter had closed puts it back on the public board.
-- ===========================================================================

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
  v_title  text;
  v_status text;
  v_target text;
begin
  if not private.is_admin() then
    raise exception 'Only an administrator can do that.';
  end if;

  select j.title, j.status into v_title, v_status
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

  v_target := case when p_hidden then 'hidden' else 'live' end;

  update public.jobs set status = v_target where id = p_job_id;

  perform private.audit(
    auth.uid(),
    case when p_hidden then 'job_hidden' else 'job_unhidden' end,
    'job',
    p_job_id::text,
    case when p_hidden
      then '"' || v_title || '" hidden'
      else '"' || v_title || '" unhidden'
    end,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', v_target),
    true
  );

  return case when p_hidden then 'Hidden.' else 'Unhidden.' end;
end;
$$;

select 'reverted' as state;
