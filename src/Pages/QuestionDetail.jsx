import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useDisplayName } from "../lib/useDisplayName";
import { fetchAuthorNames } from "../lib/authors";
import { useQuestionSaves } from "../lib/useQuestionSaves";
import { useQuestionHearts } from "../lib/useQuestionHearts";
import { useAnswerHearts } from "../lib/useAnswerHearts";
import { TAG_OPTIONS } from "../lib/tags";
import { formatRelativeTime } from "../lib/relativeTime";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";
import Footer from "../components/Footer";
import LoadingCard from "../components/LoadingCard";
import SignInPopup from "../components/SignInPopup";
import SiteHeader from "../components/SiteHeader";
import Pagination from "../components/Pagination";

const ANSWERS_PER_PAGE = 15;

function QuestionDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();

  const {
    userId,
    loading: authLoading,
    existingDisplayName,
    displayNameInput,
    setDisplayNameInput,
    ensureDisplayName,
  } = useDisplayName();

  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [answers, setAnswers] = useState([]);
  const [answersLoading, setAnswersLoading] = useState(true);
  const [answersRefreshKey, setAnswersRefreshKey] = useState(0);
  const [answerBody, setAnswerBody] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerMessage, setAnswerMessage] = useState("");

  const composerRef = useRef(null);
  const answerTextareaRef = useRef(null);

  const handleReplyClick = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    answerTextareaRef.current?.focus();
  };

  const [showSavePopup, setShowSavePopup] = useState(false);
  const { savedIds, toggleSave, justSavedId } = useQuestionSaves(
    userId,
    question ? [question.id] : []
  );

  const handleSaveToggle = () => {
    if (!userId) {
      setShowSavePopup(true);
      return;
    }

    toggleSave(question.id);
  };

  const [showHeartPopup, setShowHeartPopup] = useState(false);
  const { heartCounts, heartedByMe, toggleHeart } = useQuestionHearts(
    userId,
    question ? [question.id] : []
  );

  const handleHeartToggle = () => {
    if (!userId) {
      setShowHeartPopup(true);
      return;
    }

    toggleHeart(question.id);
  };

  const answerIds = useMemo(() => answers.map((a) => a.id), [answers]);

  const {
    heartCounts: answerHeartCounts,
    heartedByMe: answerHeartedByMe,
    toggleHeart: toggleAnswerHeart,
  } = useAnswerHearts(userId, answerIds);

  const sortedAnswers = useMemo(() => {
    if (answers.length === 0) return [];

    const byHeartsDesc = [...answers].sort((a, b) => {
      const scoreDiff =
        (answerHeartCounts[b.id] || 0) - (answerHeartCounts[a.id] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const topTwo = byHeartsDesc.slice(0, 2);
    const topTwoIds = new Set(topTwo.map((a) => a.id));

    const rest = answers
      .filter((a) => !topTwoIds.has(a.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return [...topTwo, ...rest];
  }, [answers, answerHeartCounts]);

  const [answerHeartPopupFor, setAnswerHeartPopupFor] = useState(null);

  const handleAnswerHeartToggle = (answerId) => {
    if (!userId) {
      setAnswerHeartPopupFor(answerId);
      return;
    }

    toggleAnswerHeart(answerId);
  };

  const [scrollTargetAnswerId, setScrollTargetAnswerId] = useState(
    location.state?.scrollToAnswerId ?? null
  );
  const [highlightedAnswerId, setHighlightedAnswerId] = useState(null);
  const answerRefs = useRef({});
  const answersSectionRef = useRef(null);
  const [answersCurrentPage, setAnswersCurrentPage] = useState(1);

  const answersTotalPages = Math.ceil(
    sortedAnswers.length / ANSWERS_PER_PAGE
  );
  const answersStartIndex = (answersCurrentPage - 1) * ANSWERS_PER_PAGE;
  const paginatedAnswers = sortedAnswers.slice(
    answersStartIndex,
    answersStartIndex + ANSWERS_PER_PAGE
  );

  const handleAnswersPageChange = (page) => {
    setAnswersCurrentPage(page);
    answersSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const [editingAnswerId, setEditingAnswerId] = useState(null);
  const [editAnswerBody, setEditAnswerBody] = useState("");
  const [savingAnswerEdit, setSavingAnswerEdit] = useState(false);
  const [editAnswerMessage, setEditAnswerMessage] = useState("");
  const [deleteAnswerConfirmFor, setDeleteAnswerConfirmFor] = useState(null);
  const [deletingAnswerId, setDeletingAnswerId] = useState(null);

  const handleStartEditAnswer = (answer) => {
    setEditingAnswerId(answer.id);
    setEditAnswerBody(answer.body);
    setEditAnswerMessage("");
  };

  const handleSaveAnswerEdit = async (e, answerId) => {
    e.preventDefault();

    if (!editAnswerBody.trim()) {
      setEditAnswerMessage("Please write an answer before saving.");
      return;
    }

    setSavingAnswerEdit(true);
    setEditAnswerMessage("");

    const { data, error } = await supabase
      .from("answers")
      .update({ body: editAnswerBody.trim() })
      .eq("id", answerId)
      .select("edited_at")
      .single();

    if (error) {
      console.error("Error updating answer:", error);
      setEditAnswerMessage("Something went wrong. Please try again.");
      setSavingAnswerEdit(false);
      return;
    }

    setAnswers((prev) =>
      prev.map((a) =>
        a.id === answerId
          ? { ...a, body: editAnswerBody.trim(), edited_at: data.edited_at }
          : a
      )
    );
    setSavingAnswerEdit(false);
    setEditingAnswerId(null);
  };

  const handleDeleteAnswer = async (answerId) => {
    setDeletingAnswerId(answerId);

    const { error } = await supabase
      .from("answers")
      .delete()
      .eq("id", answerId);

    if (error) {
      console.error("Error deleting answer:", error);
      setDeletingAnswerId(null);
      return;
    }

    setAnswers((prev) => prev.filter((a) => a.id !== answerId));
    setDeleteAnswerConfirmFor(null);
    setDeletingAnswerId(null);
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = Boolean(userId) && question?.user_id === userId;

  const handleStartEdit = () => {
    setEditTitle(question.title);
    setEditDescription(question.description);
    setEditTags(question.tags || []);
    setEditMessage("");
    setIsEditing(true);
  };

  const toggleEditTag = (tag) => {
    setEditTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]
    );
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    if (!editTitle.trim() || !editDescription.trim()) {
      setEditMessage("Please fill in both the title and description.");
      return;
    }

    setSavingEdit(true);
    setEditMessage("");

    const { error } = await supabase
      .from("questions")
      .update({
        title: editTitle.trim(),
        description: editDescription.trim(),
        tags: editTags,
      })
      .eq("id", question.id);

    if (error) {
      console.error("Error updating question:", error);
      setEditMessage("Something went wrong. Please try again.");
      setSavingEdit(false);
      return;
    }

    setQuestion((prev) => ({
      ...prev,
      title: editTitle.trim(),
      description: editDescription.trim(),
      tags: editTags,
    }));
    setSavingEdit(false);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", question.id);

    if (error) {
      console.error("Error deleting question:", error);
      setDeleting(false);
      return;
    }

    navigate("/questions", { replace: true });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/questions/${question.slug}`;

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch (err) {
      console.error("Error copying link:", err);
    }
  };

  useEffect(() => {
    if (!linkCopied) return;

    const timeout = setTimeout(() => setLinkCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [linkCopied]);

  useEffect(() => {
    const loadQuestion = async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, title, description, created_at, user_id, tags")
        .eq("slug", slug)
        .maybeSingle();

      if (error || !data) {
        if (error) console.error("Error loading question:", error);
        setNotFound(true);
        setLoading(false);
        return;
      }

      const authorNames = await fetchAuthorNames([data.user_id]);

      setQuestion({
        ...data,
        author_name: authorNames[data.user_id] || null,
      });

      setLoading(false);
    };

    loadQuestion();
  }, [slug]);

  // If we arrived here via the Edit icon on a question card, jump
  // straight into edit mode once the question has loaded.
  useEffect(() => {
    if (question && location.state?.startEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleStartEdit();
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  useEffect(() => {
    if (!question?.id) return;

    const loadAnswers = async () => {
      const { data, error } = await supabase
        .from("answers")
        .select("id, body, created_at, user_id, edited_at")
        .eq("question_id", question.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading answers:", error);
        setAnswersLoading(false);
        return;
      }

      const authorNames = await fetchAuthorNames(
        data.map((a) => a.user_id)
      );

      setAnswers(
        data.map((answer) => ({
          ...answer,
          author_name: authorNames[answer.user_id] || null,
        }))
      );

      setAnswersLoading(false);
    };

    loadAnswers();
  }, [question?.id, answersRefreshKey]);

  // Reset to the first page whenever a different question is loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswersCurrentPage(1);
  }, [question?.id]);

  // Jump to whichever page contains the answer we're returning to (or
  // that was just posted).
  useEffect(() => {
    if (!scrollTargetAnswerId || sortedAnswers.length === 0) return;

    const index = sortedAnswers.findIndex(
      (a) => a.id === scrollTargetAnswerId
    );
    if (index === -1) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswersCurrentPage(Math.floor(index / ANSWERS_PER_PAGE) + 1);
  }, [scrollTargetAnswerId, sortedAnswers]);

  // Once the target answer's card is actually rendered, scroll to it
  // and briefly highlight it so it's easy to spot.
  useEffect(() => {
    if (!scrollTargetAnswerId) return;

    const node = answerRefs.current[scrollTargetAnswerId];
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedAnswerId(scrollTargetAnswerId);
    setScrollTargetAnswerId(null);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTargetAnswerId, answers, answersCurrentPage]);

  // Auto-clear the highlight after about a second. Kept in its own
  // effect so clearing scrollTargetAnswerId above doesn't cancel this timer.
  useEffect(() => {
    if (!highlightedAnswerId) return;

    const timeout = setTimeout(() => setHighlightedAnswerId(null), 1000);
    return () => clearTimeout(timeout);
  }, [highlightedAnswerId]);

  const handlePostAnswer = async (e) => {
    e.preventDefault();

    if (!answerBody.trim()) {
      setAnswerMessage("Please write an answer before posting.");
      return;
    }

    setSubmittingAnswer(true);
    setAnswerMessage("");

    const { error: displayNameError } = await ensureDisplayName();

    if (displayNameError) {
      setAnswerMessage(displayNameError);
      setSubmittingAnswer(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("answers")
      .insert({
        question_id: question.id,
        user_id: userId,
        body: answerBody.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error posting answer:", error);
      setAnswerMessage("Something went wrong. Please try again.");
      setSubmittingAnswer(false);
      return;
    }

    setAnswerBody("");
    setSubmittingAnswer(false);
    setAnswersRefreshKey((key) => key + 1);
    setScrollTargetAnswerId(inserted.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <SiteHeader />


      {/* Main Content */}
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

        <Link
          to="/questions"
          state={question ? { scrollToId: question.id } : undefined}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← All Questions
        </Link>

        <div className="mt-4">

          {loading ? (
            <LoadingCard
              title="Loading question..."
              subtitle="Fetching this question from the community."
            />
          ) : notFound ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">

              <div className="text-5xl mb-4">🔍</div>

              <h2 className="text-2xl font-bold text-slate-800">
                Question not found
              </h2>

              <p className="mt-3 text-slate-500">
                This question may have been removed.
              </p>

              <button
                onClick={() => navigate("/questions")}
                className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
              >
                Back to All Questions
              </button>

            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">

                {isEditing ? (
                  <form onSubmit={handleSaveEdit} className="space-y-4">

                    <div>
                      <label
                        htmlFor="editTitle"
                        className="block text-sm font-semibold text-slate-800"
                      >
                        Title
                      </label>

                      <input
                        id="editTitle"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="editDescription"
                        className="block text-sm font-semibold text-slate-800"
                      >
                        Description
                      </label>

                      <textarea
                        id="editDescription"
                        rows={6}
                        value={editDescription}
                        onChange={(e) =>
                          setEditDescription(e.target.value)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-800">
                        Tags
                      </label>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {TAG_OPTIONS.map((tag) => {
                          const selected = editTags.includes(tag);

                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleEditTag(tag)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                                selected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:text-base"
                      >
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:text-base"
                      >
                        Cancel
                      </button>
                    </div>

                    {editMessage && (
                      <p className="text-sm text-slate-700">
                        {editMessage}
                      </p>
                    )}

                  </form>
                ) : (
                  <>
                <h1 className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
                  {question.title}
                </h1>

                <p className="mt-2 text-xs text-slate-500 sm:text-sm">
                  {question.author_name || "Community Member"} ·{" "}
                  {formatRelativeTime(question.created_at)}
                </p>

                {question.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {question.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600 sm:text-base">
                  {question.description}
                </p>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1">

                    <div className="relative">
                      <button
                        type="button"
                        onClick={handleHeartToggle}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
                          heartedByMe.has(question.id)
                            ? "text-red-600"
                            : "text-slate-500"
                        }`}
                      >
                        <span>
                          {heartedByMe.has(question.id) ? "❤️" : "🤍"}
                        </span>
                        <span>{heartCounts[question.id] || 0}</span>
                      </button>

                      {showHeartPopup && (
                        <SignInPopup
                          onClose={() => setShowHeartPopup(false)}
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleReplyClick}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
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
                      >
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
                      </svg>
                      <span>Reply</span>
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={handleShare}
                        aria-label="Copy question link"
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
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
                        >
                          <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
                          <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" />
                        </svg>
                        <span>Share</span>
                      </button>

                      {linkCopied && (
                        <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
                          Copied link
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={handleSaveToggle}
                        aria-label={
                          savedIds.has(question.id)
                            ? "Unsave question"
                            : "Save question"
                        }
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
                          savedIds.has(question.id)
                            ? "text-blue-600"
                            : "text-slate-500"
                        }`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill={savedIds.has(question.id) ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                        </svg>
                        <span>{savedIds.has(question.id) ? "Saved" : "Save"}</span>
                      </button>

                      {justSavedId === question.id && (
                        <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
                          Saved
                        </span>
                      )}

                      {showSavePopup && (
                        <SignInPopup
                          onClose={() => setShowSavePopup(false)}
                        />
                      )}
                    </div>

                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleStartEdit}
                        aria-label="Edit question"
                        className="flex items-center rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
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
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        aria-label="Delete question"
                        className="flex items-center rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
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
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {showDeleteConfirm && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">
                      Are you sure? This cannot be undone.
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        {deleting ? "Deleting..." : "Delete Question"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                  </>
                )}

              </div>


              {/* Answers */}
              <div ref={answersSectionRef} className="mt-8">

                <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                  {answers.length === 1
                    ? "1 Answer"
                    : `${answers.length} Answers`}
                </h2>

                <div className="mt-4 space-y-4">

                  {answersLoading ? (
                    <LoadingCard
                      title="Loading answers..."
                      subtitle="Fetching answers from the community."
                    />
                  ) : answers.length > 0 ? (
                    paginatedAnswers.map((answer) => (
                      <div
                        key={answer.id}
                        ref={(el) => {
                          if (el) answerRefs.current[answer.id] = el;
                        }}
                        className={`rounded-2xl border bg-white px-5 py-5 shadow-sm sm:px-6 ${
                          highlightedAnswerId === answer.id
                            ? "border-blue-400 ring-2 ring-blue-200"
                            : "border-slate-200"
                        }`}
                      >
                        <p className="text-xs text-slate-500 sm:text-sm">
                          {answer.author_name || "Community Member"} ·{" "}
                          {formatRelativeTime(answer.created_at)}
                          {answer.edited_at && (
                            <span className="italic"> · edited</span>
                          )}
                        </p>

                        {editingAnswerId === answer.id ? (
                          <form
                            onSubmit={(e) =>
                              handleSaveAnswerEdit(e, answer.id)
                            }
                            className="mt-2 space-y-3"
                          >
                            <textarea
                              rows={4}
                              value={editAnswerBody}
                              onChange={(e) =>
                                setEditAnswerBody(e.target.value)
                              }
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />

                            <div className="flex items-center gap-3">
                              <button
                                type="submit"
                                disabled={savingAnswerEdit}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                              >
                                {savingAnswerEdit
                                  ? "Saving..."
                                  : "Save Changes"}
                              </button>

                              <button
                                type="button"
                                onClick={() => setEditingAnswerId(null)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>

                            {editAnswerMessage && (
                              <p className="text-sm text-slate-700">
                                {editAnswerMessage}
                              </p>
                            )}
                          </form>
                        ) : (
                          <>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 sm:text-base">
                              {answer.body}
                            </p>

                            {/* Actions */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAnswerHeartToggle(answer.id)
                                  }
                                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
                                    answerHeartedByMe.has(answer.id)
                                      ? "text-red-600"
                                      : "text-slate-500"
                                  }`}
                                >
                                  <span>
                                    {answerHeartedByMe.has(answer.id)
                                      ? "❤️"
                                      : "🤍"}
                                  </span>
                                  <span>
                                    {answerHeartCounts[answer.id] || 0}
                                  </span>
                                </button>

                                {answerHeartPopupFor === answer.id && (
                                  <SignInPopup
                                    redirectState={{
                                      scrollToAnswerId: answer.id,
                                    }}
                                    onClose={() =>
                                      setAnswerHeartPopupFor(null)
                                    }
                                  />
                                )}
                              </div>

                              {userId === answer.user_id && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStartEditAnswer(answer)
                                    }
                                    aria-label="Edit answer"
                                    className="flex items-center rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
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
                                    >
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteAnswerConfirmFor(answer.id)
                                    }
                                    aria-label="Delete answer"
                                    className="flex items-center rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
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
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                      <path d="M10 11v6" />
                                      <path d="M14 11v6" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            {deleteAnswerConfirmFor === answer.id && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
                                <p className="text-sm font-semibold text-red-700">
                                  Are you sure? This cannot be undone.
                                </p>

                                <div className="mt-3 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteAnswer(answer.id)
                                    }
                                    disabled={
                                      deletingAnswerId === answer.id
                                    }
                                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {deletingAnswerId === answer.id
                                      ? "Deleting..."
                                      : "Delete Answer"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteAnswerConfirmFor(null)
                                    }
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">

                      <div className="text-4xl mb-3">🤝</div>

                      <p className="text-slate-600">
                        No answers yet. Be the first to help!
                      </p>

                    </div>
                  )}

                </div>

                <Pagination
                  currentPage={answersCurrentPage}
                  totalPages={answersTotalPages}
                  onPageChange={handleAnswersPageChange}
                />

              </div>


              {/* Post an Answer */}
              <div
                ref={composerRef}
                className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7"
              >

                <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                  Post an Answer
                </h3>

                {authLoading ? null : userId ? (
                  <form onSubmit={handlePostAnswer} className="mt-4 space-y-4">

                    {!existingDisplayName && (
                      <div>
                        <label
                          htmlFor="answerDisplayName"
                          className="block text-sm font-semibold text-slate-800"
                        >
                          Display Name
                        </label>

                        <input
                          id="answerDisplayName"
                          type="text"
                          value={displayNameInput}
                          onChange={(e) =>
                            setDisplayNameInput(e.target.value)
                          }
                          placeholder="Choose a display name for the community"
                          maxLength={20}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <p className="mt-2 text-xs text-slate-500">
                          This is shown publicly next to your posts. You
                          only need to set this once.
                        </p>
                      </div>
                    )}

                    <textarea
                      ref={answerTextareaRef}
                      rows={4}
                      value={answerBody}
                      onChange={(e) => setAnswerBody(e.target.value)}
                      placeholder="Share your answer with the community..."
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={submittingAnswer}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:text-base"
                    >
                      {submittingAnswer ? "Posting..." : "Post Answer"}
                    </button>

                    {answerMessage && (
                      <p className="text-center text-sm text-slate-700">
                        {answerMessage}
                      </p>
                    )}

                  </form>
                ) : (
                  <p className="mt-4 text-center text-sm text-slate-600">
                    <Link
                      to="/signup"
                      state={{ mode: "signin" }}
                      onClick={() =>
                        setPostLoginRedirect(location.pathname)
                      }
                      className="font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Sign in
                    </Link>{" "}
                    to join the community and answer.
                  </p>
                )}

              </div>
            </>
          )}

        </div>

      </section>


      {/* Footer */}
      <Footer />

    </div>
  );
}

export default QuestionDetail;
