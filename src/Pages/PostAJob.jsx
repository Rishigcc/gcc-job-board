import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isRecruiterUser } from "../lib/accountType";
import {
  isBlockedEmailDomain,
  BLOCKED_DOMAIN_MESSAGE,
} from "../lib/blockedEmailDomains";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

const MIN_PASSWORD_LENGTH = 10;

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <span className="mt-1.5 block text-sm text-red-700">{error}</span>
      )}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 " +
  "placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function normaliseWebsite(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return `https://${trimmed}`;
}

// `initialMode` exists so /recruiter/sign-in can render this page with the
// Sign in tab already open, 25 Nov 2026.
//
// WHY A PROP AND NOT A SECOND PAGE. The form, the free-provider block, the
// already-signed-in notice and the confirmation-sent state are all here and
// all needed by both entrances. A second page would be a copy of the one
// thing on the site that must not drift -- the account creation and sign-in
// path. The route decides which tab opens; everything below is shared.
//
// THE DEFECT THIS CLOSES. The tab used to be pure internal state, so EVERY
// link to this page opened on "Create account". A returning recruiter
// following a link labelled "Recruiter sign in" would have landed on a form
// asking them to make a second account -- worse than no link at all, which
// is what decided the route. Rishi: *"that's worse than no link."*
function PostAJob({ initialMode = "signup" }) {
  const [mode, setMode] = useState(initialMode === "signin" ? "signin" : "signup");
  const [session, setSession] = useState(undefined);

  // Sign-up form
  const [form, setForm] = useState({
    email: "",
    password: "",
    recruiterName: "",
    companyName: "",
    phone: "",
    website: "",
    terms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");

  // Sign-in form
  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendState, setResendState] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const validate = () => {
    const next = {};

    const email = form.email.trim().toLowerCase();
    if (!email) next.email = "Enter your work email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      next.email = "That doesn't look like an email address.";
    else if (isBlockedEmailDomain(email)) next.email = BLOCKED_DOMAIN_MESSAGE;

    if (!form.password) next.password = "Choose a password.";
    else if (form.password.length < MIN_PASSWORD_LENGTH)
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

    if (!form.recruiterName.trim()) next.recruiterName = "Enter your name.";
    if (!form.companyName.trim())
      next.companyName = "Enter the name of your company.";

    const digits = form.phone.replace(/\D/g, "");
    if (!form.phone.trim()) next.phone = "Enter a phone number.";
    else if (digits.length < 8 || digits.length > 15)
      next.phone = "Enter a phone number we can actually reach you on.";

    if (!form.website.trim())
      next.website = "Enter your company website — we use it to verify you.";
    else if (!/\./.test(form.website))
      next.website = "That doesn't look like a website address.";

    if (!form.terms)
      next.terms = "Please accept the recruiter terms to continue.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);

    const email = form.email.trim().toLowerCase();

    // emailRedirectTo is passed explicitly rather than relying on the
    // project's Site URL, so the confirmation link lands on whichever host
    // the recruiter signed up from -- production, a preview, or localhost.
    const { error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/recruiter`,
        data: {
          account_type: "recruiter",
          recruiter_name: form.recruiterName.trim(),
          company_name: form.companyName.trim(),
          phone: form.phone.trim(),
          website: normaliseWebsite(form.website),
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });

    setSubmitting(false);

    if (error) {
      setErrors({ form: error.message });
      return;
    }

    // Deliberately the same message whether or not the address already has an
    // account, so this form cannot be used to find out who is registered.
    setSentTo(email);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError("");
    setNeedsConfirmation(false);
    setResendState("");

    const { error } = await supabase.auth.signInWithPassword({
      email: signIn.email.trim().toLowerCase(),
      password: signIn.password,
    });

    if (error) {
      if (/not confirmed/i.test(error.message)) {
        setNeedsConfirmation(true);
        setSignInError(
          "This account hasn't been confirmed yet. Use the link in the email we sent you."
        );
      } else {
        setSignInError("That email and password don't match an account.");
      }
      return;
    }

    window.location.assign("/recruiter");
  };

  // Resends the SAME signup confirmation email. Not a new kind of email.
  const handleResend = async () => {
    setResendState("sending");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: signIn.email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/recruiter` },
    });

    setResendState(error ? "failed" : "sent");
  };

  const alreadyRecruiter = Boolean(session) && isRecruiterUser(session.user);

  // DECISION 29, Rishi, 24 Nov 2026. Signed in, but as a community member.
  //
  // Nobody could reach this page by accident until now -- it was linked from
  // nowhere a candidate could see. The /gcc-jobs empty state links to it on
  // purpose ("Are you a recruiter or GCC leader?"), which means a signed-in
  // member can now land on a sign-up form while already holding a session.
  // Filling it in would open a second account on a different email and
  // replace the session they arrived with.
  //
  // The form is left available, because a community member genuinely may be
  // a GCC leader who wants to post. It is just no longer silent about what
  // is about to happen.
  const signedInAsCandidate = Boolean(session) && !alreadyRecruiter;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* The head follows the route, not the component. Reached at
          /recruiter/sign-in this is a sign-in page and says so; reached at
          /post-a-job it is the pitch. One canonical path each, or the two
          routes would compete for the same one. The sign-in route is
          noindex: it is an entrance for people who already have an account,
          and nothing about it belongs in a search result. */}
      {initialMode === "signin" ? (
        <Seo
          title="Recruiter Sign In — iWorkAtGCC"
          description="Sign in to your iWorkAtGCC recruiter account to post roles and see who applied."
          path="/recruiter/sign-in"
          noindex
        />
      ) : (
        <Seo
          title="Post a GCC Job — iWorkAtGCC"
          description="Post a role directly to professionals working at India's Global Capability Centres. Free to post, live immediately, and candidates apply with a resume."
          path="/post-a-job"
        />
      )}

      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(360px,420px)] lg:gap-12">

          {/* ---------- Pitch ---------- */}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {initialMode === "signin"
                ? "Sign in to your recruiter account"
                : "Post a role to India's GCC community"}
            </h1>

            <p className="mt-4 text-[17px] leading-relaxed text-slate-700">
              {initialMode === "signin"
                ? "Your recruiter account is separate from a community account — they are two separate logins. Sign in on the right to post roles and see who applied."
                : "iWorkAtGCC is a community of professionals working at Global Capability Centres in India. Post a role here and it reaches them directly."}
            </p>

            <ul className="mt-6 space-y-3 text-[15px] text-slate-700">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-blue-600">—</span>
                <span>
                  <strong className="font-semibold text-slate-900">
                    Free to post.
                  </strong>{" "}
                  No charge to post a role or to receive applications.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-blue-600">—</span>
                <span>
                  <strong className="font-semibold text-slate-900">
                    Live immediately.
                  </strong>{" "}
                  No review queue and no waiting. Your role is visible as soon
                  as you post it, and stays live for 30 days.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-blue-600">—</span>
                <span>
                  <strong className="font-semibold text-slate-900">
                    Candidates apply with a resume.
                  </strong>{" "}
                  Everything stays in one place — they apply on the site and
                  can track every application they've made.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-blue-600">—</span>
                <span>
                  <strong className="font-semibold text-slate-900">
                    We verify companies before releasing applicant details.
                  </strong>{" "}
                  You can post and collect applications right away. To see who
                  applied, we need to verify your account first — it takes two
                  working days.
                </span>
              </li>
            </ul>

            <p className="mt-8 rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              <strong className="font-semibold text-slate-900">
                We never charge candidates.
              </strong>{" "}
              Not to browse, not to apply, not for anything. Roles that ask a
              candidate for money are removed and the account suspended. See
              our <Link to="/recruiter-terms" className="text-blue-600 underline">recruiter terms</Link>.
            </p>
          </div>

          {/* ---------- Forms ---------- */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

            {signedInAsCandidate ? (
              <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm text-slate-800">
                  <strong className="font-semibold">
                    You're signed in as a community member.
                  </strong>{" "}
                  Recruiter accounts are separate, so posting a role means
                  creating one below with your work email — and that will sign
                  you out of your community account on this device.
                </p>
              </div>
            ) : null}

            {alreadyRecruiter ? (
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  You're signed in
                </h2>
                <p className="mt-2 text-[15px] text-slate-700">
                  Your recruiter account is ready.
                </p>
                <Link
                  to="/recruiter"
                  className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Go to your dashboard
                </Link>
              </div>
            ) : sentTo ? (
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Check your inbox
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
                  If that address can be registered, we've sent a confirmation
                  link to <strong className="font-semibold">{sentTo}</strong>.
                  Click it and you can start posting.
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Nothing after a few minutes? Check your spam folder, then
                  email{" "}
                  <a href="mailto:jobs@iworkatgcc.com" className="text-blue-600 underline">
                    jobs@iworkatgcc.com
                  </a>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSentTo("");
                    setMode("signin");
                  }}
                  className="mt-5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  Already confirmed? Sign in
                </button>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div
                  role="tablist"
                  aria-label="Recruiter account"
                  className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1"
                >
                  {[
                    ["signup", "Create account"],
                    ["signin", "Sign in"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      id={`tab-${key}`}
                      role="tab"
                      type="button"
                      aria-selected={mode === key}
                      onClick={() => setMode(key)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                        mode === key
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mode === "signup" ? (
                  <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                    <Field
                      label="Work email"
                      hint="Your company address. Free providers aren't accepted."
                      error={errors.email}
                    >
                      <input
                        id="recruiter-email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={set("email")}
                        className={inputClass}
                        placeholder="you@yourcompany.com"
                      />
                    </Field>

                    <Field
                      label="Password"
                      hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                      error={errors.password}
                    >
                      <div className="relative">
                        <input
                          id="recruiter-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.password}
                          onChange={set("password")}
                          className={`${inputClass} pr-16`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </Field>

                    <Field label="Your name" error={errors.recruiterName}>
                      <input
                        id="recruiter-name"
                        type="text"
                        autoComplete="name"
                        value={form.recruiterName}
                        onChange={set("recruiterName")}
                        className={inputClass}
                      />
                    </Field>

                    <Field
                      label="Your company"
                      hint="The company you work for. Shown to candidates who apply."
                      error={errors.companyName}
                    >
                      <input
                        id="recruiter-company"
                        type="text"
                        autoComplete="organization"
                        value={form.companyName}
                        onChange={set("companyName")}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Phone" error={errors.phone}>
                      <input
                        id="recruiter-phone"
                        type="tel"
                        autoComplete="tel"
                        value={form.phone}
                        onChange={set("phone")}
                        className={inputClass}
                        placeholder="+91 "
                      />
                    </Field>

                    <Field
                      label="Company website"
                      hint="We use this when we verify your account."
                      error={errors.website}
                    >
                      <input
                        id="recruiter-website"
                        type="text"
                        value={form.website}
                        onChange={set("website")}
                        className={inputClass}
                        placeholder="yourcompany.com"
                      />
                    </Field>

                    <div>
                      <label className="flex items-start gap-2.5">
                        <input
                          id="recruiter-terms"
                          type="checkbox"
                          checked={form.terms}
                          onChange={set("terms")}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">
                          I accept the{" "}
                          <Link to="/recruiter-terms" className="text-blue-600 underline">
                            recruiter terms
                          </Link>{" "}
                          and the{" "}
                          <Link to="/privacy" className="text-blue-600 underline">
                            privacy policy
                          </Link>
                          .
                        </span>
                      </label>
                      {errors.terms && (
                        <span className="mt-1.5 block text-sm text-red-700">
                          {errors.terms}
                        </span>
                      )}
                    </div>

                    {errors.form && (
                      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                        {errors.form}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {submitting ? "Creating account..." : "Create account"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                    <Field label="Work email">
                      <input
                        id="signin-email"
                        type="email"
                        autoComplete="email"
                        value={signIn.email}
                        onChange={(e) =>
                          setSignIn((s) => ({ ...s, email: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Password">
                      <div className="relative">
                        <input
                          id="signin-password"
                          type={showSignInPassword ? "text" : "password"}
                          autoComplete="current-password"
                          value={signIn.password}
                          onChange={(e) =>
                            setSignIn((s) => ({ ...s, password: e.target.value }))
                          }
                          className={`${inputClass} pr-16`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignInPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          {showSignInPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </Field>

                    {signInError && (
                      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                        {signInError}
                      </p>
                    )}

                    {needsConfirmation && (
                      <div className="rounded-lg bg-slate-50 p-3">
                        {resendState === "sent" ? (
                          <p className="text-sm text-slate-700">
                            Sent again. Check your inbox and your spam folder.
                          </p>
                        ) : resendState === "failed" ? (
                          <p className="text-sm text-red-800">
                            We couldn't resend it. Email jobs@iworkatgcc.com.
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendState === "sending"}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-60"
                          >
                            {resendState === "sending"
                              ? "Sending..."
                              : "Send the confirmation email again"}
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Sign in
                    </button>

                    {/* THE ONLY WAY ANYONE FINDS THE RESET. Without this
                        line the whole flow is a page nobody can reach, which
                        is the failure mode of every forgotten-password
                        feature ever shipped behind a URL. */}
                    <p className="text-center text-sm">
                      <Link
                        to="/recruiter/forgot-password"
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </p>

                    <p className="text-xs text-slate-500">
                      This is the recruiter sign-in. Community members sign in
                      with Google from{" "}
                      <Link to="/signup" className="text-blue-600 underline">
                        the community page
                      </Link>
                      .
                    </p>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default PostAJob;
