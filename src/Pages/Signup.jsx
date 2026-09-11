import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { consumePostLoginRedirect } from "../lib/postLoginRedirect";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);
  const [mode, setMode] = useState(
    location.state?.mode === "signin" ? "signin" : "join"
  );

useEffect(() => {
  const checkSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session && !hasRedirected.current) {
      hasRedirected.current = true;
      const { path, state } = consumePostLoginRedirect();
      navigate(path || "/welcome", { replace: true, state });
    }
  };

  checkSession();
}, [navigate]);
  const [user, setUser] = useState(null);

useEffect(() => {
  const getUser = async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("Error getting user:", error);
      return;
    }

    setUser(data.user);

    if (data.user) {
      console.log("Logged in user:", data.user);
    }
  };

  getUser();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);

    if (session?.user) {
      console.log("Authenticated user:", session.user);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/signup`,
      },
    });

    if (error) {
      console.error("Google sign-in error:", error);
    }
  };

  const dotGridStyle = {
    backgroundImage:
      "radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)",
    backgroundSize: "20px 20px",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f8fc] text-slate-900">

      <Seo
        title="Sign In or Join | iWorkAtGCC"
        description="Sign in or create your iWorkAtGCC account."
        path="/signup"
        noindex
      />

      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-24 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -right-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-purple-200/25 blur-3xl" />
        <div
          className="absolute right-10 top-16 hidden h-32 w-44 opacity-40 sm:block"
          style={dotGridStyle}
        />
        <div
          className="absolute bottom-16 left-8 hidden h-28 w-36 opacity-30 sm:block"
          style={dotGridStyle}
        />
      </div>

      <div className="relative">

        <SiteHeader />

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 lg:pb-24 lg:pt-16">

          {/* Join / Sign in Card */}
          <section className="mx-auto w-full max-w-lg pb-12 sm:pb-14 lg:mx-0 lg:max-w-none lg:pb-0">

            <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-9 shadow-xl shadow-slate-200/70 sm:px-10 sm:py-11">

              {/* Title */}
              <div className="text-center">

                {mode === "join" ? (
                  <>
                    <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                      Join the iWorkAtGCC Community
                    </h1>

                    <p className="mt-3 text-sm text-slate-500 sm:text-base">
                      Create your account to join the community.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                      Sign In to iWorkAtGCC
                    </h1>

                    <p className="mt-3 text-sm text-slate-500 sm:text-base">
                      Sign in to your iWorkAtGCC account.
                    </p>
                  </>
                )}

              </div>


              {/* Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:text-base"
              >

                {/* Google Logo */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.35 12.27c0-.71-.06-1.4-.18-2.05H12v3.88h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.19Z"
                  />

                  <path
                    fill="#34A853"
                    d="M12 21.99c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.93-3.31.93-2.54 0-4.69-1.72-5.46-4.03H3.3v2.51A9.75 9.75 0 0 0 12 21.99Z"
                  />

                  <path
                    fill="#FBBC05"
                    d="M6.54 14.1a5.87 5.87 0 0 1 0-3.75V7.84H3.3a9.99 9.99 0 0 0 0 8.77l3.24-2.51Z"
                  />

                  <path
                    fill="#EA4335"
                    d="M12 6.32c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.4 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.7 5.34l3.24 2.51C7.31 8.04 9.46 6.32 12 6.32Z"
                  />
                </svg>

                Continue with Google

              </button>


              {/* Security Message */}
              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">

                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-slate-400"
                >
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  <circle cx="12" cy="15.5" r="1" />
                </svg>

                <span>
                  Your information is safe and secure.
                </span>

              </div>


              {/* Toggle join / sign in */}
              <p className="mt-5 text-center text-sm text-slate-600">
                {mode === "join" ? (
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Already a member? Sign in.
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode("join")}
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    New here? Join the community.
                  </button>
                )}
              </p>

            </div>

          </section>

          {/* Why Join */}
          <section className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">

            <div className="text-center lg:text-left">

              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Why Join the iWorkAtGCC Community?
              </h2>

              <p className="mt-3 text-base text-slate-500 sm:text-lg">
                Be part of a community that helps you grow and succeed.
              </p>

            </div>


            {/* Advantages */}
            <div className="mt-8 space-y-3 sm:mt-10 sm:space-y-4">


              {/* Advantage: Ask, Answer & Connect */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 shadow-md shadow-slate-200/50 sm:px-6 sm:py-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xl sm:h-12 sm:w-12">
                  👥
                </div>

                <div>
                  <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                    Ask, Answer & Connect
                  </h3>

                  <p className="mt-0.5 text-sm leading-5 text-slate-500 sm:text-base sm:leading-6">
                    Have a question about salaries, hike %, or your GCC career? Post a question to the community or join an existing conversation.
                  </p>
                </div>

              </div>


              {/* Advantage 1 */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 shadow-md shadow-slate-200/50 sm:px-6 sm:py-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl sm:h-12 sm:w-12">
                  🔔
                </div>

                <div>
                  <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                    Access To Latest GCC Jobs
                  </h3>

                  <p className="mt-0.5 text-sm leading-5 text-slate-500 sm:text-base sm:leading-6">
                    Get instantly notified when new GCC jobs go live. Get access to GCC jobs across Tech, Finance, Operations and more.
                  </p>
                </div>

              </div>


              {/* Advantage 2 */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 shadow-md shadow-slate-200/50 sm:px-6 sm:py-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-xl sm:h-12 sm:w-12">
                  📰
                </div>

                <div>
                  <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                    Access to Weekly GCC Newsletter
                  </h3>

                  <p className="mt-0.5 text-sm leading-5 text-slate-500 sm:text-base sm:leading-6">
                    Get weekly updates on the latest GCC news, trends, insights, and developments — delivered straight to you.
                  </p>
                </div>

              </div>


            </div>

          </section>

        </div>


        {/* Footer */}
        <Footer />

      </div>

    </div>
  );
}

export default Signup;
