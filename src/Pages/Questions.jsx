import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchAuthorNames } from "../lib/authors";
import { useQuestionCardInteractions } from "../lib/useQuestionCardInteractions";
import Footer from "../components/Footer";
import LoadingCard from "../components/LoadingCard";
import SiteHeader from "../components/SiteHeader";
import QuestionCard from "../components/QuestionCard";
import Pagination from "../components/Pagination";
import Seo from "../components/Seo";

const QUESTIONS_PER_PAGE = 10;
const TRENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function Questions() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    searchParams.get("q") || ""
  );
  const [debouncedSearch, setDebouncedSearch] = useState(
    searchParams.get("q") || ""
  );
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") === "latest" ? "latest" : "trending"
  );

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [justPosted, setJustPosted] = useState(
    Boolean(location.state?.posted)
  );

  const [userId, setUserId] = useState(null);
  const [answerCounts, setAnswerCounts] = useState({});
  const [trendingScores, setTrendingScores] = useState({});

  const [scrollTargetId, setScrollTargetId] = useState(
    location.state?.scrollToId ?? null
  );
  const [highlightedId, setHighlightedId] = useState(null);
  const cardRefs = useRef({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const loadQuestions = async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, title, description, created_at, user_id, slug, tags")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading questions:", error);
        setLoading(false);
        return;
      }

      const ids = data.map((q) => q.id);
      const sevenDaysAgo = new Date(
        Date.now() - TRENDING_WINDOW_MS
      ).toISOString();

      // These four all only depend on `data` from the questions fetch
      // above, not on each other, so run them concurrently instead of
      // awaiting them one after another.
      const [authorNames, answersResult, recentHeartsResult, recentAnswersResult] =
        await Promise.all([
          fetchAuthorNames(data.map((q) => q.user_id)),
          supabase.from("answers").select("question_id").in("question_id", ids),
          supabase
            .from("question_hearts")
            .select("question_id")
            .in("question_id", ids)
            .gte("created_at", sevenDaysAgo),
          supabase
            .from("answers")
            .select("question_id")
            .in("question_id", ids)
            .gte("created_at", sevenDaysAgo),
        ]);

      setQuestions(
        data.map((question) => ({
          ...question,
          author_name: authorNames[question.user_id] || null,
        }))
      );

      if (answersResult.error) {
        console.error("Error loading answer counts:", answersResult.error);
      } else {
        const counts = {};
        for (const row of answersResult.data) {
          counts[row.question_id] = (counts[row.question_id] || 0) + 1;
        }
        setAnswerCounts(counts);
      }

      if (recentHeartsResult.error) {
        console.error(
          "Error loading recent hearts:",
          recentHeartsResult.error
        );
      }

      if (recentAnswersResult.error) {
        console.error(
          "Error loading recent answers:",
          recentAnswersResult.error
        );
      }

      const scores = {};

      for (const row of recentHeartsResult.data || []) {
        scores[row.question_id] = (scores[row.question_id] || 0) + 1;
      }

      for (const row of recentAnswersResult.data || []) {
        scores[row.question_id] = (scores[row.question_id] || 0) + 1;
      }

      setTrendingScores(scores);

      setLoading(false);
    };

    loadQuestions();
  }, []);

  const tabQuestions = useMemo(() => {
    if (activeTab === "latest") return questions;

    return [...questions].sort((a, b) => {
      const scoreDiff =
        (trendingScores[b.id] || 0) - (trendingScores[a.id] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [questions, activeTab, trendingScores]);

  const filteredQuestions = useMemo(() => {
    if (!debouncedSearch) return tabQuestions;

    const term = debouncedSearch.toLowerCase();

    return tabQuestions.filter((question) => {
      const haystack = [
        question.title,
        question.description,
        ...(question.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [tabQuestions, debouncedSearch]);

  const questionIds = useMemo(
    () => questions.map((q) => q.id),
    [questions]
  );

  const interactions = useQuestionCardInteractions(userId, questionIds);

  useEffect(() => {
    if (!justPosted) return;

    // Clear the redirect state so refreshing or navigating back
    // doesn't keep re-showing the banner.
    navigate(location.pathname, { replace: true });

    const timeout = setTimeout(() => setJustPosted(false), 5000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump to whichever page contains the question we're returning to.
  useEffect(() => {
    if (!scrollTargetId || filteredQuestions.length === 0) return;

    const index = filteredQuestions.findIndex(
      (q) => q.id === scrollTargetId
    );
    if (index === -1) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(Math.floor(index / QUESTIONS_PER_PAGE) + 1);
  }, [scrollTargetId, filteredQuestions]);

  // Once that page's card is actually rendered, scroll to it and
  // briefly highlight it so it's easy to spot.
  useEffect(() => {
    if (!scrollTargetId) return;

    const node = cardRefs.current[scrollTargetId];
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(scrollTargetId);
    setScrollTargetId(null);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTargetId, currentPage, loading]);

  // Auto-clear the highlight after a couple seconds. Kept in its own
  // effect so clearing scrollTargetId above doesn't cancel this timer.
  useEffect(() => {
    if (!highlightedId) return;

    const timeout = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(timeout);
  }, [highlightedId]);

  // Debounce the search input before it actually filters or hits the URL.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  const isFirstSearchSync = useRef(true);

  useEffect(() => {
    if (isFirstSearchSync.current) {
      isFirstSearchSync.current = false;
      return;
    }

    const params = new URLSearchParams(searchParams);

    if (debouncedSearch) {
      params.set("q", debouncedSearch);
    } else {
      params.delete("q");
    }

    setSearchParams(params, { replace: true });
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);

    const params = new URLSearchParams(searchParams);

    if (tab === "latest") {
      params.set("tab", "latest");
    } else {
      params.delete("tab");
    }

    setSearchParams(params, { replace: true });
  };

  const totalPages = Math.ceil(
    filteredQuestions.length / QUESTIONS_PER_PAGE
  );

  const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;

  const paginatedQuestions = filteredQuestions.slice(
    startIndex,
    startIndex + QUESTIONS_PER_PAGE
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
    interactions.setHeartPopupFor(null);
    interactions.setSavePopupFor(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dotGridStyle = {
    backgroundImage:
      "radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)",
    backgroundSize: "20px 20px",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f8fc] text-slate-900">

      <Seo
        title="GCC Community Q&A — Salaries, Hikes & Careers | iWorkAtGCC"
        description="Ask and answer questions with the GCC community about salaries, hikes, offers, promotions, and career moves at Global Capability Centers in India."
        path="/questions"
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


        {/* Main Content */}
        <section className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

          {justPosted && (
            <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 text-center text-sm font-semibold text-green-700">
              Your question has been posted to the community!
            </div>
          )}

          {/* Title */}
          <div className="text-center">

            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              Ask, Answer & Connect
            </h1>

            <p className="mt-3 text-sm text-slate-500 sm:text-base">
              Questions from the GCC community about salaries, hikes, and
              careers.
            </p>

            <button
              onClick={() => navigate("/ask")}
              className="mt-4 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg sm:text-base"
            >
              Ask a Question
            </button>

          </div>

          {/* Search */}
          <div className="mx-auto mt-5 max-w-xl">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search questions"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tabs */}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => handleTabChange("trending")}
              className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                activeTab === "trending"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Trending
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("latest")}
              className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                activeTab === "latest"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Latest
            </button>
          </div>


          {/* Questions List */}
          <div className="mt-6 space-y-4 sm:mt-7">

          {loading ? (
            <LoadingCard
              title="Loading questions..."
              subtitle="Fetching the latest questions from the community."
            />
          ) : filteredQuestions.length > 0 ? (
            paginatedQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                interactions={interactions}
                answerCount={answerCounts[question.id]}
                highlighted={highlightedId === question.id}
                cardRef={(el) => {
                  if (el) cardRefs.current[question.id] = el;
                }}
                currentUserId={userId}
                onDeleted={(id) =>
                  setQuestions((prev) => prev.filter((q) => q.id !== id))
                }
              />
            ))
          ) : questions.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-12 text-center shadow-md shadow-slate-200/50">

              <div className="text-5xl mb-4">💬</div>

              <h2 className="text-2xl font-bold text-slate-800">
                No questions yet
              </h2>

              <p className="mt-3 text-slate-500">
                Be the first to ask the community a question.
              </p>

              <button
                onClick={() => navigate("/ask")}
                className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-white shadow-sm transition hover:bg-blue-700"
              >
                Ask a Question
              </button>

            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-12 text-center shadow-md shadow-slate-200/50">

              <div className="text-5xl mb-4">🔍</div>

              <h2 className="text-2xl font-bold text-slate-800">
                No questions found
              </h2>

              <p className="mt-3 text-slate-500">
                Try a different search term.
              </p>

            </div>
          )}

          </div>


          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />

        </section>


        {/* Footer */}
        <Footer />

      </div>

    </div>
  );
}

export default Questions;
