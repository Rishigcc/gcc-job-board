import { supabase } from "./supabase";

const MAX_SLUG_LENGTH = 80;

export function slugify(text) {
  const base = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!base) return "question";

  if (base.length <= MAX_SLUG_LENGTH) return base;

  const truncated = base.slice(0, MAX_SLUG_LENGTH);
  const lastHyphen = truncated.lastIndexOf("-");

  return (lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated).replace(
    /-+$/,
    ""
  );
}

export async function generateUniqueSlug(baseSlug) {
  const { data, error } = await supabase
    .from("questions")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (error) {
    console.error("Error checking slug uniqueness:", error);
    return baseSlug;
  }

  const existingSlugs = new Set((data || []).map((row) => row.slug));

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;

  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}
