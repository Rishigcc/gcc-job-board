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
import Privacy from "./Pages/Privacy.jsx";
import RecruiterTerms from "./Pages/RecruiterTerms.jsx";
import PostAJob from "./Pages/PostAJob.jsx";
import RecruiterHome from "./Pages/RecruiterHome.jsx";
import RecruiterJobs from "./Pages/RecruiterJobs.jsx";
import RecruiterJobNew from "./Pages/RecruiterJobNew.jsx";
import RecruiterJobEdit from "./Pages/RecruiterJobEdit.jsx";
import RecruiterApplications from "./Pages/RecruiterApplications.jsx";
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
// Deliberately opt-in, not applied to every protected route: /profile must
// stay reachable for recruiters.
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

      {/* Protected Welcome page */}
      <Route
        path="/welcome"
        element={
          <ProtectedRoute blockRecruiters>
            <Welcome />
          </ProtectedRoute>
        }
      />

      {/* Protected Ask a Question page */}
      <Route
        path="/ask"
        element={
          <ProtectedRoute>
            <AskQuestion />
          </ProtectedRoute>
        }
      />

      {/* Protected Profile page */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      {/* Protected Asked Questions page */}
      <Route
        path="/profile/asked"
        element={
          <ProtectedRoute>
            <AskedQuestions />
          </ProtectedRoute>
        }
      />

      {/* Protected Saved Questions page */}
      <Route
        path="/profile/saved"
        element={
          <ProtectedRoute>
            <SavedQuestions />
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