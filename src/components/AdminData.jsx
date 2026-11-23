import { useCallback, useEffect, useState } from "react";
import {
  fetchCompanies,
  renameCompany,
  fetchOrphanedResumes,
  deleteOrphanFile,
  findCandidateByEmail,
  anonymiseCandidate,
} from "../lib/adminData";
import { companySlug } from "../lib/jobOptions";
import { Panel, Button, Notice } from "./AdminShared";
import { input, shortDate } from "../lib/adminFormat";

// ===========================================================================
// The three data actions: rename a company, delete an orphaned file,
// anonymise a candidate on request.
//
// ONE IS REVERSIBLE AND TWO ARE FINAL, and the panels say which. The two
// final ones need a typed confirmation, checked on the server as well as
// here, because a confirmation only the browser enforces is decoration.
//
// MERGING COMPANIES IS NOT HERE. It was cut from version 1: with 1,814
// companies seeded, recruiters pick rather than add, so the realistic repair
// is a misspelling rather than a duplicate. If a rename collides with an
// existing slug the function refuses and says a merge is what is needed --
// which is better than silently doing something else.
// ===========================================================================

// --------------------------------------------------------------- companies
function Companies() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(null);

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetchCompanies(query).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else setRows(result.rows);
    });

    return () => {
      active = false;
    };
  }, [query, reloadKey]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await renameCompany(editing, draft);

    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setMessage(result.message);
    setEditing(null);
    setDraft("");
    setReloadKey((k) => k + 1);
    setBusy(false);
  }, [editing, draft]);

  return (
    <Panel
      title="Companies"
      note="Renaming is reversible and recorded. Recruiters cannot edit company names themselves, so a misspelling stays until it is fixed here."
    >
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search);
        }}
      >
        <input
          className={`${input} max-w-xs`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search company names…"
          aria-label="Search company names"
        />
        <Button type="submit">Search</Button>
      </form>

      <Notice error={error} message={message} />

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No companies match that.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((company) => (
            <li key={company.id} className="border-b border-slate-200 py-3 last:border-b-0">
              {editing === company.id ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor={`rename-${company.id}`}>
                    New name
                  </label>
                  <input
                    id={`rename-${company.id}`}
                    className={`${input} mt-1.5`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={120}
                  />

                  {/* Shown because the slug is what a collision will be about,
                      and a rename that is refused for colliding is confusing
                      without seeing the value it collided on. */}
                  <p className="mt-1.5 font-mono text-xs text-slate-500">
                    web address: {companySlug(draft) || "—"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      tone="primary"
                      busy={busy}
                      disabled={draft.trim().length < 2 || draft.trim() === company.name}
                      onClick={save}
                    >
                      {busy ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      busy={busy}
                      onClick={() => {
                        setEditing(null);
                        setDraft("");
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">
                      {company.name}
                    </p>
                    <p className="font-mono text-xs text-slate-500">{company.slug}</p>
                  </div>

                  <Button
                    onClick={() => {
                      setEditing(company.id);
                      setDraft(company.name);
                      setError(null);
                      setMessage(null);
                    }}
                  >
                    Rename
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------- orphans
function Orphans() {
  const [rows, setRows] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetchOrphanedResumes().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else setRows(result.rows);
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const remove = useCallback(async (path) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await deleteOrphanFile(path, typed.trim());

    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setMessage("Deleted.");
    setConfirming(null);
    setTyped("");
    setReloadKey((k) => k + 1);
    setBusy(false);
  }, [typed]);

  return (
    <Panel
      title="Orphaned resume files"
      note="Files in private storage that no application points at — an upload whose database row never got written. Deleting one is FINAL. The report is the authorisation: the server refuses any path that is not listed here, so a live candidate's resume cannot be deleted from this panel."
    >
      <Notice error={error} message={message} />

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-emerald-700">
          No orphaned files. Every object in the bucket belongs to a resume on
          record.
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <li key={row.resume_path} className="border-b border-slate-200 py-3 last:border-b-0">
              <p className="break-all font-mono text-xs text-slate-800">{row.resume_path}</p>
              <p className="mt-1 text-xs text-slate-500">
                {Math.round((row.bytes || 0) / 1024)} KB · uploaded {shortDate(row.created_at)}
              </p>

              {confirming === row.resume_path ? (
                <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
                  <label className="block text-xs font-semibold text-red-900" htmlFor="orphan-confirm">
                    Type DELETE to confirm. This cannot be undone.
                  </label>
                  <input
                    id="orphan-confirm"
                    className={`${input} mt-1.5 max-w-xs`}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      tone="danger"
                      busy={busy}
                      disabled={typed.trim().toUpperCase() !== "DELETE"}
                      onClick={() => remove(row.resume_path)}
                    >
                      {busy ? "Deleting…" : "Delete permanently"}
                    </Button>
                    <Button
                      busy={busy}
                      onClick={() => {
                        setConfirming(null);
                        setTyped("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <Button
                    tone="danger"
                    onClick={() => {
                      setConfirming(row.resume_path);
                      setTyped("");
                      setError(null);
                      setMessage(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------- anonymise
function Anonymise() {
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const search = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setRows(null);

    const result = await findCandidateByEmail(email);

    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setRows(result.rows);
    setBusy(false);
  }, [email]);

  const run = useCallback(async (candidateId) => {
    setBusy(true);
    setError(null);

    const result = await anonymiseCandidate(candidateId, typed.trim());

    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setMessage(
      `Done — ${result.data.applications_anonymised} application(s) anonymised, ` +
        `${result.data.files_removed} file(s) deleted.`
    );
    setConfirming(null);
    setTyped("");
    setRows(null);
    setBusy(false);
  }, [typed]);

  return (
    <Panel
      title="Delete a candidate's data on request"
      note="The privacy policy offers this by email as well as self-service, so it has to exist here. It is FINAL: name, email, phone, notice period and the link to their account are erased, and the resume file is destroyed. Their community account, questions and answers are untouched."
    >
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          className={`${input} max-w-xs`}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address they wrote from…"
          aria-label="Candidate email address"
        />
        <Button type="submit" busy={busy}>Find</Button>
      </form>

      <Notice error={error} message={message} />

      {rows !== null && rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          Nobody found. Applications that have already been anonymised have no
          email address left, so they cannot be found again — which is what
          anonymising means, not a failure of this search.
        </p>
      ) : null}

      {rows?.length ? (
        <ul className="mt-2">
          {rows.map((row) => (
            <li key={row.candidate_id} className="border-b border-slate-200 py-3 last:border-b-0">
              <p className="break-words text-sm font-semibold text-slate-900">
                {row.full_name}
              </p>
              <p className="break-words text-xs text-slate-600">
                {row.email} · {row.applications} application
                {row.applications === 1 ? "" : "s"}
              </p>

              {confirming === row.candidate_id ? (
                <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
                  <label className="block text-xs font-semibold text-red-900" htmlFor="anon-confirm">
                    Type ANONYMISE to confirm. This cannot be undone, and it
                    will disappear from their own list of applications too.
                  </label>
                  <input
                    id="anon-confirm"
                    className={`${input} mt-1.5 max-w-xs`}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      tone="danger"
                      busy={busy}
                      disabled={typed.trim().toUpperCase() !== "ANONYMISE"}
                      onClick={() => run(row.candidate_id)}
                    >
                      {busy ? "Working…" : "Anonymise permanently"}
                    </Button>
                    <Button
                      busy={busy}
                      onClick={() => {
                        setConfirming(null);
                        setTyped("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <Button
                    tone="danger"
                    onClick={() => {
                      setConfirming(row.candidate_id);
                      setTyped("");
                      setError(null);
                    }}
                  >
                    Anonymise
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function AdminData() {
  return (
    <>
      <Companies />
      <Orphans />
      <Anonymise />
    </>
  );
}

export default AdminData;
