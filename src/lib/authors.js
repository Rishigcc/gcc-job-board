import { supabase } from "./supabase";

// ===========================================================================
// Resolving a user id to a public display name.
//
// WHY AN RPC AND NOT A TABLE OR A VIEW
//   Display names live in public.profiles, whose policy is
//   auth.uid() = id -- you can read your own row and nobody else's. The Q&A
//   pages have to show who wrote what, so something has to cross that line,
//   and RLS cannot be the thing that does it: a policy is row-level, so any
//   policy letting you read someone's row lets you read every column of it,
//   google_email included.
//
//   public.question_authors used to be that something: a SECURITY DEFINER
//   view over the whole of profiles, which the Security Advisor has flagged
//   since before the job board existed. The bypass itself was necessary; its
//   SCOPE was the problem -- 2,464 rows for a view named after the 97 people
//   who have ever posted anything.
//
//   public.author_names(uuid[]) replaces it. A function takes the ids the
//   caller already has and returns names for them. There is no select *, so
//   there is nothing to enumerate: you have to know the uuid to learn the
//   name, and the uuids this app passes all came from questions, answers or
//   hearts in the first place. Widening it to return an email address would
//   mean changing a signature and every caller, which is a visible act --
//   adding a column to a view was not.
//
//   See migration 010. The view still exists, narrowed, because production
//   is serving the main branch and still reads it; it is dropped after the
//   merge by supabase/post-merge/drop_question_authors.sql.
//
// A MISSING NAME IS NORMAL, NOT AN ERROR
//   Most community members have never set a display name. The function
//   returns rows only for those who have, so an id simply may not come back,
//   and every caller already falls back to "Someone" or similar.
// ===========================================================================

export async function fetchAuthorNames(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);

  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase.rpc("author_names", {
    p_ids: uniqueIds,
  });

  if (error) {
    console.error("Error loading author names:", error);
    return {};
  }

  return Object.fromEntries(
    (data || []).map((author) => [author.id, author.display_name])
  );
}
