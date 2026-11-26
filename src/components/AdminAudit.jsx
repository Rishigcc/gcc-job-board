import { useEffect, useState } from "react";
import { fetchAuditLog, fetchAuditCount, AUDIT_PAGE_SIZE } from "../lib/adminData";
import { Panel, Pill, Button, Notice } from "./AdminShared";
import { shortDate, auditActionLabel } from "../lib/adminFormat";

// ===========================================================================
// The audit log.
//
// VISIBLE, AND READ-ONLY BY CONSTRUCTION.
//   Rishi chose visible over query-only for a reason worth recording: the
//   audit log is what you reach for straight after a mistake, and that is the
//   worst possible moment to be writing SQL. The cost is a page; the benefit
//   is not needing the SQL editor to run your own site.
//
//   Read-only is not a UI decision either. public.admin_audit has an admin
//   SELECT policy, a select-only grant, no insert policy and no insert grant.
//   Rows exist only because private.audit() wrote them from inside an action
//   function, in the same transaction as the change itself.
//
// EVERY ROW SAYS WHETHER IT CAN BE UNDONE, because "reversible" was a
// decision and three of the actions cannot honour it. A row marked Final is
// telling you not to go looking for a way back.
//
// NOTHING IS EVER PRUNED, so this pages instead. Rishi's position, and the
// right one: an audit log that expires stops being evidence, and the Final
// rows -- anonymise, orphan delete -- are exactly what would be needed to show
// a deletion request was honoured a year later. The first version read a flat
// 100 rows, which would have silently stopped showing history on the day the
// log passed 100 and looked like the whole truth while doing it.
// ===========================================================================



function AdminAudit({ userId }) {
  const [state, setState] = useState({ status: "loading" });
  const [total, setTotal] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([fetchAuditLog(), fetchAuditCount()]).then(([page, counted]) => {
      if (!active) return;
      if (page.error) setState({ status: "error", error: page.error });
      else setState({ status: "ready", rows: page.rows, hasMore: page.hasMore });
      setTotal(counted.count ?? null);
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const loadMore = async () => {
    if (state.status !== "ready" || state.rows.length === 0) return;

    setLoadingMore(true);

    const last = state.rows[state.rows.length - 1];
    const page = await fetchAuditLog({ before: last.id });

    if (page.error) {
      setState((prev) => ({ ...prev, error: page.error }));
      setLoadingMore(false);
      return;
    }

    setState((prev) => ({
      ...prev,
      rows: [...prev.rows, ...page.rows],
      hasMore: page.hasMore,
    }));
    setLoadingMore(false);
  };

  const actor = (row) => {
    if (!row.actor_id) return "System (scheduled)";
    if (row.actor_id === userId) return "You";
    // Another admin. There is one today, and resolving a uuid to a name would
    // mean reading auth.users, which no client role can do.
    return `Admin ${row.actor_id.slice(0, 8)}`;
  };

  return (
    <Panel
      title="Audit log"
      note="Every admin action, newest first. Written by the same database function that performs the change, so nothing here can be skipped by a page that forgot to log it. Read-only — there is no write path to this table for any role."
    >
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => setReloadKey((k) => k + 1)}>Refresh</Button>

        {state.status === "ready" && total !== null ? (
          <span className="text-xs text-slate-500">
            Showing {state.rows.length} of {total}
            {total === 1 ? " entry" : " entries"}
          </span>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : state.status === "error" ? (
        <Notice error={state.error} />
      ) : state.rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          Nothing yet. The first entry appears the first time an action on this
          page changes something.
        </p>
      ) : (
        <ul className="mt-2">
          {state.rows.map((row) => (
            <li key={row.id} className="border-b border-slate-200 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {auditActionLabel(row.action)}
                </span>
                <Pill tone={row.reversible ? "muted" : "risk"}>
                  {row.reversible ? "Reversible" : "Final"}
                </Pill>
              </div>

              <p className="mt-1 break-words text-sm text-slate-700">{row.summary}</p>

              <p className="mt-1 text-xs text-slate-500">
                {shortDate(row.created_at)} · {actor(row)} · {row.target_type}{" "}
                <span className="font-mono">{row.target_id}</span>
              </p>

              {/* The previous value, so a reversible action can be put back
                  without guessing what it was. This is what "reversible"
                  means here -- an inverse exists and the old value is
                  recorded -- rather than a generic undo button. */}
              {row.reversible && row.before ? (
                <p className="mt-1 font-mono text-xs text-slate-500">
                  was: {JSON.stringify(row.before)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {state.status === "ready" && state.error ? <Notice error={state.error} /> : null}

      {state.status === "ready" && state.hasMore ? (
        <div className="mt-4">
          <Button busy={loadingMore} onClick={loadMore}>
            {loadingMore ? "Loading…" : `Load ${AUDIT_PAGE_SIZE} more`}
          </Button>
        </div>
      ) : null}

      {state.status === "ready" && !state.hasMore && state.rows.length > AUDIT_PAGE_SIZE ? (
        <p className="mt-4 text-xs text-slate-500">
          That is the whole log. Nothing here is ever deleted.
        </p>
      ) : null}
    </Panel>
  );
}

export default AdminAudit;
