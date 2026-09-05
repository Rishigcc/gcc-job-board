import { useEffect, useState } from "react";
import { useQuestionHearts } from "./useQuestionHearts";
import { useQuestionSaves } from "./useQuestionSaves";

export function useQuestionCardInteractions(userId, questionIds) {
  const { heartCounts, heartedByMe, toggleHeart } = useQuestionHearts(
    userId,
    questionIds
  );
  const { savedIds, toggleSave, justSavedId } = useQuestionSaves(
    userId,
    questionIds
  );

  const [heartPopupFor, setHeartPopupFor] = useState(null);
  const [savePopupFor, setSavePopupFor] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!copiedId) return;

    const timeout = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(timeout);
  }, [copiedId]);

  const handleHeartToggle = (e, questionId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      setHeartPopupFor(questionId);
      return;
    }

    toggleHeart(questionId);
  };

  const handleSaveToggle = (e, questionId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      setSavePopupFor(questionId);
      return;
    }

    toggleSave(questionId);
  };

  const handleShare = async (e, question) => {
    e.preventDefault();
    e.stopPropagation();

    const url = `${window.location.origin}/questions/${question.slug}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(question.id);
    } catch (err) {
      console.error("Error copying link:", err);
    }
  };

  return {
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
  };
}
