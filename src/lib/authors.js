import { supabase } from "./supabase";

export async function fetchAuthorNames(userIds) {
  const uniqueIds = [...new Set(userIds)];

  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from("question_authors")
    .select("id, display_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("Error loading author names:", error);
    return {};
  }

  return Object.fromEntries(
    data.map((author) => [author.id, author.display_name])
  );
}
