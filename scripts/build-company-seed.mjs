// ===========================================================================
// Turn a plain list of GCC company names into a seed migration.
//
// WHAT TO GIVE IT
//   A UTF-8 text file, ONE COMPANY NAME PER LINE, no header row, no numbering,
//   no quotes, written exactly as the name should appear on the site:
//
//       Walmart Global Tech India
//       HSBC Technology India
//       Target Corporation India
//
//   A .csv with a single column works too. Anything with several columns does
//   not -- a comma inside a legal name ("Shell India Markets Pvt. Ltd., Bengaluru")
//   cannot be told apart from a delimiter, so this script never splits on one.
//
// HOW TO RUN IT
//   node scripts/build-company-seed.mjs path/to/companies.txt
//
//   It writes supabase/migrations/005_seed_companies.sql and prints a report:
//   how many names were read, how many survive, and every pair that collided
//   so they can be checked by eye before the migration is run.
//
// WHY A GENERATED FILE AND NOT A COPY-PASTE
//   public.companies.slug is unique. Two names that slugify the same way
//   would abort the whole insert, so the deduplication has to happen before
//   the SQL exists, not inside it.
// ===========================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { companySlug } from "../src/lib/jobOptions.js";

const input = process.argv[2];

if (!input) {
  console.error("usage: node scripts/build-company-seed.mjs <list.txt>");
  process.exit(1);
}

const raw = readFileSync(input, "utf8");
const lines = raw.split(/\r?\n/);

const seen = new Map(); // slug -> name
const collisions = [];
const rejected = [];

for (const line of lines) {
  const name = line.trim().replace(/\s+/g, " ");
  if (!name) continue;

  const slug = companySlug(name);

  if (!slug) {
    rejected.push(name);
    continue;
  }

  if (seen.has(slug)) {
    // The FIRST spelling in the list wins. No cleverness here on purpose:
    // "HSBC" and "H.S.B.C." are the same length, so any automatic rule would
    // pick one of them for no reason. Every collision is printed instead, so
    // the choice is made in the source list by a person who knows which
    // spelling is right.
    collisions.push({ slug, kept: seen.get(slug), dropped: name });
    continue;
  }

  seen.set(slug, name);
}

const rows = [...seen.entries()]
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(([slug, name]) => `  (${q(name)}, ${q(slug)})`);

function q(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const sql = `-- ===========================================================================
-- 005_seed_companies.sql
--
-- Seeds public.companies so the hiring-company picker is useful to the first
-- recruiter who uses it rather than empty.
--
-- GENERATED FILE. Do not hand-edit: regenerate with
--     node scripts/build-company-seed.mjs <list.txt>
--
-- Source list: ${input}
-- Generated:   ${new Date().toISOString().slice(0, 10)}
-- Rows:        ${rows.length}
--
-- SAFE TO RUN TWICE. Every row is ON CONFLICT (slug) DO NOTHING, so a company
-- a recruiter has already created keeps the name they gave it.
--
-- WHAT IT CHANGES: data only. No table, column, policy, grant or trigger.
--
-- NOTE: public.companies is readable by anon ("anyone reads companies"), so
-- these names are on the public API the moment this runs. They are company
-- names, not anyone's data, but it is not a private staging area.
-- ===========================================================================

insert into public.companies (name, slug) values
${rows.join(",\n")}
on conflict (slug) do nothing;
`;

const out = "supabase/migrations/005_seed_companies.sql";
writeFileSync(out, sql);

console.log(`read       ${lines.length} lines`);
console.log(`kept       ${rows.length} companies`);
console.log(`collisions ${collisions.length}`);
console.log(`rejected   ${rejected.length} (no letter or digit in the name)`);
console.log(`wrote      ${out}\n`);

if (collisions.length) {
  console.log("COLLISIONS -- same slug, so only one row is created. Check these:");
  for (const c of collisions) {
    console.log(`  ${c.slug}\n     kept    ${c.kept}\n     dropped ${c.dropped}`);
  }
}

if (rejected.length) {
  console.log("\nREJECTED:");
  for (const r of rejected) console.log(`  ${r}`);
}
