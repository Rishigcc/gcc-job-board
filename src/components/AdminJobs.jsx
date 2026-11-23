import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminJobs, setJobHidden } from "../lib/adminData";
import { jobDisplayStatus } from "../lib/jobOptions";
import { Panel, Pill, Button, Notice } from "./AdminShared";
import { input, shortDate } from "../lib/adminFormat";

// ===========================================================================
// Hiding and unhiding roles.
//
// WHAT HIDING ACTUALLY DOES, which is more than it sounds:
//   'hidden' is excluded from private.job_is_public(), so the role leaves the
//   public board. It is ALSO excluded from the recruiter's own update policy
//   on both sides, so the poster can no longer edit it, close it or reopen
//   it. They can still see it on My jobs, with a red panel telling them to
//   write in. Only this page can put it back.
//
//   So hiding is the strongest action on this page that is still reversible,
//   and it takes something away from someone who is not told why. The button
//   says so.
//
// UNHIDING DOES NOT REVIVE AN EXPIRED ROLE. Expiry is derived from
// expires_at at read time, so a role past its date stays invisible whatever
// its status column says -- unhiding must not silently extend a posting.
// ===========================================================================

function AdminJobs() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "loading" });

  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetchAdminJobs(query).then((result) => {
      if (!active) return;
      if (result.error) setState({ status: "error", error: result.error });
      else setState({ status: "ready", rows: result.rows });
    });

    return () => {
      active = false;
    };
  }, [query, reloadKey]);

  const toggle = useCallback(async (jobId, hidden) => {
    setBusy(jobId);
    setError(null);
    setMessage(null);

    const result = await setJobHidden(jobId, hidden);

    if (result.error) {
      setError(result.error);
      setBusy(null);
      return;
    }

    setMessage(result.message);
    setReloadKey((k) => k + 1);
    setBusy(null);
  }, []);

  return (
    <Panel
      title="Roles"
      note="Hiding takes a role off the public board and also stops its poster editing, closing or reopening it — only this page can put it back. Unhiding does not extend an expired role."
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
          placeholder="Search titles…"
          aria-label="Search role titles"
        />
        <Button type="submit" tone="plain">Search</Button>
        {query ? (
          <Button
            onClick={() => {
              setSearch("");
              setQuery("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <Notice error={error} message={message} />

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : state.status === "error" ? (
        <Notice error={state.error} />
      ) : state.rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          {query ? "No roles match that." : "No roles posted yet."}
        </p>
      ) : (
        <ul className="mt-2">
          {state.rows.map((job) => {
            const hidden = job.status === "hidden";
            // jobDisplayStatus is the same derivation the recruiter and public
            // pages use, so this column can never disagree with them.
            const display = jobDisplayStatus(job);

            return (
              <li key={job.id} className="border-b border-slate-200 py-3 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-sm font-bold text-slate-900">
                        {job.title}
                      </h3>
                      <Pill tone={hidden ? "risk" : display.key === "live" ? "good" : "muted"}>
                        {display.label}
                      </Pill>
                    </div>

                    <p className="mt-1 text-xs text-slate-600">
                      {job.companies?.name || "Company removed"} · {job.city} · posted{" "}
                      {shortDate(job.published_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {/* Only worth offering while the role is actually
                        reachable. A link to a hidden or expired role lands on
                        "no longer open", which is confusing from an admin
                        page that is showing it to you. */}
                    {display.key === "live" ? (
                      <Link
                        to={`/gcc-jobs/${job.slug}-${job.id}`}
                        /* So the job page offers a way back to the Roles tab.
                           Router state, so a reload or a shared link shows the
                           public behaviour and never offers a stranger a route
                           to /admin. */
                        state={{ from: "admin" }}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </Link>
                    ) : null}

                    <Button
                      tone={hidden ? "plain" : "danger"}
                      busy={busy === job.id}
                      onClick={() => toggle(job.id, !hidden)}
                      title={
                        hidden
                          ? "Returns the role to live, unless it has passed its closing date."
                          : "Removes it from the public board and locks its poster out of editing it."
                      }
                    >
                      {hidden ? "Unhide" : "Hide"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default AdminJobs;
