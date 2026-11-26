-- ===========================================================================
-- 018_verification_latency_fix_rollback.sql
--
-- Returns first_verified_at() to treating the earliest recorded verification
-- as the original one. Running this reintroduces a false breach for any
-- account that was verified before the audit log existed and later
-- re-verified through /admin.
-- ===========================================================================

create or replace function private.first_verified_at(p_user uuid)
  returns timestamptz
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select min(a.created_at)
    from public.admin_audit a
   where a.action = 'recruiter_verified'
     and a.target_type = 'recruiter'
     and a.target_id = p_user::text;
$$;

revoke all on function private.first_verified_at(uuid) from public, anon, authenticated;

select 'reverted' as state;
