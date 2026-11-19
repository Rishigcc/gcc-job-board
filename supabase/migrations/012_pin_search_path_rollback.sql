-- ===========================================================================
-- 012_pin_search_path_rollback.sql
--
-- Unpins the three. There is no reason to run this except to reproduce the
-- advisor warning: it makes nothing work that did not work before.
-- ===========================================================================

alter function public.update_updated_at()   reset search_path;
alter function public.prevent_slug_change() reset search_path;
alter function public.mark_answer_edited()  reset search_path;

select p.proname, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('update_updated_at', 'prevent_slug_change', 'mark_answer_edited')
 order by p.proname;
