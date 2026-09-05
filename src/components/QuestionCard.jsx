import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatRelativeTime } from "../lib/relativeTime";
import SignInPopup from "./SignInPopup";

function QuestionCard({
  question,
  interactions,
  answerCount,
  highlighted,
  cardRef,
  currentUserId,
  onDeleted,
}) {
  const navigate = useNavigate();

  const isOwner = Boolean(currentUserId) && question.user_id === currentUserId;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEditClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/questions/${question.slug}`, { state: { startEdit: true } });
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleCancelDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleConfirmDelete = async (e) => {
    e.preventDefault();
    e.stopPropagation();
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

    onDeleted?.(question.id);
  };

  const {
    heartCounts,
    heartedByMe,
    heartPopupFor,
    setHeartPopupFor,
    handleHeartToggle,
    savedIds,
    justSavedId,
    savePopupFor,
    setSavePopupFor,
    handleSaveToggle,
    copiedId,
    handleShare,
  } = interactions;

  const isHearted = heartedByMe.has(question.id);
  const isSaved = savedIds.has(question.id);

  const titleRef = useRef(null);
  const [isTitleTruncated, setIsTitleTruncated] = useState(false);

  const descriptionRef = useRef(null);
  const [isDescriptionTruncated, setIsDescriptionTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (titleRef.current) {
        setIsTitleTruncated(
          titleRef.current.scrollHeight > titleRef.current.clientHeight + 1
        );
      }

      if (descriptionRef.current) {
        setIsDescriptionTruncated(
          descriptionRef.current.scrollHeight >
            descriptionRef.current.clientHeight + 1
        );
      }
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [question.title, question.description]);

  return (
    <Link
      ref={cardRef}
      to={`/questions/${question.slug}`}
      className={`block rounded-2xl border bg-white px-4 py-4 shadow-md shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-lg sm:px-5 sm:py-5 ${
        highlighted
          ? "border-blue-400 ring-2 ring-blue-200"
          : "border-slate-200/70"
      }`}
    >
      <h2
        ref={titleRef}
        className="line-clamp-2 text-lg font-bold leading-snug text-slate-900 sm:text-xl"
      >
        {question.title}
      </h2>

      {isTitleTruncated && (
        <span className="mt-0.5 block text-xs text-slate-400">
          See more
        </span>
      )}

      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
        {question.author_name || "Community Member"} ·{" "}
        {formatRelativeTime(question.created_at)} ·{" "}
        {(answerCount || 0) === 1 ? "1 Answer" : `${answerCount || 0} Answers`}
      </p>

      <p
        ref={descriptionRef}
        className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 sm:text-base"
      >
        {question.description}
      </p>

      {isDescriptionTruncated && (
        <span className="mt-0.5 block text-xs text-slate-400">
          See more
        </span>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <div className="flex items-center gap-1">

        <div className="relative">
          <button
            type="button"
            onClick={(e) => handleHeartToggle(e, question.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
              isHearted ? "text-red-600" : "text-slate-500"
            }`}
          >
            <span>{isHearted ? "❤️" : "🤍"}</span>
            <span>{heartCounts[question.id] || 0}</span>
          </button>

          {heartPopupFor === question.id && (
            <SignInPopup
              redirectState={{ scrollToId: question.id }}
              onClose={() => setHeartPopupFor(null)}
            />
          )}
        </div>

        <button
          type="button"
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
            onClick={(e) => handleShare(e, question)}
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

          {copiedId === question.id && (
            <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
              Copied link
            </span>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={(e) => handleSaveToggle(e, question.id)}
            aria-label={isSaved ? "Unsave question" : "Save question"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
              isSaved ? "text-blue-600" : "text-slate-500"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isSaved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
            </svg>
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          {justSavedId === question.id && (
            <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
              Saved
            </span>
          )}

          {savePopupFor === question.id && (
            <SignInPopup
              redirectState={{ scrollToId: question.id }}
              onClose={() => setSavePopupFor(null)}
            />
          )}
        </div>

      </div>

      {isOwner && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleEditClick}
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
            onClick={handleDeleteClick}
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
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-700">
            Are you sure? This cannot be undone.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Question"}
            </button>

            <button
              type="button"
              onClick={handleCancelDelete}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Link>
  );
}

export default QuestionCard;
