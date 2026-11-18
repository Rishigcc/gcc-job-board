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
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(MAX_RESULTS);

      if (cancelled) return;
      setResults({ term: query, rows: data || [] });
      setHighlight(-1);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, resolved]);

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
  const canAddNew = showPanel && slug.length > 0 && !slugTwin;

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
      else if (canAddNew && rows.length === 0) addNew();
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

          {canAddNew ? (
            <button
              type="button"
              onClick={addNew}
              className="w-full border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-blue-800 transition hover:bg-slate-100"
            >
              Add “{term.trim()}” as a new company
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-1.5 text-xs text-slate-500">
        Pick the company from the list if it is there. Adding a new one is
        permanent — company names cannot be edited afterwards, so only add one
        when it genuinely is not listed.
      </p>

      {error ? (
        <p className="mt-1 text-sm font-medium text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

export default CompanyPicker;
