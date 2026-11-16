import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { RecruiterContext } from "../lib/useRecruiter";
import SiteHeader from "./SiteHeader";
import Footer from "./Footer";

// Wraps every recruiter screen. It does three things before rendering
// children, in this order:
//
//   1. Proves there is a session. Because "Confirm email" is on in Supabase
//      Auth, signUp returns no session at all, so holding one already implies
//      the confirmation link was clicked. Checked explicitly anyway.
//   2. Finds the recruiter_profiles row, or creates it.
//   3. Puts the row in context so the pages below never fetch it again.
//
// Step 2 exists because of the order the signup flow forces on us: the RLS
// policy on recruiter_profiles requires auth.uid() = user_id, and there is no
// session until the email is confirmed. So the form stashes its fields in the
// user's auth metadata at signUp, and the row is written here, on the first
// visit after confirming.
function RecruiterRoute({ children }) {
  const location = useLocation();

  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        setState({ status: "no-session" });
        return;
      }

      const user = session.user;

      if (!user.email_confirmed_at) {
        setState({ status: "unconfirmed" });
        return;
      }

      const { data: existing, error: readError } = await supabase
        .from("recruiter_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (readError) {
        setState({ status: "error", message: readError.message });
        return;
      }

      if (existing) {
        setState({ status: "ready", profile: existing, user });
        return;
      }

      // No row yet. Build it from what the signup form stashed in metadata.
      const meta = user.user_metadata || {};

      if (meta.account_type !== "recruiter") {
        // A community member who wandered in. Not an error — one person is
        // allowed to be both a candidate and a recruiter.
        setState({ status: "not-a-recruiter" });
        return;
      }

      const { data: created, error: insertError } = await supabase
        .from("recruiter_profiles")
        .insert({
          user_id: user.id,
          recruiter_name: meta.recruiter_name || "",
          company_name: meta.company_name || "",
          website: meta.website || null,
          phone: meta.phone || null,
        })
        .select("*")
        .single();

      if (!active) return;

      if (insertError) {
        // The database trigger raises a readable message for a blocked email
        // domain, so show whatever it said rather than a generic failure.
        setState({ status: "error", message: insertError.message });
        return;
      }

      setState({ status: "ready", profile: created, user });
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (state.status === "no-session") {
    return <Navigate to="/post-a-job" replace state={{ from: location.pathname }} />;
  }

  if (state.status === "ready") {
    return (
      <RecruiterContext.Provider value={state}>
        {children}
      </RecruiterContext.Provider>
    );
  }

  const copy = {
    unconfirmed: {
      heading: "Confirm your email first",
      body:
        "We sent a confirmation link when you created your account. Click it, " +
        "then come back here. If it hasn't arrived, check your spam folder.",
    },
    "not-a-recruiter": {
      heading: "This area is for recruiters",
      body:
        "You're signed in with a community account. Recruiter accounts are " +
        "separate and are created with a work email address.",
    },
    error: {
      heading: "We couldn't open your recruiter account",
      body: state.message,
    },
  }[state.status];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{copy.heading}</h1>

          <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
            {copy.body}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/post-a-job"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Go to Post a Job
            </Link>

            <a
              href="mailto:jobs@iworkatgcc.com"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Email jobs@iworkatgcc.com
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default RecruiterRoute;
