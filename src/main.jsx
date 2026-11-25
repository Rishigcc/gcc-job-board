import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import "./index.css";
import App from "./App.jsx";
import Jobs from "./Pages/Jobs.jsx";
import GccJobs from "./Pages/GccJobs.jsx";
import GccJobDetail from "./Pages/GccJobDetail.jsx";
import Signup from "./Pages/Signup.jsx";
import Welcome from "./Pages/Welcome.jsx";
import AskQuestion from "./Pages/AskQuestion.jsx";
import Questions from "./Pages/Questions.jsx";
import QuestionDetail from "./Pages/QuestionDetail.jsx";
import Profile from "./Pages/Profile.jsx";
import AskedQuestions from "./Pages/AskedQuestions.jsx";
import SavedQuestions from "./Pages/SavedQuestions.jsx";
import SavedJobs from "./Pages/SavedJobs.jsx";
import Privacy from "./Pages/Privacy.jsx";
import RecruiterTerms from "./Pages/RecruiterTerms.jsx";
import PostAJob from "./Pages/PostAJob.jsx";
import RecruiterResetPassword from "./Pages/RecruiterResetPassword.jsx";
import RecruiterForgotPassword from "./Pages/RecruiterForgotPassword.jsx";
import RecruiterHome from "./Pages/RecruiterHome.jsx";
import RecruiterJobs from "./Pages/RecruiterJobs.jsx";
import RecruiterJobNew from "./Pages/RecruiterJobNew.jsx";
import RecruiterJobEdit from "./Pages/RecruiterJobEdit.jsx";
import RecruiterApplications from "./Pages/RecruiterApplications.jsx";
import RecruiterSettings from "./Pages/RecruiterSettings.jsx";
import MyApplications from "./Pages/MyApplications.jsx";
import DeleteMyData from "./Pages/DeleteMyData.jsx";
import Admin from "./Pages/Admin.jsx";
import RecruiterRoute from "./components/RecruiterRoute.jsx";
import ActivityTracker from "./components/ActivityTracker.jsx";
import { isRecruiterUser } from "./lib/accountType";
import { supabase } from "./lib/supabase";
import { setPostLoginRedirect } from "./lib/postLoginRedirect";
import { trackEvent } from "./analytics";


function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}


// The gtag('config') call injected by gaPlugin in vite.config.js sends a
// page_view on document load, and that is the only one it ever sends.
// Router navigations swap the view without a document load, so without this
// every internal route change -- including the / -> /welcome redirect for
// signed-in users -- is invisible to GA4.
function PageViewTracker() {
  const { pathname, search } = useLocation();

  // Seeded with the landing path so the first run is a no-op: that pageview
  // was already sent by the injected snippet. Holding the path rather than a
  // "have I fired yet" flag also keeps StrictMode's double-invoked mount
  // effect from sending a duplicate in dev, since both passes see an
  // unchanged path.
  const lastPath = useRef(pathname + search);

  useEffect(() => {
    const current = pathname + search;

    if (lastPath.current === current) return;

    lastPath.current = current;

    trackEvent("page_view", {
      page_path: current,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}


// `blockRecruiters` sends a recruiter to /recruiter BEFORE `children` ever
// mounts. Welcome.jsx used to do this itself, from inside an async effect,
// which meant the community home page rendered for a moment first. Nothing
// in that page reached the database for a recruiter (its one profiles query
// sits after the guard, and its other two effects bail on a null userId),
// but rendering it at all was wrong. Deciding here removes the flash.
//
// `blockRecruiters` is opt-in rather than the default, and the routes that
// carry it are a decided list of seven candidate-only pages, not "every
// protected route".
//
// THIS COMMENT USED TO READ "/profile must stay reachable for recruiters",
// on decision 10's reasoning that one person may be both a candidate and a
// recruiter. That reading was DISPROVED ON 25 NOV 2026 and the seven routes
// now carry the guard. Decision 10 protects a PERSON holding two logins; it
// says nothing about what one account should be shown, and the two are not
// interchangeable:
//
//   * 0 of 2,656 accounts hold two identities, and 0 Google accounts hold a
//     password.
//   * A community account cannot become a recruiter account. `account_type`
//     is written in exactly one place — PostAJob.jsx's signUp — and
//     `private.handle_new_recruiter()` raises for the free email domains
//     that 2,611 of the 2,654 Google accounts use.
//
// So a recruiter who wants a community presence has a SECOND, Google login,
// and that login is not a recruiter — which is why blocking these routes
// takes nothing away from the person decision 10 was written for.
function ProtectedRoute({ children, blockRecruiters = false }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    // Listen for login/logout/session changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!session) {
    setPostLoginRedirect(location.pathname + location.search);
    return <Navigate to="/signup" replace />;
  }

  if (blockRecruiters && isRecruiterUser(session.user)) {
    return <Navigate to="/recruiter" replace />;
  }

  return children;
}


function HomeRoute() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    // Listen for login/logout/session changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  // Signed-in users are sent to their dashboard; signed-out users see
  // the public homepage.
  //
  // Recruiters go to the recruiter dashboard instead. Sending them to
  // /welcome would create a community profiles row for them, and creating
  // that row is what fires the community welcome email -- so a recruiter
  // who simply visited the site root would receive it.
  if (session) {
    const isRecruiter = isRecruiterUser(session.user);

    return <Navigate to={isRecruiter ? "/recruiter" : "/welcome"} replace />;
  }

  return <App />;
}


function AppRoutes() {
  return (
    <Routes>

      {/* Main website */}
      <Route path="/" element={<HomeRoute />} />

      {/* Public job listings, collated from elsewhere */}
      <Route path="/jobs" element={<Jobs />} />

      {/* Roles posted directly on iWorkAtGCC. Public, but noindex until
          stage 10 renders them server-side, and not prerendered -- the route
          list in scripts/prerender.mjs is explicit, so these are excluded by
          not being added to it. */}
      <Route path="/gcc-jobs" element={<GccJobs />} />
      <Route path="/gcc-jobs/:slugId" element={<GccJobDetail />} />

      {/* Signup */}
      <Route path="/signup" element={<Signup />} />

      {/* Public questions listing */}
      <Route path="/questions" element={<Questions />} />

      {/* Public question detail */}
      <Route path="/questions/:slug" element={<QuestionDetail />} />

      {/* Policy pages — public, no auth */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/recruiter-terms" element={<RecruiterTerms />} />

      {/* Recruiter sign-up and sign-in — public */}
      <Route path="/post-a-job" element={<PostAJob />} />

      {/* WHERE THE RESET EMAIL LANDS, and deliberately a PLAIN route.
          Not ProtectedRoute: the session arrives in the URL fragment and is
          consumed asynchronously, so a guard reading getSession() on mount
          would bounce a recruiter to sign-in before their own link had
          finished working. Not RecruiterRoute either, which would try to
          read or create a recruiter_profiles row before the password was
          even set. The page handles its own states, including the one where
          there is no session at all.

          NOT in scripts/prerender.mjs's route list: nothing here is public,
          and a prerendered copy would carry a stale shell. */}
      {/* Asking for the link. Public and unguarded for the obvious reason:
          the person who needs it cannot sign in. Not prerendered. */}
      <Route
        path="/recruiter/forgot-password"
        element={<RecruiterForgotPassword />}
      />

      <Route
        path="/recruiter/reset-password"
        element={<RecruiterResetPassword />}
      />

      {/* Recruiter sign-in, 25 Nov 2026. A returning recruiter had no
          entrance: the only one was /post-a-job's Sign in tab, which you
          find only if you already know that posting and signing in are the
          same page.

          OUTSIDE RecruiterRoute, deliberately and like the two routes above
          it: a sign-in page is for someone with no session, and the guard
          would bounce them to /post-a-job before it rendered.

          It renders PostAJob with the Sign in tab open rather than a second
          page, because the form, the free-provider block and the
          already-signed-in notice are all there and must not be duplicated.
          Rishi ruled out a header item: the header is for the community, and
          a permanent recruiter link is clutter for 2,520 people who will
          never use it. The entrances are the community sign-in page and the
          footer. */}
      <Route
        path="/recruiter/sign-in"
        element={<PostAJob initialMode="signin" />}
      />

      {/* Recruiter area. RecruiterRoute proves there is a confirmed session
          and a recruiter_profiles row before any of these render. */}
      <Route
        path="/recruiter"
        element={
          <RecruiterRoute>
            <RecruiterHome />
          </RecruiterRoute>
        }
      />
      <Route
        path="/recruiter/jobs"
        element={
          <RecruiterRoute>
            <RecruiterJobs />
          </RecruiterRoute>
        }
      />
      <Route
        path="/recruiter/jobs/new"
        element={
          <RecruiterRoute>
            <RecruiterJobNew />
          </RecruiterRoute>
        }
      />
      <Route
        path="/recruiter/jobs/:id/edit"
        element={
          <RecruiterRoute>
            <RecruiterJobEdit />
          </RecruiterRoute>
        }
      />
      <Route
        path="/recruiter/jobs/:id/applications"
        element={
          <RecruiterRoute>
            <RecruiterApplications />
          </RecruiterRoute>
        }
      />

      {/* Settings. Inside RecruiterRoute so the session, the
          recruiter_profiles row and the suspension state are settled before
          it renders, rather than re-implemented as a third top-level route.
          This is what the header offers a recruiter in place of /profile. */}
      <Route
        path="/recruiter/settings"
        element={
          <RecruiterRoute>
            <RecruiterSettings />
          </RecruiterRoute>
        }
      />

      {/* Protected Welcome page */}
      <Route
        path="/welcome"
        element={
          <ProtectedRoute blockRecruiters>
            <Welcome />
          </ProtectedRoute>
        }
      />

      {/* Ask a question. Closed to recruiters for two reasons, 25 Nov 2026,
          and the second is a product decision rather than a tidy-up:
          with /profile blocked a recruiter cannot set a display name, so a
          question from one would have no name to show; and a recruiter
          posting into a community of 2,520 job-seekers is a channel that
          should not be open by accident. Nothing marks a question as coming
          from a recruiter, which is what makes the second reason matter. */}
      <Route
        path="/ask"
        element={
          <ProtectedRoute blockRecruiters>
            <AskQuestion />
          </ProtectedRoute>
        }
      />

      {/* The community profile. Blocked for recruiters, who have
          /recruiter/settings instead: every block on this page reads "—" or
          "0" on a recruiter account, and one of them — the resume upload —
          is an active control for a file a recruiter should never be
          offering. The nav item is hidden to match, in SiteHeader.jsx. */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute blockRecruiters>
            <Profile />
          </ProtectedRoute>
        }
      />

      {/* The candidate's own applications, and one of the seven routes
          closed to recruiters on 25 Nov 2026. It was deliberately open until
          then, "because one person may be both a candidate and a recruiter"
          — see ProtectedRoute above for why that premise does not hold of a
          single account. A recruiter account has no applications, so the
          empty state was the entire page. */}
      <Route
        path="/my-applications"
        element={
          <ProtectedRoute blockRecruiters>
            <MyApplications />
          </ProtectedRoute>
        }
      />

      {/* Everything destructive about the candidate's job board data lives
          on its own route, so /profile carries a text link rather than a red
          panel on a page the whole community opens daily. */}
      <Route
        path="/profile/delete-data"
        element={
          <ProtectedRoute blockRecruiters>
            <DeleteMyData />
          </ProtectedRoute>
        }
      />

      {/* /admin is URL-only and not linked from anywhere. A non-admin who
          reaches it sees "Page not found" rather than a refusal, because a
          refusal confirms the route exists. The hiding is NOT the security:
          every action is a definer function that checks is_admin() in the
          database, and the endpoints verify the admin row with the service
          key. This route rendering changes nothing about what a request can
          do. */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* Protected Asked Questions page. Blocked for recruiters with the
          rest of the /profile family — a recruiter has asked nothing, and
          cannot, now that /ask is closed. */}
      <Route
        path="/profile/asked"
        element={
          <ProtectedRoute blockRecruiters>
            <AskedQuestions />
          </ProtectedRoute>
        }
      />

      {/* Protected Saved Questions page. Blocked with the rest. */}
      <Route
        path="/profile/saved"
        element={
          <ProtectedRoute blockRecruiters>
            <SavedQuestions />
          </ProtectedRoute>
        }
      />

      {/* Saved roles, closed to recruiters on 25 Nov 2026 — the same
          correction as /my-applications above, and the one most easily
          missed, because this is the only one of the seven where a recruiter
          could have had real rows to see: a recruiter CAN save a role. It is
          blocked anyway, because saving roles is candidate behaviour and the
          route lives under a /profile that no longer exists for them.
          KNOWN CONSEQUENCE: the public board is still reachable by URL for a
          signed-in recruiter, so one can still save a role and then have
          nowhere to see it. Hiding the save button for recruiters was NOT
          decided and is deliberately not done here. */}
      <Route
        path="/profile/saved-jobs"
        element={
          <ProtectedRoute blockRecruiters>
            <SavedJobs />
          </ProtectedRoute>
        }
      />

    </Routes>
  );
}


// Prerendered pages ship with the Seo component's output baked into <head>.
// React re-adds its own on mount, and the stale copies would otherwise win on
// client-side navigation by sitting earlier in document order.
document.head
  .querySelectorAll("[data-prerendered]")
  .forEach((el) => el.remove());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <PageViewTracker />
      <ActivityTracker />
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>
);