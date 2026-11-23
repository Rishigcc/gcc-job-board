import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import { fetchIsAdmin, fetchAdminCounts } from "../lib/adminData";
import AdminRecruiters from "../components/AdminRecruiters";
import AdminJobs from "../components/AdminJobs";
import AdminData from "../components/AdminData";
import AdminAudit from "../components/AdminAudit";
import AdminReports from "../components/AdminReports";

// ===========================================================================
// /admin
//
// AN ACTION QUEUE, NOT A DASHBOARD. Two numbers, plain tables, buttons that
// say what they do. Nothing here is a chart, because nothing here is for
// browsing -- every panel exists because something needs deciding.
//
// NOT LINKED FROM ANYWHERE. Rishi's decision: URL-only. A non-admin who
// guesses the path gets "Page not found", not "you are not allowed" -- the
// second confirms the route exists, and there is nothing to gain from telling
// someone they have found the admin page.
//
//   The page being hidden is NOT the security, and must never be mistaken for
//   it. Every action is a SECURITY DEFINER function that checks
//   private.is_admin() in the database, and the two endpoints verify the
//   bearer token with the service key and read the admin row with it. This
//   component rendering or not rendering changes nothing about what a request
//   can do.
// ===========================================================================

const TABS = [
  { key: "queue", label: "Recruiters" },
  { key: "jobs", label: "Roles" },
  { key: "data", label: "Data" },
  { key: "reports", label: "Reports" },
  { key: "audit", label: "Audit log" },
];

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo title="Admin — iWorkAtGCC" description="Administration." path="/admin" noindex />
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
      <Footer />
    </div>
  );
}

function Number({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-3xl font-bold text-slate-900">
        {value === null ? "—" : value}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function Admin() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: "loading" });
  const [counts, setCounts] = useState({ awaitingVerification: null, applicationsLast7Days: null });

  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "queue";

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user || null;

      if (!user) {
        if (active) setState({ status: "denied" });
        return;
      }

      const admin = await fetchIsAdmin(user.id);

      if (!active) return;

      if (!admin) {
        setState({ status: "denied" });
        return;
      }

      setState({ status: "ready", userId: user.id });

      const loaded = await fetchAdminCounts();
      if (active) setCounts(loaded);
    });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="mt-8 text-slate-500">Loading…</p>
      </Shell>
    );
  }

  // Deliberately indistinguishable from a route that does not exist.
  if (state.status === "denied") {
    return (
      <Shell>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-xl font-bold text-slate-900">Page not found</h1>
          <p className="mt-2 text-slate-600">
            That address does not match anything on iWorkAtGCC.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Admin
      </h1>
      <p className="mt-1.5 text-slate-600">
        Actions that need a person. Everything here is recorded in the audit
        log, including the things that cannot be undone.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Number
          label="Recruiters awaiting verification"
          value={counts.awaitingVerification}
          note="Work queued for you. Until verified they see counts and dates only."
        />
        <Number
          label="Applications in the last 7 days"
          value={counts.applicationsLast7Days}
          note="Whether the board is actually being used."
        />
      </div>

      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              const merged = new URLSearchParams(params);
              if (t.key === "queue") merged.delete("tab");
              else merged.set("tab", t.key);
              setParams(merged, { replace: true });
            }}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold transition " +
              (tab === t.key
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "queue" ? <AdminRecruiters /> : null}
      {tab === "jobs" ? <AdminJobs /> : null}
      {tab === "data" ? <AdminData /> : null}
      {tab === "reports" ? <AdminReports /> : null}
      {tab === "audit" ? <AdminAudit userId={state.userId} /> : null}
    </Shell>
  );
}

export default Admin;
