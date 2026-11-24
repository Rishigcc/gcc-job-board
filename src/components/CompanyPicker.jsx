import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { companySlug } from "../lib/jobOptions";

// ===========================================================================
// Picking the HIRING company.
//
// WHY THIS IS NOT A TEXT BOX
//   A free-text field fragments the company table, and the damage is
//   permanent: recruiters have no UPDATE grant on public.companies, so
//   "Walmart Global Tech India", "Walmart Global Tech" and "Walmart" become
//   three rows that only an admin can merge. That breaks company pages and
//   breaks "show me every role at this GCC".
//
//   Slug matching is a backstop, not a fix. companySlug() catches casing and
//   punctuation ("H.S.B.C." = "HSBC"). It cannot know that "Walmart Global
//   Tech India" and "Walmart" are the same employer. Only a human looking at
//   a list of existing names can.
//
// SO: CREATING A COMPANY IS AN EXPLICIT ACT
//   Typing a name resolves to nothing. The recruiter must either click a
//   company that already exists, or click "Add <name> as a new company". The
//   form will not submit until one of those has happened, and the review
//   panel restates which of the two it was.
//
// SEARCHING
//   Server-side, not a 500-row preload: the companies table is seeded with
//   GCC names and is expected to run to several thousand rows. public.
//   companies is readable by anon and authenticated ("anyone reads
//   companies"), so this needs no special grant.
//
//   TWO queries, not one, and the second is the important one. Searching the
//   NAME alone misses exactly the case this component exists for: typing
//   "test co a." found nothing, because the trailing full stop is not in
//   "Test Co A", and the recruiter was then offered a duplicate to create.
//   The normalisation was being applied at insert time but not at search
//   time, so a collision could only be discovered by causing it.
//
//   So the slug of what was typed is searched as well. That is the same
//   normalisation the insert uses, which means anything resolveCompany()
//   would silently merge into an existing row is now visible BEFORE the
//   recruiter commits to it.
// ===========================================================================

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const MAX_RESULTS = 8;

// PostgREST puts the filter value straight into the query string, so a comma
// or a parenthesis in the search term can be read as filter syntax, and % and
// * are wildcards. None of these carry meaning in a company search.
function sanitise(term) {
  return term.replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim();
}

function CompanyPicker({ value, onChange, error, inputId = "company_name" }) {
  const { company_id: companyId, company_name: companyName, company_is_new: isNew } =
    value;

  const resolved = Boolean(companyId) || isNew;

  const [term, setTerm] = useState(companyName || "");
  // Results carry the term they were fetched for. Comparing that against
  // what is in the box means a stale list can never be shown next to a newer
  // term -- and it keeps every setState inside the async callback, which is
  // what react-hooks/set-state-in-effect is asking for.
  const [results, setResults] = useState({ term: "", rows: [] });
  const [highlight, setHighlight] = useState(-1);
  // Which term the "add anyway" escape hatch was opened for. Stored as the
  // term rather than a boolean, so typing one more character closes it
  // again with no effect and no stale-state bug.
  const [addAnywayFor, setAddAnywayFor] = useState("");
  const inputRef = useRef(null);

  const query = sanitise(term);
  const slug = companySlug(term);

  // Debounced search. `cancelled` guards against an earlier, slower response
  // landing after a later one and showing results for a term the recruiter
  // has already typed past.
  useEffect(() => {
    if (resolved || query.length < MIN_CHARS) return undefined;

    let cancelled = false;

    const timer = setTimeout(async () => {
      const [byName, bySlug] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, slug")
          .ilike("name", `%${query}%`)
          .order("name")
          .limit(MAX_RESULTS),
        // `slug` is only ever [a-z0-9-], so it needs no escaping before it
        // goes into the filter.
        slug
          ? supabase
              .from("companies")
              .select("id, name, slug")
              .ilike("slug", `%${slug}%`)
              .order("name")
              .limit(MAX_RESULTS)
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;

      // Slug matches first: an exact slug match is the strongest signal we
      // have that this is the same company under a different spelling.
      const merged = [];
      const seen = new Set();

      for (const row of [...(bySlug.data || []), ...(byName.data || [])]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }

      merged.sort((a, b) => {
        const aExact = a.slug === slug ? 0 : 1;
        const bExact = b.slug === slug ? 0 : 1;
        return aExact - bExact || a.name.localeCompare(b.name);
      });

      setResults({ term: query, rows: merged.slice(0, MAX_RESULTS) });
      setHighlight(-1);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, slug, resolved]);

  const handleType = (event) => {
    const next = event.target.value;
    setTerm(next);
    // The typed text is kept in company_name so validation can tell "nothing
    // entered" apart from "entered but never confirmed", but company_id is
    // cleared: typing is not choosing.
    onChange({ company_id: "", company_name: next, company_is_new: false });
  };

  const choose = (company) => {
    setTerm(company.name);
    onChange({
      company_id: company.id,
      company_name: company.name,
      company_is_new: false,
    });
  };

  const addNew = () => {
    onChange({
      company_id: "",
      company_name: term.trim(),
      company_is_new: true,
    });
  };

  const clear = () => {
    onChange({ company_id: "", company_name: term, company_is_new: false });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const showPanel = query.length >= MIN_CHARS && results.term === query;
  const searching = query.length >= MIN_CHARS && results.term !== query;
  const rows = showPanel ? results.rows : [];

  // A name that slugifies onto an existing row would be silently merged into
  // it by resolveCompany(), so offering "add as new" there would be a lie.
  const slugTwin = rows.find((c) => c.slug === slug);

  // WHETHER A NEW COMPANY *COULD* BE CREATED FROM WHAT IS TYPED.
  const canAddNew = showPanel && slug.length > 0 && !slugTwin;

  // WHETHER TO OFFER IT, WHICH IS A DIFFERENT QUESTION -- and the one this
  // component got wrong until 24 Nov 2026.
  //
  // Rishi found it: typing "wal" showed Walmart with "Add 'wal' as a new
  // company" directly beneath, one misclick from a permanent company called
  // "wal". The keyboard path was already safe (Enter requires an empty
  // result below); the mouse path was not, which is the asymmetry that hid
  // it. The slug is immutable by design -- migration 001: "a live URL must
  // never change" -- and recruiters cannot delete, so junk created here
  // needs an admin to rename it.
  //
  // So with matches on screen the create row is NOT rendered. It takes a
  // deliberate second action to reach.
  //
  // WHY IT IS NOT SIMPLY "EMPTY RESULTS ONLY", which was the first
  // instinct: the search is `ilike %term%`, so a company whose full name is
  // a proper substring of a listed one can never produce an empty result.
  // A recruiter at "Sonic" would see "SonicWall", get no way to add their
  // own, and be unable to post at all -- company_id is NOT NULL. That is a
  // worse failure than a misnamed company an admin can rename.
  //
  // The common case still resolves itself: because the match is on a
  // substring, typing the FULL company name empties the list, so anyone
  // whose company is genuinely absent arrives at the prominent offer by
  // typing the thing they were going to type anyway.
  const addAnywayOpen = addAnywayFor === query;
  const offerAddNew = canAddNew && (rows.length === 0 || addAnywayOpen);

  // Enter must pick the highlighted company, never submit the form. The form
  // blocks Enter as well; this runs first and is the useful half.
  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
      return;
    }
    if (event.key === "Enter") {
      // Never submits the form, and never creates a company by accident:
      // Enter picks a highlighted row, or adds a new company only when the
      // search has come back empty. If matches are on screen and none is
      // highlighted, Enter does nothing -- choosing between them is the
      // whole point of the list.
      event.preventDefault();
      if (highlight >= 0 && rows[highlight]) choose(rows[highlight]);
      else if (offerAddNew) addNew();
      return;
    }
    if (event.key === "Escape") {
      setResults({ term: "", rows: [] });
    }
  };

  if (resolved) {
    return (
      <div>
        <div
          className={
            isNew
              ? "flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5"
              : "flex items-start justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5"
          }
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">{companyName}</p>
            <p className="mt-0.5 text-xs text-slate-700">
              {isNew
                ? "New company. This name will be created and cannot be edited afterwards — check the spelling now."
                : "Existing company on iWorkAtGCC. This role will be listed under it."}
            </p>
          </div>

          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        id={inputId}
        ref={inputRef}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        value={term}
        onChange={handleType}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-autocomplete="list"
        placeholder="Start typing — Walmart, HSBC, Target…"
      />

      {query.length > 0 && query.length < MIN_CHARS ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Keep typing — at least {MIN_CHARS} characters.
        </p>
      ) : null}

      {searching ? (
        <p className="mt-1.5 text-xs text-slate-500">Searching…</p>
      ) : null}

      {showPanel ? (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200">
          {rows.length > 0 ? (
            <ul role="listbox" className="divide-y divide-slate-100">
              {rows.map((company, index) => (
                <li key={company.id}>
                  <button
                    type="button"
                    onClick={() => choose(company)}
                    onMouseEnter={() => setHighlight(index)}
                    className={
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition " +
                      (index === highlight
                        ? "bg-blue-50 text-blue-900"
                        : "bg-white text-slate-800 hover:bg-slate-50")
                    }
                  >
                    <span className="font-medium">{company.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">Use this</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bg-white px-3 py-2 text-sm text-slate-600">
              No company on iWorkAtGCC matches that yet.
            </p>
          )}

          {slugTwin ? (
            <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <strong>{slugTwin.name}</strong> is the same name, so it will be
              used rather than a second copy created.
            </p>
          ) : null}

          {offerAddNew ? (
            <>
              {/* THIS NOTE IS A SPACER AS WELL AS A SENTENCE. Without it the
                  create button would appear exactly where the recruiter just
                  clicked "None of these is my company", so a double-click
                  would reveal and then create in one gesture -- reintroducing
                  the misclick this whole arrangement exists to stop. */}
              {rows.length > 0 ? (
                <p className="border-t border-slate-200 bg-slate-50 px-3 pt-2 text-xs text-slate-600">
                  Check the list above once more. A new company cannot be
                  renamed afterwards.
                </p>
              ) : null}

              <button
                type="button"
                onClick={addNew}
                className={
                  "w-full bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-blue-800 transition hover:bg-slate-100" +
                  (rows.length > 0 ? "" : " border-t border-slate-200")
                }
              >
                Add “{term.trim()}” as a new company
              </button>
            </>
          ) : canAddNew ? (
            /* Matches are on screen, so creating is one deliberate click
               away rather than the next row down. Muted, lighter than a
               result, and it creates nothing by itself. */
            <button
              type="button"
              onClick={() => setAddAnywayFor(query)}
              className="w-full border-t border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
            >
              None of these is my company
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-1.5 text-xs text-slate-500">
        Pick the company from the list if it is there. Type the full name if
        it is not — adding a new company is permanent, because the name cannot
        be edited afterwards.
      </p>

      {error ? (
        <p className="mt-1 text-sm font-medium text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

export default CompanyPicker;
