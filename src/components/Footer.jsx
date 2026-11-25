import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";
import { isRecruiterUser } from "../lib/accountType";

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

  // Same rule as the header: a recruiter account does not get the
  // community signposts. Dropping two of the five columns would leave an
  // odd grid, so the column count changes with them.
  //
  // THIS VALUE WAS COMPUTED AND THEN NOT USED ON THE ACCOUNT COLUMN, which
  // is how a recruiter kept a Profile link in the footer after the header's
  // was taken away on 25 Nov 2026 — one that bounced them straight back to
  // /recruiter. Rishi: *"A control that silently does nothing visible is
  // worse than no control."* The Account list below now asks the same
  // question the grid does.
  const isRecruiter = session ? isRecruiterUser(session.user) : false;

  const gridClass = isRecruiter
    ? "grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3"
    : "grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-5";

  return (
    <footer className="mt-6 border-t border-slate-200 bg-white">

      <div className="max-w-6xl mx-auto px-6 py-5">

        <div className={gridClass}>

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

          {!isRecruiter && (
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
          )}

          {!isRecruiter && (
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
          )}

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Legal
            </h4>

            <ul className="mt-2 space-y-1.5 text-sm">
              <li>
                <Link
                  to="/privacy"
                  className="text-slate-600 transition hover:text-blue-600"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/recruiter-terms"
                  className="text-slate-600 transition hover:text-blue-600"
                >
                  Recruiter Terms
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
                  {/* Profile for a community member, Settings for a
                      recruiter — one slot, never both, exactly as in
                      SiteHeader.jsx. /profile is behind blockRecruiters, so
                      offering it to a recruiter is offering a link that
                      bounces. */}
                  <li className="hidden md:block">
                    {isRecruiter ? (
                      <Link
                        to="/recruiter/settings"
                        className="text-slate-600 transition hover:text-blue-600"
                      >
                        Settings
                      </Link>
                    ) : (
                      <Link
                        to="/profile"
                        className="text-slate-600 transition hover:text-blue-600"
                      >
                        Profile
                      </Link>
                    )}
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
