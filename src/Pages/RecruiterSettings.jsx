import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/settings — what we hold about this recruiter, and the one thing
// they can change about it: their password.
//
// Inside RecruiterRoute, so the session, the recruiter_profiles row and the
// suspension state are already settled before this renders. The row arrives
// through context; this page re-reads nothing about the account.
//
// THREE FIELDS ARE DELIBERATELY READ-ONLY, decided 25 Nov 2026:
//
//   1. COMPANY NAME. There are two of them and they are not the same thing.
//      `recruiter_profiles.company_name` is what was typed at signup. The
//      name candidates see is `jobs.company_id -> companies.name`, and only
//      `admin_rename_company` can change that, because `companies.slug` is
//      immutable. An editable "company name" that silently changed neither
//      the postings nor the public page would be a trap, so both are shown,
//      labelled, and neither is editable.
//   2. LOGIN EMAIL. Editing it would trigger Supabase's "Change email
//      address" template — a THIRD transactional email, which the restated
//      one-email rule does not cover. Making it editable is a decision, not
//      a field.
//   3. VERIFICATION STATUS. It already lives on /recruiter with the
//      unverified explanation and the 10-role cap. W3's reconciliation rule
//      exists to stop the same fact appearing on two screens, so this links
//      there rather than restating it.
//
// There is deliberately NO link to a community profile. That line was
// drafted when one account could plausibly be both a candidate and a
// recruiter. It cannot: 0 of 2,656 accounts hold two identities, and
// `private.handle_new_recruiter()` blocks the free-email domains that 2,611
// of the Google accounts use. A recruiter who wants a community presence has
// a separate Google login for it.
// ===========================================================================

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A row of the read-only table. `hint` is for the one field that needs a
// sentence next to it rather than underneath the whole block.
function Field({ label, value, hint }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      {/* min-w-0 is the other half of break-words here: this is a flex child
          in the parent's column layout, and a flex item's min-width defaults
          to its min-content size, so break-words alone does nothing. A long
          unbroken website or company name overflows without it. */}
      <dd className="mt-1 min-w-0 break-words text-[15px] text-slate-900">
        {value || "—"}
      </dd>

      {hint ? (
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RecruiterSettings() {
  const { profile, user } = useRecruiter();

  // The company names their roles are actually listed under. Usually one,
  // but a recruiter may post for more than one hiring company, so this is a
  // list rather than a field. Read through RLS with the recruiter's own
  // token — no function, no endpoint.
  const [postedUnder, setPostedUnder] = useState(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("companies(name)")
        .eq("posted_by", user.id);

      if (!active) return;

      if (error) {
        // Not a page failure. This block is informational, so it goes quiet
        // rather than taking the password box down with it.
        setPostedUnder([]);
        return;
      }

      const names = [
        ...new Set((data || []).map((row) => row.companies?.name).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b));

      setPostedUnder(names);
    };

    run();
    return () => {
      active = false;
    };
  }, [user.id]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Settings — iWorkAtGCC"
        description="Your recruiter account details and password."
        path="/recruiter/settings"
        noindex
      />

      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Settings
        </h1>

        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          What we hold about your recruiter account. To correct anything on
          this page, email{" "}
          <a
            href="mailto:jobs@iworkatgcc.com"
            className="font-semibold text-blue-700 underline"
          >
            jobs@iworkatgcc.com
          </a>
          .
        </p>

        <h2 className="mt-8 text-base font-bold text-slate-900">
          Your account
        </h2>

        <dl className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Field label="Your name" value={profile.recruiter_name} />

          <Field
            label="Company name (from your signup)"
            value={profile.company_name}
            hint="This is the name you gave when you created the account. It is not what candidates see on your roles — that is below."
          />

          <Field
            label="Your roles are listed under"
            value={
              postedUnder === null
                ? "Loading…"
                : postedUnder.length === 0
                  ? "No roles posted yet"
                  : postedUnder.join(", ")
            }
            hint="The hiring company chosen on each role. We cannot change a company name here — email us and we will do it."
          />

          <Field label="Login email" value={user.email} />

          <Field label="Phone" value={profile.phone} />

          <Field label="Website" value={profile.website} />

          <Field label="Account created" value={formatDate(profile.created_at)} />
        </dl>

        {/* Verification is LINKED, not repeated. The full explanation, the
            two-working-day promise and the 10-role cap are all on /recruiter;
            duplicating the status here would put the same fact on two
            screens, which is what W3's reconciliation rule exists to stop. */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-[15px] leading-relaxed text-slate-700">
            Account verification, and what it changes about who you can see,
            is on your dashboard.
          </p>

          <Link
            to="/recruiter"
            className="mt-2 inline-block text-sm font-semibold text-blue-700 underline"
          >
            Go to my dashboard
          </Link>
        </div>

        <ChangePasswordBox email={user.email} />
      </main>

      <Footer />
    </div>
  );
}

// ===========================================================================
// The change-password box.
//
// IT VERIFIES THE CURRENT PASSWORD TWICE, ON PURPOSE. Do not remove the
// sign-in call as redundant — it is the half that is certain to run.
//
//   1. `signInWithPassword` with the current password. This is OUR check. It
//      either succeeds or returns "Invalid login credentials", and the
//      password is never touched unless it succeeded. It is the same user
//      signing in as the one already signed in, so the session it returns
//      replaces an equivalent one.
//   2. `updateUser({ current_password, password })`. `current_password` is a
//      real field on UserAttributes in supabase-js 2.112.3 — but auth-js's
//      own type comment says it is honoured only when
//      GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD is true,
//      which is a project-wide Supabase Auth setting and NOT something this
//      file can assert. If that setting is off, the field is accepted and
//      ignored.
//
// So sending `current_password` alone would be a gate that compiles, applies,
// and does nothing — the same shape of fault as `break-words` on a flex
// child. Step 1 makes the requirement true from the browser regardless of
// the dashboard; step 2 means the server enforces it as well the moment that
// setting is turned on. Neither is a substitute for the other.
//
// DELIBERATELY NOT USED: `supabase.auth.reauthenticate()`. It is Supabase's
// own answer to "prove it is really you before a password change", and it
// works by EMAILING A ONE-TIME CODE. That would be a third transactional
// email, which the one-email rule does not cover. The nonce field on
// updateUser is part of that same flow and is unused for the same reason.
//
// No email is sent by this box. The seven toggles under Authentication →
// Emails → Security are all off, "Password changed" among them, verified
// 25 Nov 2026.
// ===========================================================================

const PASSWORD_MIN = 8;

function ChangePasswordBox({ email }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    setError(null);
    setDone(false);

    // Checked here so an obvious mistake never reaches the network, and
    // checked again by Supabase, which owns the real password policy.
    if (!current) {
      setError("Enter your current password.");
      return;
    }

    if (next.length < PASSWORD_MIN) {
      setError(`Your new password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }

    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }

    if (next === current) {
      setError("Your new password is the same as your current one.");
      return;
    }

    setBusy(true);

    // STEP 1 — our own check. Nothing below runs if this fails.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });

    if (signInError) {
      setBusy(false);
      // Deliberately not the raw message. "Invalid login credentials" on a
      // page where the email is fixed and shown reads as though the account
      // is wrong, when the only thing that can be wrong is the password.
      setError("That is not your current password.");
      return;
    }

    // STEP 2 — the change, with current_password sent as well so the server
    // enforces it too wherever that setting is on.
    const { error: updateError } = await supabase.auth.updateUser({
      current_password: current,
      password: next,
    });

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  };

  return (
    <>
      <h2 className="mt-10 text-base font-bold text-slate-900">
        Change your password
      </h2>

      <form
        onSubmit={submit}
        className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <p className="text-[15px] leading-relaxed text-slate-600">
          You will stay signed in on this device. Any other device stays
          signed in too, so sign out there if you need to.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-semibold text-slate-800"
            >
              Current password
            </label>

            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-semibold text-slate-800"
            >
              New password
            </label>

            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />

            <p className="mt-1 text-[13px] text-slate-500">
              At least {PASSWORD_MIN} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-semibold text-slate-800"
            >
              New password again
            </label>

            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[15px] text-red-800"
          >
            {error}
          </p>
        ) : null}

        {done ? (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[15px] text-emerald-800"
          >
            Your password has been changed. Use the new one next time you sign
            in.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </>
  );
}

export default RecruiterSettings;
