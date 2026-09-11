import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

function AskedQuestions() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answerCounts, setAnswerCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("questions")
        .select("id, title, description, created_at, slug, tags, user_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading asked questions:", error);
        setLoading(false);
        return;
      }

      const authorNames = await fetchAuthorNames([user.id]);

      setQuestions(
        data.map((question) => ({
          ...question,
          author_name: authorNames[user.id] || null,
        }))
      );

      const ids = data.map((q) => q.id);

      if (ids.length > 0) {
        const { data: answers, error: answersError } = await supabase
          .from("answers")
          .select("question_id")
          .in("question_id", ids);

        if (answersError) {
          console.error("Error loading answer counts:", answersError);
        } else {
          const counts = {};
          for (const row of answers) {
            counts[row.question_id] = (counts[row.question_id] || 0) + 1;
          }
          setAnswerCounts(counts);
        }
      }

      setLoading(false);
    };

    load();
  }, []);

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const interactions = useQuestionCardInteractions(userId, questionIds);

  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
  const paginatedQuestions = questions.slice(
    startIndex,
    startIndex + QUESTIONS_PER_PAGE
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <Seo
        title="Your Questions | iWorkAtGCC"
        description="Questions you've asked on iWorkAtGCC."
        path="/profile/asked"
        noindex
      />

      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

        <Link
          to="/profile"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Profile
        </Link>

        <div className="mt-4 text-center">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Questions You've Asked
          </h1>
        </div>

        <div className="mt-8 space-y-4">

          {loading ? (
            <LoadingCard
              title="Loading your questions..."
              subtitle="Fetching the questions you've asked."
            />
          ) : questions.length > 0 ? (
            paginatedQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                interactions={interactions}
                answerCount={answerCounts[question.id]}
                currentUserId={userId}
                onDeleted={(id) =>
                  setQuestions((prev) => prev.filter((q) => q.id !== id))
                }
              />
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">

              <div className="text-5xl mb-4">💬</div>

              <h2 className="text-2xl font-bold text-slate-800">
                You haven't asked any questions yet
              </h2>

              <p className="mt-3 text-slate-500">
                Have something on your mind? Ask the community.
              </p>

              <button
                onClick={() => navigate("/ask")}
                className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
              >
                Ask a Question
              </button>

            </div>
          )}

        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />

      </section>

      <Footer />

    </div>
  );
}

export default AskedQuestions;
