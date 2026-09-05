import { StrictMode, useEffect, useState } from "react";
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
import { supabase } from "./lib/supabase";
import { setPostLoginRedirect } from "./lib/postLoginRedirect";


function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
    setPostLoginRedirect(location.pathname);
    return <Navigate to="/signup" replace />;
  }

  return children;
}


function AppRoutes() {
  return (
    <Routes>

      {/* Main website */}
      <Route path="/" element={<App />} />

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


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>
);