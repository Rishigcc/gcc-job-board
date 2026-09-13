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
import Signup from "./Pages/Signup.jsx";
import Welcome from "./Pages/Welcome.jsx";
import AskQuestion from "./Pages/AskQuestion.jsx";
import Questions from "./Pages/Questions.jsx";
import QuestionDetail from "./Pages/QuestionDetail.jsx";
import Profile from "./Pages/Profile.jsx";
import AskedQuestions from "./Pages/AskedQuestions.jsx";
import SavedQuestions from "./Pages/SavedQuestions.jsx";
import ActivityTracker from "./components/ActivityTracker.jsx";
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


// The gtag('config') call in index.html sends a page_view on document load,
// and that is the only one it ever sends. Router navigations swap the view
// without a document load, so without this every internal route change --
// including the / -> /welcome redirect for signed-in users -- is invisible
// to GA4.
function PageViewTracker() {
  const { pathname, search } = useLocation();

  // Seeded with the landing path so the first run is a no-op: that pageview
  // was already sent from index.html. Holding the path rather than a "have I
  // fired yet" flag also keeps StrictMode's double-invoked mount effect from
  // sending a duplicate in dev, since both passes see an unchanged path.
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


function ProtectedRoute({ children }) {
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
  if (session) {
    return <Navigate to="/welcome" replace />;
  }

  return <App />;
}


function AppRoutes() {
  return (
    <Routes>

      {/* Main website */}
      <Route path="/" element={<HomeRoute />} />

      {/* Public job listings */}
      <Route path="/jobs" element={<Jobs />} />

      {/* Signup */}
      <Route path="/signup" element={<Signup />} />

      {/* Public questions listing */}
      <Route path="/questions" element={<Questions />} />

      {/* Public question detail */}
      <Route path="/questions/:slug" element={<QuestionDetail />} />

      {/* Protected Welcome page */}
      <Route
        path="/welcome"
        element={
          <ProtectedRoute>
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