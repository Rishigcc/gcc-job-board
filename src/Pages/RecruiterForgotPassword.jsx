import { useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/forgot-password — ask for a reset link.
//
// IT SAYS THE SAME THING WHATEVER HAPPENS, because the endpoint behind it
// does. Rishi, 24 Nov 2026: "I don't want this page to become a way of
// discovering which emails are registered here."
//
// So there is one success panel and it is shown for an eligible recruiter, a
// community member, an unknown address and a malformed one alike. The page
// cannot tell them apart -- api/password.js's "request" action returns the same
// bytes for all of them, by design and by test.
//
// THE SUCCESS PANEL NAMES THE OTHER PATH, and that sentence is load-bearing
// rather than helpful filler. A recruiter who signed up but never confirmed
// has no recruiter_profiles row, so no user_roles row, so the gate refuses
// them and NO EMAIL ARRIVES -- and the identical-reply rule means this page
// cannot tell them why. Without "signed up but never confirmed?" they are
// left waiting for a message that was never going to come. The endpoint
// cannot say it; the page must.
//
// WHY THE FORM DOES NOT VALIDATE THE ADDRESS BEYOND LOOKING LIKE ONE
// Refusing to submit "alice@" would be a different response for a different
// input, which is the thing being avoided. The browser's own type="email"
// hint is kept because it helps someone who mistyped, and the endpoint
// treats a malformed address exactly like an unknown one.
// ===========================================================================

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Forgot your recruiter password — iWorkAtGCC"
        description="Ask for a link to reset your iWorkAtGCC recruiter password."
        path="/recruiter/forgot-password"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">{children}</main>
      <Footer />
    </div>
  );
}

function RecruiterForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Enter the email address you signed up with.");
      return;
    }

    setBusy(true);

    try {
      // One function, two actions -- api/password.js. The action is
      // required: a missing one is a 400 rather than a silent no-op.
      const response = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email: email.trim() }),
      });

      // A 500 is OUR failure and is worth saying, because the person should
      // try again rather than wait for an email. Everything else -- which is
      // to say every outcome the endpoint actually decides -- is the same
      // success panel.
      if (response.status >= 500) {
        setError("Something went wrong at our end. Please try again.");
        setBusy(false);
        return;
      }

      setSent(true);
    } catch {
      setError("That could not be sent. Check your connection and try again.");
    }

    setBusy(false);
  };

  if (sent) {
    return (
      <Shell>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Check your inbox
          </h1>

          {/* THE WORDING IS CONDITIONAL AND THAT IS THE POINT. It does not
              say "we have sent you a link", because for most addresses typed
              into this box we have not. */}
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            If that email address has an iWorkAtGCC recruiter account, we have
            sent it a link to set a new password. The link works once and
            lasts an hour.
          </p>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Nothing after a few minutes? Check your spam folder. If you{" "}
            <strong className="font-semibold">signed up but never confirmed</strong>{" "}
            your email address, a reset will not reach you — use{" "}
            <Link to="/post-a-job" className="font-semibold text-blue-700 hover:underline">
              resend confirmation
            </Link>{" "}
            instead.
          </p>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Sign in to iWorkAtGCC with Google? Then you have no password to
            reset, and nothing will arrive.
          </p>

          <p className="mt-4 text-sm text-slate-600">
            Still stuck — email{" "}
            <a href="mailto:jobs@iworkatgcc.com" className="font-semibold text-blue-700 hover:underline">
              jobs@iworkatgcc.com
            </a>{" "}
            and a person will answer.
          </p>

          <Link
            to="/post-a-job"
            className="mt-5 inline-block rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Forgot your password
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enter the work email address you signed up with and we will send a
          link to set a new password. Your roles and applications are not
          affected.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Work email address
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="you@yourcompany.com"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
            {busy ? "Sending…" : "Send me a reset link"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Remembered it?{" "}
          <Link to="/post-a-job" className="font-semibold text-blue-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </Shell>
  );
}

export default RecruiterForgotPassword;
