-- ===========================================================================
-- 010_author_names_rollback.sql
--
-- Puts the view back to every profile row and removes the function. Only
-- needed if the switch to author_names() has to be undone before the branch
-- merges; after the merge the function is what the site uses, and this would
-- break author names everywhere.
-- ===========================================================================

create or replace view public.question_authors as
  select id, display_name from public.profiles;

comment on view public.question_authors is null;

drop function if exists public.author_names(uuid[]);

select count(*) as rows_now from public.question_authors;
