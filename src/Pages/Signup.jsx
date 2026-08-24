import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Footer from "../components/Footer";

function Signup() {
  const navigate = useNavigate();

useEffect(() => {
  const checkSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      navigate("/welcome", { replace: true });
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="mx-3 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:mx-5 sm:mt-5 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">

          <div className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            iWorkAtGCC
          </div>

          <button
            onClick={() => navigate("/")}
            className="shrink-0 rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 sm:px-7 sm:py-3 sm:text-lg"
          >
            🎓 &nbsp; Explore GCC Jobs
          </button>

        </div>
      </header>


      {/* Signup Card */}
      <section className="mx-auto max-w-lg px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">

          {/* Title */}
          <div className="text-center">

            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              Join the iWorkAtGCC
              <br />
              Community
            </h1>

            <p className="mt-3 text-sm text-slate-600 sm:text-base">
              Create your account to join the community.
            </p>

          </div>


          {/* Continue with Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:text-base"
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
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">

            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15.5" r="1" />
            </svg>

            <span>
              Your information is safe and secure.
            </span>

          </div>

        </div>

      </section>


      {/* Why Join */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24">

        <div className="text-center">

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
            Why Join the iWorkAtGCC Community?
          </h2>

          <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg">
            Be part of a community that helps you grow and succeed.
          </p>

        </div>


        {/* Advantages */}
        <div className="mt-8 grid gap-5 sm:mt-12 sm:gap-8 md:grid-cols-3">


          {/* Advantage 1 */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-10">

            <div className="flex items-center gap-4">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-2xl sm:h-14 sm:w-14">
                🔔
              </div>

              <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                Access To Latest GCC Jobs
              </h3>

            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 sm:mt-5 sm:text-base sm:leading-7">
              Get instantly notified when new GCC jobs go live. Get access to GCC jobs across Tech, Finance, Operations and more.
            </p>

          </div>


          {/* Advantage 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-10">

            <div className="flex items-center gap-4">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-2xl sm:h-14 sm:w-14">
                📰
              </div>

              <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                Access to Weekly GCC Newsletter
              </h3>

            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 sm:mt-5 sm:text-base sm:leading-7">
              Get weekly updates on the latest GCC news, trends, insights, and developments — delivered straight to you.
            </p>

          </div>


          {/* Advantage 3 */}
          <div className="relative rounded-2xl border-2 border-purple-200 bg-purple-50/40 px-5 py-7 shadow-md sm:px-8 sm:py-10">

            {/* Coming Soon Badge */}
            <span className="absolute right-4 top-4 rounded-full bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm sm:right-5 sm:top-5 sm:px-3">
              Coming Soon
            </span>

            <div className="flex items-center gap-4 pr-24 sm:pr-28">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-2xl shadow-sm sm:h-14 sm:w-14">
                👥
              </div>

              <h3 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                Ask, Answer & Connect
              </h3>

            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 sm:mt-5 sm:text-base sm:leading-7">
              Have a question about salaries, hike %, or your GCC career? Post a question to the community or join an existing conversation.
            </p>

          </div>


        </div>

      </section>


      {/* Footer */}
      <Footer />

    </div>
  );
}

export default Signup;