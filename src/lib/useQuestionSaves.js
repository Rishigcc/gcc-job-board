import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useQuestionSaves(userId, questionIds) {
  const [savedIds, setSavedIds] = useState(new Set());
  const [busyIds, setBusyIds] = useState(new Set());
  const [justSavedId, setJustSavedId] = useState(null);

  useEffect(() => {
    if (!justSavedId) return;

    const timeout = setTimeout(() => setJustSavedId(null), 1200);
    return () => clearTimeout(timeout);
  }, [justSavedId]);

  const idsKey = JSON.stringify(questionIds);

  useEffect(() => {
    if (!userId || questionIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedIds(new Set());
      return;
    }

    const loadSaves = async () => {
      const { data, error } = await supabase
        .from("question_saves")
        .select("question_id")
        .eq("user_id", userId)
        .in("question_id", questionIds);

      if (error) {
        console.error("Error loading saved questions:", error);
        return;
      }

      setSavedIds(new Set(data.map((row) => row.question_id)));
    };

    loadSaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, idsKey]);

  const toggleSave = async (questionId) => {
    if (!userId || busyIds.has(questionId)) return;

    setBusyIds((prev) => new Set(prev).add(questionId));

    const alreadySaved = savedIds.has(questionId);

    setSavedIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });

    if (!alreadySaved) {
      setJustSavedId(questionId);
    }

    if (alreadySaved) {
      const { error } = await supabase
        .from("question_saves")
        .delete()
        .eq("question_id", questionId)
        .eq("user_id", userId);

      if (error) {
        console.error("Error removing save:", error);
        setSavedIds((prev) => new Set(prev).add(questionId));
      }
    } else {
      const { error } = await supabase
        .from("question_saves")
        .insert({ question_id: questionId, user_id: userId });

      if (error && error.code !== "23505") {
        console.error("Error saving question:", error);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
        setJustSavedId((current) => (current === questionId ? null : current));
      }
    }

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  };

  return { savedIds, toggleSave, justSavedId };
}
