-- ===========================================================================
-- 012_pin_search_path.sql   --   three pre-existing functions, hardened
--
-- Not part of any stage. The Security Advisor flags three functions that
-- predate the job board as "Function Search Path Mutable":
--
--   public.update_updated_at()     sets new.updated_at
--   public.prevent_slug_change()   restores old.slug
--   public.mark_answer_edited()    sets new.edited_at
--
-- HOW BAD IS IT, HONESTLY
--   Less bad than the same warning on a SECURITY DEFINER function, and worth
--   saying so rather than implying every advisor line is equally urgent.
--   All three are SECURITY INVOKER: they run with the privileges of whoever
--   triggered them, so a mutable search_path cannot be used to escalate.
--   Someone bending `now()` to resolve to their own function would be doing
--   it to their own session, with their own rights.
--
--   All three are also trivial and reference no object in `public` at all --
--   only NEW, OLD and now(). So there is nothing here to hijack today.
--
--   It is still worth pinning. The warning is about what the function could
--   become: these are trigger functions, so the moment a body grows a
--   reference to a table, the resolution of that name depends on whoever is
--   writing the row. Pinning now is one line each and removes the question.
--
-- WHY `alter function` AND NOT `create or replace`
--   Because the bodies are not being changed and this should be able to say
--   so provably. `alter ... set search_path` attaches the setting and leaves
--   the source untouched, so there is no chance of a transcription slip in a
--   function the community's questions and answers depend on.
--
-- WHY `public, pg_catalog` AND NOT `''`
--   Supabase's own advice is the empty search_path with everything fully
--   qualified. This project has used `public, pg_catalog` on every function
--   since migration 001, and one convention consistently applied is worth
--   more than a marginally tighter setting on three functions that resolve
--   nothing. A later reader comparing two styles would have to work out
--   whether the difference meant something.
--
-- ROLLBACK: 012_pin_search_path_rollback.sql
-- ===========================================================================

alter function public.update_updated_at()   set search_path = public, pg_catalog;
alter function public.prevent_slug_change() set search_path = public, pg_catalog;
alter function public.mark_answer_edited()  set search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- CHECKS
--
-- Expect, in order:
--   a) all three with proconfig = {search_path="public, pg_catalog"} and
--      prosecdef false -- they are invoker functions and stay that way
--   b) unpinned_functions = 0. This sweeps EVERY function in public and
--      private, so it also proves nothing else was missed, and it is the
--      query to re-run after any later migration adds one.
-- ---------------------------------------------------------------------------
select n.nspname, p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('update_updated_at', 'prevent_slug_change', 'mark_answer_edited')
 order by p.proname;

select count(*) as unpinned_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private')
   and p.prokind = 'f'
   and not exists (
     select 1 from unnest(coalesce(p.proconfig, '{}')) as c
      where c like 'search_path=%'
   );
