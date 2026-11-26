-- ===========================================================================
-- drop_question_authors.sql   --   RUN ONLY AFTER THE JOB-BOARD BRANCH IS
--                                  MERGED AND DEPLOYED TO PRODUCTION.
--
-- NOT IN supabase/migrations/ ON PURPOSE. Everything in that folder is meant
-- to be run in order, now. This one must not be: until the merge is live,
-- iworkatgcc.com reads public.question_authors, and dropping it replaces
-- every author name on the community with "Someone".
--
-- AFTER the merge, src/lib/authors.js calls public.author_names(uuid[])
-- instead, nothing reads the view, and dropping it clears the Security
-- Advisor's "Security Definer View" finding for good.
--
-- BEFORE RUNNING IT
--   1. The merge is deployed and iworkatgcc.com is serving it.
--   2. Open a question page on the live site and confirm author names show.
--   3. Then run this. Then reload that page: names must still show, because
--      they are now coming from the function.
-- ===========================================================================

drop view if exists public.question_authors;

-- Expect view_gone = true and function_present = true. The second half
-- matters: if the function were missing, the drop would have taken author
-- names with it.
select
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'question_authors'
  ) as view_gone,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'author_names'
  ) as function_present;
