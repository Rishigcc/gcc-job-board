import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/reset-password — where the link in the reset email lands.
//
// THE FLOW IS IMPLICIT, NOT PKCE, AND THAT IS LOAD-BEARING.
//   Checked in the installed @supabase/auth-js: `flowType` defaults to
//   'implicit', and neither src/lib/supabase.js nor the server client
//   overrides it. So Supabase redirects here with the tokens in the URL
//   fragment, and `detectSessionInUrl` (also on by default) consumes them
//   and establishes a session before React renders.
//
//   IT HAD TO BE IMPLICIT. The reset is initiated SERVER-SIDE by
//   api/password.js's "request" action, so under PKCE the verifier would
//   have been generated in a serverless function and thrown away -- the
//   recruiter's browser would never have had it, and the exchange here would
//   fail every time. Worth knowing before anyone "modernises" the client to
//   PKCE: that change breaks this page, and it breaks it silently, on a path
//   only a locked-out recruiter walks.
//
// WHY THERE IS NO "DID YOU ARRIVE BY LINK" CHECK
//   `onAuthStateChange` fires PASSWORD_RECOVERY for a recovery link, but
//   detectSessionInUrl runs when the client module is imported -- before
//   this component can subscribe -- so the event is a race we would lose on
//   some loads and win on others. Gating on it would break the real flow
//   intermittently.
//
//   And it would buy little: Supabase's own updateUser() accepts a password
//   change from ANY session, so a live session is already enough platform-
//   side. The compensating control is on the DELIBERATE path instead -- the
//   change-password box in /recruiter/settings requires the current
//   password. This page is the recovery path, where by definition the person
//   does not have it.
//
// THE ELIGIBILITY CHECK IS SERVER-SIDE, deliberately.
//   api/password.js's "may-set" action asks the same function its
//   "request" action asks, so the two cannot disagree. A client-side guess at the role would
//   be decoration.
//
//   What it protects is the realistic case: a community member who receives
//   an unexpected reset email, clicks it, and would otherwise be handed a
//   password field -- giving a Google account a second sign-in method nobody
//   asked for. It does not stop someone calling updateUser from the console;
//   that is Supabase's surface and is recorded as accepted.
// ===========================================================================

const MIN_PASSWORD_LENGTH = 10;

// Long enough for detectSessionInUrl to finish on a slow connection, short
// enough that a dead link does not look like a hung page.
const SESSION_GRACE_MS = 2500;

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Set a new password — iWorkAtGCC"
        description="Choose a new password for your iWorkAtGCC recruiter account."
        path="/recruiter/reset-password"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">{children}</main>
      <Footer />
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        {title}
      </h1>
      {children}
    </div>
  );
}

function RecruiterResetPassword() {
  const navigate = useNavigate();

  // "checking" -> "ready" | "no-session" | "not-allowed" | "error"
  const [state, setState] = useState("checking");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    // Asks the server about the session we have, never about an address.
    const decide = async (session) => {
      if (!active || settled.current) return;
      settled.current = true;

      try {
        // api/password.js, action "may-set". The bearer token is what it
        // answers about; there is no email in the request.
        const response = await fetch("/api/password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "may-set" }),
        });

        if (!active) return;

        if (!response.ok) {
          setState(response.status === 401 ? "no-session" : "error");
          return;
        }

        const body = await response.json();
        if (active) setState(body?.allowed ? "ready" : "not-allowed");
      } catch {
        if (active) setState("error");
      }
    };

    // The session may already be in place by the time this mounts, or may
    // land a moment later once the fragment is consumed. Both are covered:
    // whichever arrives first wins, and `settled` stops the second.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) decide(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) decide(session);
    });

    const timer = setTimeout(() => {
      if (active && !settled.current) setState("no-session");
    }, SESSION_GRACE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords are not the same.");
      return;
    }

    setBusy(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setBusy(false);

    if (updateError) {
      // The most common cause by far is an expired or already-used link, so
      // the message says that rather than quoting Supabase at a recruiter.
      setError(
        updateError.message?.toLowerCase().includes("session")
          ? "That link has expired or has already been used. Ask for a new one."
          : updateError.message
      );
      return;
    }

    setDone(true);
  };

  // ------------------------------------------------------------------ done
  if (done) {
    return (
      <Shell>
        <Card title="Your password is set">
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You are signed in. The old password no longer works, and the link
            in that email cannot be used again.
          </p>
          <button
            type="button"
            onClick={() => navigate("/recruiter")}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Go to your dashboard
          </button>
        </Card>
      </Shell>
    );
  }

  if (state === "checking") {
    return (
      <Shell>
        <Card title="Checking your link">
          <p className="mt-2 text-sm text-slate-500">One moment…</p>
        </Card>
      </Shell>
    );
  }

  // ------------------------------------------------- the link did not work
  if (state === "no-session") {
    return (
      <Shell>
        <Card title="That link has expired">
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Reset links work once and last an hour. Ask for a new one and use
            the most recent email — older links stop working as soon as a new
            one is sent.
          </p>
          <Link
            to="/recruiter/forgot-password"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Send a new link
          </Link>
          <p className="mt-4 text-sm text-slate-600">
            Signed up but never confirmed your email? A reset will not reach
            you — use{" "}
            <Link to="/post-a-job" className="font-semibold text-blue-700 hover:underline">
              resend confirmation
            </Link>{" "}
            instead.
          </p>
        </Card>
      </Shell>
    );
  }

  // --------------------------------------------- signed in, but not for this
  // The community member who clicked an unexpected email. Told plainly, and
  // offered nothing to type.
  if (state === "not-allowed") {
    return (
      <Shell>
        <Card title="This account has no password">
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You sign in to iWorkAtGCC with Google, so there is no password to
            reset and nothing here for you to set. Your account is unchanged.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            If you did not ask for a password email, you can ignore it. Nothing
            has happened to your account.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Back to iWorkAtGCC
          </Link>
        </Card>
      </Shell>
    );
  }

  if (state === "error") {
    return (
      <Shell>
        <Card title="Something went wrong at our end">
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your password has not been changed. Try the link again, and if it
            still fails, email{" "}
            <a href="mailto:jobs@iworkatgcc.com" className="font-semibold text-blue-700 hover:underline">
              jobs@iworkatgcc.com
            </a>
            .
          </p>
        </Card>
      </Shell>
    );
  }

  // ------------------------------------------------------------- the form
  return (
    <Shell>
      <Card title="Choose a new password">
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          At least {MIN_PASSWORD_LENGTH} characters. Once you save it, the old
          password stops working everywhere.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              New password
            </span>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Type it again
            </span>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={show}
              onChange={(event) => setShow(event.target.checked)}
            />
            Show what I am typing
          </label>

          {error ? (
            <p role="alert" className="break-words text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save my new password"}
          </button>
        </form>
      </Card>
    </Shell>
  );
}

export default RecruiterResetPassword;
