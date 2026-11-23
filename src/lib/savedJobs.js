import { supabase } from "./supabase";

// ===========================================================================
// Reading the saved list.
//
// THIS IS AN RPC AND NOT A SELECT, FOR ONE REASON
//   public.jobs has a select policy built on private.job_is_public(), so a
//   role that has closed, expired, been hidden or whose recruiter has been
//   suspended is simply not returned to the browser. A join from job_saves
//   would therefore drop exactly the rows this page exists to explain, and
//   the count on /profile -- which counts job_saves rows -- would disagree
//   with the page it links to.
//
//   public.my_saved_jobs() is a definer function that returns every save with
//   an availability of 'open', 'closed' or 'withdrawn', withholding the
//   posting's own words for the last of those. See migration 020.
//
// REMOVING A SAVE IS A PLAIN DELETE
//   Nothing privileged about it: the delete policy on job_saves is
//   auth.uid() = user_id, so the database is what makes it the caller's own
//   row. user_id is passed so the statement is specific, not because passing
//   a different one would achieve anything.
// ===========================================================================

export async function fetchSavedJobs() {
  const { data, error } = await supabase.rpc("my_saved_jobs");

  if (error) return { rows: [], error };

  return { rows: data || [], error: null };
}

export async function removeSavedJob(jobId, userId) {
  const { error } = await supabase
    .from("job_saves")
    .delete()
    .eq("job_id", jobId)
    .eq("user_id", userId);

  return { error };
}
