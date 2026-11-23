-- ===========================================================================
-- 015_admin_guard_fix.sql   --   stage 9 fix: the admin endpoints could not
--                                establish who the caller was
--
-- WHAT BROKE
--   Both admin endpoints returned 502 to everyone, admin included. Rishi's
--   diagnosis was right and it is the same trap as stage 6: this project
--   grants service_role nothing by default, so
--
--     admin.from("user_roles").select(...)
--
--   inside api/_lib/adminGuard.js was 42501 permission denied, which the
--   guard reported as "We could not confirm your account".
--
-- THE SAME ROOT CAUSE BROKE A SECOND THING, WHICH NO ONE HAD REACHED YET
--   /api/admin-delete-orphan verifies a path against the orphan report before
--   deleting it. It called public.admin_orphaned_resumes() with the service
--   key, and that was broken twice over:
--
--     1. the function is granted to `authenticated` only, so the service key
--        could not execute it at all; and
--     2. even with a grant it would have returned nothing, because its WHERE
--        clause contains `private.is_admin()` and auth.uid() is null for the
--        service key -- so every path would have looked un-orphaned and every
--        deletion would have been refused with 409.
--
--   So the orphan panel was broken in two independent ways that a 502 on an
--   earlier step hid.
--
-- WHY NOT JUST GRANT service_role SELECT ON user_roles
--   Because user_roles is the table whose entire design is that nothing can
--   write it and almost nothing can read it -- it was the first decision in
--   this project. Widening it to answer one yes/no question is more surface
--   than the question needs. A function that returns a boolean is the smaller
--   change and matches every other server-side check here.
--
-- ROLLBACK: 015_admin_guard_fix_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. IS THIS USER AN ADMIN?  --  service_role only
--
-- Takes a user id rather than reading auth.uid(), because the caller is a
-- server holding a verified token, not the user themselves.
--
-- service_role ONLY. That grant is the entire control: nothing reachable from
-- a browser can ask this question about another account, and it must not be
-- granted to authenticated. A signed-in user wanting to know whether they
-- themselves are an admin already has the "read own role" policy on
-- user_roles, which is what /admin uses.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_user(p_user uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select p_user is not null
     and exists (
       select 1 from public.user_roles
        where user_id = p_user and role = 'admin'
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. IS THIS PATH AN ORPHAN?  --  service_role only
--
-- The question /api/admin-delete-orphan actually needs, answered without
-- depending on auth.uid(). It is deliberately FACTUAL rather than
-- authorising: it says whether an object has a candidate_resumes row, and
-- nothing about who is asking.
--
-- The authorisation lives where it belongs -- the endpoint has already proved
-- the caller is an admin via is_admin_user(), and admin_log_orphan_deleted()
-- re-checks the actor independently before recording anything. Making this
-- one check the admin too would be a third copy of the same decision.
--
-- What it still guarantees is the thing that matters: a path with a live row
-- pointing at it returns false, so a real candidate's resume can never be
-- deleted through that endpoint however the request is built.
-- ---------------------------------------------------------------------------
create or replace function public.is_orphaned_resume(p_path text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select p_path is not null
     and length(btrim(p_path)) > 0
     and exists (
       select 1 from storage.objects o
        where o.bucket_id = 'resumes' and o.name = p_path
     )
     and not exists (
       select 1 from public.candidate_resumes cr
        where cr.resume_path = p_path
     );
$$;

-- ---------------------------------------------------------------------------
-- 3. GRANTS -- service_role only, both of them.
-- ---------------------------------------------------------------------------
revoke all on function public.is_admin_user(uuid)      from public;
revoke all on function public.is_orphaned_resume(text)  from public;

grant execute on function public.is_admin_user(uuid)     to service_role;
grant execute on function public.is_orphaned_resume(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. CHECKS -- every column must read PASS.
-- ---------------------------------------------------------------------------
select
  case when has_function_privilege('service_role','public.is_admin_user(uuid)','EXECUTE')
        and has_function_privilege('service_role','public.is_orphaned_resume(text)','EXECUTE')
       then 'PASS' else 'FAIL — the endpoints still cannot ask' end
    as c1_server_can_ask,

  case when not has_function_privilege('authenticated','public.is_admin_user(uuid)','EXECUTE')
        and not has_function_privilege('authenticated','public.is_orphaned_resume(text)','EXECUTE')
        and not has_function_privilege('anon','public.is_admin_user(uuid)','EXECUTE')
        and not has_function_privilege('anon','public.is_orphaned_resume(text)','EXECUTE')
       then 'PASS' else 'FAIL — a browser can ask about another account' end
    as c2_not_client_callable,

  case when not has_table_privilege('service_role','public.user_roles','SELECT')
       then 'PASS' else 'FAIL — user_roles was widened instead' end
    as c3_user_roles_still_closed,

  case when (select public.is_admin_user((select user_id from public.user_roles where role='admin' limit 1)))
        and not (select public.is_admin_user('00000000-0000-0000-0000-000000000000'::uuid))
        and not (select public.is_admin_user(null))
       then 'PASS' else 'FAIL — the admin answer is wrong' end
    as c4_answers_correctly,

  case when not (select public.is_orphaned_resume('nothing/at-all.pdf'))
        and not (select public.is_orphaned_resume(''))
        and not (select public.is_orphaned_resume(null))
       then 'PASS' else 'FAIL — a non-existent path reads as an orphan' end
    as c5_orphan_answer_is_conservative,

  case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public','private') and p.prokind = 'f'
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                 where c like 'search_path=%')) = 0
       then 'PASS' else 'FAIL — an unpinned function exists' end
    as c6_all_search_paths_pinned;
