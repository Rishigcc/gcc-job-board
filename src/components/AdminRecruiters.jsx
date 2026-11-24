import { useCallback, useEffect, useState } from "react";
import { fetchRecruiters, setRecruiterVerified, setRecruiterSuspended } from "../lib/adminData";
import { Panel, Pill, Button, Notice } from "./AdminShared";
import { shortDate } from "../lib/adminFormat";

// ===========================================================================
// Verifying and suspending recruiters.
//
// Both are REVERSIBLE, and the inverse is simply the other button -- which is
// why there is no undo mechanism here. The audit log records what the previous
// value was, so a mistake is visible and one click away from being put back.
//
// Each button says what it will DO, and the consequence is spelled out next
// to it rather than in a tooltip. Verifying hands a stranger other people's
// names, emails and resumes; suspending takes a recruiter's live roles off the
// public board. Neither is obvious from a word.
// ===========================================================================

function Recruiter({ row, busy, onVerify, onSuspend }) {
  return (
    <li className="border-b border-slate-200 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words text-base font-bold text-slate-900">
              {row.company_name}
            </h3>
            {row.is_suspended ? <Pill tone="risk">Suspended</Pill> : null}
            {row.is_verified ? (
              <Pill tone="good">Verified</Pill>
            ) : (
              <Pill tone="wait">Awaiting verification</Pill>
            )}
          </div>

          <p className="mt-1 break-words text-sm text-slate-700">
            {row.recruiter_name} · @{row.email_domain}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {row.jobs.total} role{row.jobs.total === 1 ? "" : "s"} posted ·{" "}
            {row.jobs.live} live
            {row.jobs.hidden > 0 ? ` · ${row.jobs.hidden} hidden` : ""} · joined{" "}
            {shortDate(row.created_at)}
          </p>

          {row.website || row.phone || row.gstin ? (
            <p className="mt-1.5 break-words text-xs text-slate-600">
              {row.website ? <>{row.website} · </> : null}
              {row.phone ? <>{row.phone} · </> : null}
              {row.gstin ? <>GSTIN {row.gstin}</> : <>no GSTIN on file</>}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              No website, phone or GSTIN on file — ask before verifying.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            tone={row.is_verified ? "plain" : "primary"}
            busy={busy}
            onClick={() => onVerify(row.user_id, !row.is_verified)}
            title={
              row.is_verified
                ? "Removes verification. Applicant details become hidden again and the 10-live-roles cap reapplies."
                : "Lets this account see applicant names, emails and resumes, and lifts the 10-live-roles cap."
            }
          >
            {row.is_verified ? "Remove verification" : "Verify"}
          </Button>

          <Button
            tone={row.is_suspended ? "plain" : "danger"}
            busy={busy}
            onClick={() => onSuspend(row.user_id, !row.is_suspended)}
            title={
              row.is_suspended
                ? "Their live roles reappear on the public board."
                : "Their live roles stop appearing publicly and they cannot post. Reversible."
            }
          >
            {row.is_suspended ? "Unsuspend" : "Suspend"}
          </Button>
        </div>
      </div>
    </li>
  );
}

function AdminRecruiters() {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetchRecruiters().then((result) => {
      if (!active) return;
      if (result.error) setState({ status: "error", error: result.error });
      else setState({ status: "ready", rows: result.rows });
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const run = useCallback(async (userId, fn) => {
    setBusy(userId);
    setError(null);
    setMessage(null);

    const result = await fn();

    if (result.error) {
      setError(result.error);
      setBusy(null);
      return;
    }

    setMessage(result.message);
    setReloadKey((k) => k + 1);
    setBusy(null);
  }, []);

  const onVerify = (userId, next) =>
    run(userId, () => setRecruiterVerified(userId, next));
  const onSuspend = (userId, next) =>
    run(userId, () => setRecruiterSuspended(userId, next));

  return (
    <Panel
      title="Recruiters"
      note="Verifying lets an account see applicant names, emails and resumes, and lifts the 10-live-roles cap. Suspending takes their live roles off the public board. Both are reversible, and both are recorded."
    >
      <Notice error={error} message={message} />

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : state.status === "error" ? (
        <Notice error={state.error} />
      ) : state.rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No recruiter accounts yet.</p>
      ) : (
        <ul className="mt-2">
          {state.rows.map((row) => (
            <Recruiter
              key={row.user_id}
              row={row}
              busy={busy === row.user_id}
              onVerify={onVerify}
              onSuspend={onSuspend}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default AdminRecruiters;
