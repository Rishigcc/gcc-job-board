import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchReportTotals,
  fetchRoleStats,
  fetchRecruiterStats,
  fetchCandidateStats,
  fetchCandidateDetail,
} from "../lib/adminReports";
import { Panel, Pill, Button, Notice } from "./AdminShared";
import { shortDate } from "../lib/adminFormat";
import { statusLabel } from "../lib/applicationDisplay";
import {
  roleStatusLabel,
  workingDaysLabel,
  hoursLabel,
  promiseLabel,
  promiseTone,
  reconciliationLine,
  notMeasured,
} from "../lib/reportFormat";

// ===========================================================================
// /admin -> Reports
//
// Four views behind one tab, because five top-level tabs is too many.
//
// THE FIGURES COME FROM THE DATABASE, NOT FROM EACH OTHER. The Overview does
// not add up what the Roles view returned; it calls its own function. If it
// derived them, the two would eventually disagree and the disagreement would
// be the thing nobody could explain.
//
// AND THE CANDIDATE LIST CARRIES NO EMAIL ADDRESS. Not hidden in the browser
// -- absent from the response, because admin_candidate_stats() has no such
// column. Opening one person is a separate call and a deliberate act.
// ===========================================================================

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "roles", label: "Roles" },
  { key: "recruiters", label: "Recruiters" },
  { key: "candidates", label: "Candidates" },
];

function Figure({ label, value, note, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div
        className={
          "text-2xl font-bold " +
          (tone === "risk" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-slate-900")
        }
      >
        {value === null || value === undefined ? "—" : value}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-700">{label}</div>
      {note ? <div className="mt-0.5 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

function Table({ head, children }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------- overview
function Overview({ totals }) {
  if (!totals) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        {reconciliationLine(totals)}
      </p>

      <h3 className="mt-6 text-sm font-bold text-slate-900">Applications</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Total" value={totals.applications_total} note="Includes anonymised" />
        <Figure
          label="Nobody has actioned"
          value={totals.applications_unactioned}
          note="Excludes anonymised — nothing to act on"
          tone={totals.applications_unactioned > 0 ? "risk" : undefined}
        />
        <Figure label="Shortlisted" value={totals.applications_shortlisted} tone="good" />
        <Figure label="Not selected" value={totals.applications_not_selected} />
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-900">Roles</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Live" value={totals.roles_live} tone="good" />
        <Figure
          label="No applications yet"
          value={totals.roles_zero_applications}
          note="The recruiters who quietly leave"
          tone={totals.roles_zero_applications > 0 ? "risk" : undefined}
        />
        <Figure label="Closed" value={totals.roles_closed} />
        <Figure label="Expired" value={totals.roles_expired} />
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-900">
        Verification, against the two-working-day promise
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Weekends excluded, public holidays not modelled — so a holiday counts as
        a working day and this figure never flatters. Measured from the audit
        log, which starts when stage 9 shipped; anything verified before that
        reads as not measured rather than as zero.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Within the promise"
          value={totals.verification_within_promise}
          tone="good"
        />
        <Figure
          label="Over two working days"
          value={totals.verification_breached}
          tone={totals.verification_breached > 0 ? "risk" : undefined}
        />
        <Figure
          label="Median"
          value={notMeasured(totals.verification_median_working_days)
            ? null
            : workingDaysLabel(Number(totals.verification_median_working_days))}
        />
        <Figure
          label="Not measured"
          value={totals.verification_unmeasured}
          note="Verified before the audit log existed"
        />
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-900">Recruiters</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Awaiting verification"
          value={totals.recruiters_awaiting}
          tone={totals.recruiters_awaiting > 0 ? "risk" : undefined}
        />
        <Figure label="Verified" value={totals.recruiters_verified} tone="good" />
        <Figure
          label="At the 10-role cap"
          value={totals.recruiters_at_cap}
          note="Blocked from posting until verified"
          tone={totals.recruiters_at_cap > 0 ? "risk" : undefined}
        />
        <Figure label="Suspended" value={totals.recruiters_suspended} />
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-900">Data health</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Both of these should be zero. Either one above zero means something
        broke rather than something happened.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Figure
          label="Candidates with applications but no resume"
          value={totals.candidates_without_resume}
          tone={totals.candidates_without_resume > 0 ? "risk" : "good"}
        />
        <Figure
          label="Orphaned resume files"
          value={totals.orphaned_files}
          note="Also listed on the Data tab"
          tone={totals.orphaned_files > 0 ? "risk" : "good"}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- roles
function Roles({ rows }) {
  const [zeroOnly, setZeroOnly] = useState(false);

  if (!rows) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  const visible = zeroOnly ? rows.filter((r) => r.applications_total === 0) : rows;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => setZeroOnly((v) => !v)}>
          {zeroOnly ? "Show all roles" : "Only roles with no applications"}
        </Button>
        <span className="text-xs text-slate-500">
          {visible.length} of {rows.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-emerald-700">
          Every role has had at least one application.
        </p>
      ) : (
        <Table head={["Role", "Status", "Apps", "Unactioned", "Shortlisted", "Not selected", "Anon.", "First application"]}>
          {visible.map((r) => (
            <tr key={r.job_id} className="border-b border-slate-200 align-top">
              <td className="px-2 py-2">
                <div className="font-semibold text-slate-900">{r.title}</div>
                <div className="text-xs text-slate-500">
                  {r.company_name || "—"} · {r.city} · posted {shortDate(r.published_at)}
                </div>
              </td>
              <td className="px-2 py-2">
                <Pill tone={r.display_status === "live" ? "good" : r.display_status === "hidden" ? "risk" : "muted"}>
                  {roleStatusLabel(r.display_status)}
                </Pill>
              </td>
              <td className="px-2 py-2 font-semibold">{r.applications_total}</td>
              <td className={"px-2 py-2 " + (r.unactioned > 0 ? "font-semibold text-red-700" : "")}>
                {r.unactioned}
              </td>
              <td className="px-2 py-2">{r.shortlisted}</td>
              <td className="px-2 py-2">{r.not_selected}</td>
              <td className="px-2 py-2 text-slate-500">{r.anonymised}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                {r.applications_total === 0
                  ? "—"
                  : `${hoursLabel(r.hours_to_first_application)} after posting`}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

// ----------------------------------------------------------- recruiters
function Recruiters({ rows }) {
  if (!rows) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  return (
    <Table head={["Recruiter", "State", "Roles", "Applications", "Decided", "Verification took", "Last posted"]}>
      {rows.map((r) => (
        <tr key={r.user_id} className="border-b border-slate-200 align-top">
          <td className="px-2 py-2">
            <div className="font-semibold text-slate-900">{r.company_name}</div>
            <div className="text-xs text-slate-500">
              {r.recruiter_name} · @{r.email_domain}
            </div>
          </td>
          <td className="px-2 py-2">
            <div className="flex flex-wrap gap-1">
              {r.is_suspended ? <Pill tone="risk">Suspended</Pill> : null}
              {r.is_verified ? <Pill tone="good">Verified</Pill> : <Pill tone="wait">Awaiting</Pill>}
              {r.at_cap ? <Pill tone="risk">At cap</Pill> : null}
            </div>
          </td>
          <td className="px-2 py-2 text-xs">
            <div className="font-semibold text-slate-900">{r.roles_posted} posted</div>
            <div className="text-slate-500">
              {r.roles_live} live · {r.roles_closed} closed
              {r.roles_hidden > 0 ? ` · ${r.roles_hidden} hidden` : ""}
              {r.roles_expired > 0 ? ` · ${r.roles_expired} expired` : ""}
            </div>
          </td>
          <td className="px-2 py-2 text-xs">
            <div className="font-semibold text-slate-900">{r.applications_received} received</div>
            <div className={r.unactioned > 0 ? "font-semibold text-red-700" : "text-slate-500"}>
              {r.unactioned} unactioned
            </div>
          </td>
          <td className="px-2 py-2 text-xs text-slate-600">
            {r.shortlisted} shortlisted
            <br />
            {r.not_selected} not selected
          </td>
          <td className="px-2 py-2 text-xs">
            <Pill tone={promiseTone(r.verified_within_promise)}>
              {promiseLabel(r.verified_within_promise)}
            </Pill>
            <div className="mt-1 text-slate-500">
              {workingDaysLabel(r.working_days_to_verification)}
              {notMeasured(r.hours_to_verification) ? "" : ` · ${hoursLabel(r.hours_to_verification)}`}
            </div>
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
            {r.last_posted_at ? shortDate(r.last_posted_at) : "never"}
          </td>
        </tr>
      ))}
    </Table>
  );
}

// ----------------------------------------------------------- candidates
function Candidates({ rows, totals }) {
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  const openCandidate = async (candidateId) => {
    setOpen(candidateId);
    setDetail(null);
    setError(null);

    const result = await fetchCandidateDetail(candidateId);

    if (result.error) {
      setError(result.error);
      return;
    }

    setDetail(result.rows);
  };

  if (!rows) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        {reconciliationLine(totals)}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        No email addresses here. Open a candidate to see how to contact them —
        which is a separate request, so a list of everyone's contact details is
        never on screen at once.
      </p>

      <Notice error={error} />

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No candidates with applications that can still be attributed to
          someone. If applications exist, they have all been anonymised.
        </p>
      ) : (
        <Table head={["Candidate", "Roles applied to", "Shortlisted", "Not selected", "First", "Last", ""]}>
          {rows.map((c) => (
            <tr key={c.candidate_id} className="border-b border-slate-200 align-top">
              <td className="px-2 py-2">
                <div className="font-semibold text-slate-900">{c.full_name || "—"}</div>
                {c.has_resume ? null : (
                  <div className="text-xs font-semibold text-red-700">No resume on file</div>
                )}
              </td>
              <td className="px-2 py-2 font-semibold">{c.roles_applied}</td>
              <td className="px-2 py-2">{c.shortlisted}</td>
              <td className="px-2 py-2">{c.not_selected}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                {shortDate(c.first_applied_at)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                {shortDate(c.last_applied_at)}
              </td>
              <td className="px-2 py-2">
                <Button onClick={() => openCandidate(c.candidate_id)}>
                  {open === c.candidate_id ? "Open" : "Open"}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {open ? (
        <div className="mt-5 rounded-xl border border-slate-300 bg-slate-50 p-4">
          {detail === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : detail.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing to show for that candidate.</p>
          ) : (
            <>
              <h3 className="text-base font-bold text-slate-900">{detail[0].full_name}</h3>
              <p className="mt-1 break-words text-sm text-slate-700">
                <a href={`mailto:${detail[0].email}`} className="font-medium text-blue-700 hover:underline">
                  {detail[0].email}
                </a>
                {detail[0].phone ? <> · {detail[0].phone}</> : null}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Resume updated {detail[0].resume_updated_at ? shortDate(detail[0].resume_updated_at) : "— none on file"}
              </p>

              <ul className="mt-3 space-y-1">
                {detail.map((d) => (
                  <li key={d.application_id} className="text-sm text-slate-700">
                    <strong>{d.job_title}</strong> · {d.company_name || "—"} ·{" "}
                    {shortDate(d.applied_at)} · {statusLabel(d.status)}
                  </li>
                ))}
              </ul>

              <div className="mt-3">
                <Button onClick={() => { setOpen(null); setDetail(null); }}>Close</Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

function AdminReports() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: "loading" });

  const view = VIEWS.some((v) => v.key === params.get("view")) ? params.get("view") : "overview";

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchReportTotals(),
      fetchRoleStats(),
      fetchRecruiterStats(),
      fetchCandidateStats(),
    ]).then(([totals, roles, recruiters, candidates]) => {
      if (!active) return;

      const failed = [totals, roles, recruiters, candidates].find((r) => r.error);
      if (failed) {
        setState({ status: "error", error: failed.error });
        return;
      }

      setState({
        status: "ready",
        totals: totals.totals,
        roles: roles.rows,
        recruiters: recruiters.rows,
        candidates: candidates.rows,
      });
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel
      title="Reports"
      note="Every figure comes from the database rather than from the other views, so two screens cannot disagree about the same number."
    >
      <nav className="mt-3 flex flex-wrap gap-2" aria-label="Report views">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              const merged = new URLSearchParams(params);
              merged.set("tab", "reports");
              if (v.key === "overview") merged.delete("view");
              else merged.set("view", v.key);
              setParams(merged, { replace: true });
            }}
            className={
              "rounded-full px-3 py-1.5 text-sm font-semibold transition " +
              (view === v.key
                ? "bg-slate-200 text-slate-900"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {v.label}
          </button>
        ))}
      </nav>

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : state.status === "error" ? (
        <Notice error={state.error} />
      ) : (
        <>
          {view === "overview" ? <Overview totals={state.totals} /> : null}
          {view === "roles" ? <Roles rows={state.roles} /> : null}
          {view === "recruiters" ? <Recruiters rows={state.recruiters} /> : null}
          {view === "candidates" ? (
            <Candidates rows={state.candidates} totals={state.totals} />
          ) : null}
        </>
      )}
    </Panel>
  );
}

export default AdminReports;
