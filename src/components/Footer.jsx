import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";

function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(undefined);

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

  const handleSignIn = () => {
    setPostLoginRedirect(location.pathname);
    navigate("/signup", { state: { mode: "signin" } });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  return (
    <footer className="mt-6 border-t border-slate-200 bg-white">

      <div className="max-w-6xl mx-auto px-6 py-5">

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">

          <div>
            <h3 className="text-xl font-bold text-slate-900">
              iWorkAtGCC
            </h3>

            <a
              href="https://www.linkedin.com/company/iworkatgcc/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow iWorkAtGCC on LinkedIn"
              className="mt-2 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.6v1.64h.05c.5-.95 1.75-1.95 3.6-1.95 3.85 0 4.55 2.53 4.55 5.83V21h-4v-5.5c0-1.31-.03-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9Z" />
              </svg>
            </a>
          </div>

          <div className="hidden md:block">
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Explore
            </h4>

            <ul className="mt-2 space-y-1.5 text-sm">
              <li>
                <Link
                  to="/jobs"
                  className="text-slate-600 transition hover:text-blue-600"
                >
                  Explore GCC Jobs
                </Link>
              </li>
            </ul>
          </div>

          <div className="hidden md:block">
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Community
            </h4>

            <ul className="mt-2 space-y-1.5 text-sm">
              <li>
                <Link
                  to="/signup"
                  state={{ mode: "join" }}
                  className="text-slate-600 transition hover:text-blue-600"
                >
                  Join the Community
                </Link>
              </li>
              <li>
                <Link
                  to="/questions"
                  className="text-slate-600 transition hover:text-blue-600"
                >
                  Ask, Answer &amp; Connect
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Account
            </h4>

            <ul className="mt-2 space-y-1.5 text-sm">
              {session ? (
                <>
                  <li className="hidden md:block">
                    <Link
                      to="/welcome"
                      className="text-slate-600 transition hover:text-blue-600"
                    >
                      My Dashboard
                    </Link>
                  </li>
                  <li className="hidden md:block">
                    <Link
                      to="/profile"
                      className="text-slate-600 transition hover:text-blue-600"
                    >
                      Profile
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-slate-600 transition hover:text-blue-600"
                    >
                      Sign Out
                    </button>
                  </li>
                </>
              ) : (
                <li>
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="text-slate-600 transition hover:text-blue-600"
                  >
                    Sign In
                  </button>
                </li>
              )}
            </ul>
          </div>

        </div>

      </div>

    </footer>
  );
}

export default Footer;
