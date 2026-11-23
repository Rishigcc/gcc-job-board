import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ===========================================================================
// Saving a role for later.
//
// A DELIBERATE MIRROR OF useQuestionSaves + useQuestionCardInteractions
//   The community's save button has worked the same way for a long time:
//   optimistic update, reverse it if the write fails, and a signed-out press
//   opens the sign-in popup rather than doing nothing. Reusing the behaviour
//   means a candidate who already saves questions does not have to learn a
//   second thing, and means the only new code here is the table name.
//
//   The two hooks are merged into one because the question version is split
//   only so that hearts and saves can share a wrapper. There are no hearts on
//   a job.
//
// IT WRITES job_saves DIRECTLY, NOT THROUGH AN ENDPOINT
//   The table's three policies are all auth.uid() = user_id, so the database
//   is what stops one person saving on another's behalf -- not this file. A
//   tampered request reaches the same policy.
//
// WHAT IT IS NOT FOR
//   Reading the saved list. That needs roles the caller's own policy on
//   public.jobs hides (a closed or withdrawn role), so it goes through
//   public.my_saved_jobs(). See src/lib/savedJobs.js.
// ===========================================================================

export function useJobSaves(userId, jobIds) {
  const [savedIds, setSavedIds] = useState(new Set());
  const [busyIds, setBusyIds] = useState(new Set());
  const [justSavedId, setJustSavedId] = useState(null);
  const [popupFor, setPopupFor] = useState(null);

  // The "Saved" flash. Same 1.2s as the question card.
  useEffect(() => {
    if (!justSavedId) return undefined;

    const timeout = setTimeout(() => setJustSavedId(null), 1200);
    return () => clearTimeout(timeout);
  }, [justSavedId]);

  // Serialised, because a fresh array of the same ids on every render would
  // re-run the effect forever.
  const idsKey = JSON.stringify(jobIds);

  useEffect(() => {
    if (!userId || jobIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedIds(new Set());
      return;
    }

    let active = true;

    const loadSaves = async () => {
      const { data, error } = await supabase
        .from("job_saves")
        .select("job_id")
        .eq("user_id", userId)
        .in("job_id", jobIds);

      if (!active) return;

      if (error) {
        console.error("Error loading saved roles:", error);
        return;
      }

      setSavedIds(new Set(data.map((row) => row.job_id)));
    };

    loadSaves();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, idsKey]);

  const toggleSave = async (jobId) => {
    if (!userId || busyIds.has(jobId)) return;

    setBusyIds((prev) => new Set(prev).add(jobId));

    const alreadySaved = savedIds.has(jobId);

    // Optimistic: the button answers immediately, and is put back if the
    // database disagrees.
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

    if (!alreadySaved) setJustSavedId(jobId);

    if (alreadySaved) {
      const { error } = await supabase
        .from("job_saves")
        .delete()
        .eq("job_id", jobId)
        .eq("user_id", userId);

      if (error) {
        console.error("Error removing saved role:", error);
        setSavedIds((prev) => new Set(prev).add(jobId));
      }
    } else {
      const { error } = await supabase
        .from("job_saves")
        .insert({ job_id: jobId, user_id: userId });

      // 23505 is the composite primary key: it is already saved, which is the
      // state the button is now showing. Not an error to report.
      if (error && error.code !== "23505") {
        console.error("Error saving role:", error);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        setJustSavedId((current) => (current === jobId ? null : current));
      }
    }

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
  };

  const handleToggle = (e, jobId) => {
    // The card is wrapped in links. Without these the browser navigates to
    // the role instead of saving it.
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      setPopupFor(jobId);
      return;
    }

    toggleSave(jobId);
  };

  return { savedIds, justSavedId, popupFor, setPopupFor, handleToggle };
}
