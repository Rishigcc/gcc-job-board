import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";
import NotificationsBell from "./NotificationsBell";

function SiteHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const navItems = [
    {
      key: "jobs",
      label: "Explore GCC Jobs",
      onClick: () => navigate("/jobs"),
      show: true,
      icon: (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </>
      ),
    },
    {
      key: "questions",
      label: "Ask, Answer & Connect",
      onClick: () => navigate("/questions"),
      show: true,
      icon: (
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      ),
    },
    {
      key: "dashboard",
      label: "My Dashboard",
      onClick: () => navigate("/welcome"),
      show: Boolean(session),
      icon: (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ),
    },
    {
      key: "profile",
      label: "Profile",
      onClick: () => navigate("/profile"),
      show: Boolean(session),
      icon: (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </>
      ),
    },
    {
      key: "auth",
      label: session ? "Sign Out" : "Sign In",
      onClick: session ? handleSignOut : handleSignIn,
      show: session !== undefined,
      icon: session ? (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </>
      ) : (
        <>
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </>
      ),
    },
  ].filter((item) => item.show);

  return (
    <header className="mx-3 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:mx-5 sm:mt-5 sm:px-8 sm:py-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">

        <button
          type="button"
          onClick={() => navigate(session ? "/welcome" : "/")}
          className="text-2xl font-bold tracking-tight text-slate-900 transition hover:text-blue-600 sm:text-4xl"
        >
          iWorkAtGCC
        </button>

        {/* Desktop nav */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {session && (
            <div className="mr-1">
              <NotificationsBell userId={session.user.id} />
            </div>
          )}

          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Mobile controls */}
        <div className="flex shrink-0 items-center gap-2 sm:hidden">
          {session && <NotificationsBell userId={session.user.id} />}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        </div>

      </div>

      {/* Mobile side menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">

          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
          />

          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-white p-5 shadow-xl">

            <div className="flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                Menu
              </span>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    {item.icon}
                  </svg>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

          </div>

        </div>
      )}
    </header>
  );
}

export default SiteHeader;
