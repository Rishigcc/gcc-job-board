// ===========================================================================
// How many roles the board is showing, for the promo card on /jobs.
//
// ONE RPC, NOT A COUNT ON public.jobs. Postgres ORs a table's SELECT
// policies together, so a plain count returns a different number depending
// on who asks: a visitor gets the public roles, a recruiter also gets their
// own pending and expired ones, and the admin gets every row in the table.
// Rishi is the admin, so a plain count would have shown HIM a card promising
// roles over an empty board -- the exact failure the rule exists to prevent.
//
// public.live_job_count() (migration 022) is security definer, takes no
// arguments, and applies the same private.job_is_public() the public read
// policy uses, so the card and /gcc-jobs cannot disagree about what counts
// as live.
//
// WHAT THIS COSTS. /jobs makes no database query at all today -- it fetches
// the static /data/jobs.json -- so this is one added request per page load:
// a single integer, fired in the same effect as that fetch rather than after
// it, so it adds no serial latency and nothing on the page waits for it.
// ===========================================================================

import { supabase } from "./supabase";

export async function fetchLiveRoleCount() {
  const { data, error } = await supabase.rpc("live_job_count");

  if (error) return { liveRoles: null, error };

  // PostgREST returns a scalar function's result as a bare number, but a
  // null or a string here must not be read as "some roles exist".
  const count = typeof data === "number" ? data : Number(data);

  if (!Number.isFinite(count)) {
    return { liveRoles: null, error: new Error("live_job_count returned " + data) };
  }

  return { liveRoles: count, error: null };
}
