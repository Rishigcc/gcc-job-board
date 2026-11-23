import { supabase } from "./supabase";

// ===========================================================================
// The reporting reads for /admin.
//
// Every one is an RPC. The admin SELECT policies already permit the underlying
// reads, so nothing here is unlocked -- the functions exist so an aggregate
// returns counts, rather than a client-side group-by shipping every
// candidate's name and email to a browser in order to count them.
//
// AND ONE RULE: EVERY NUMBER HAS EXACTLY ONE SOURCE. The Overview does not
// derive its figures by summing what the Roles table returned. If it did, the
// two would eventually disagree. fetchReportTotals() is that single source.
// ===========================================================================

function describe(error, fallback) {
  if (!error) return null;
  if (error.code === "P0001") return { message: error.message, detail: null };
  return { message: fallback, detail: error.message };
}

// A report returning no rows means "you are not an admin", not "there is
// nothing". The page never has to tell those apart -- it is inside the admin
// gate already -- but the distinction is why this returns null rather than
// inventing zeroes.
export async function fetchReportTotals() {
  const { data, error } = await supabase.rpc("admin_report_totals");

  if (error) return { error: describe(error, "The overview could not be loaded.") };
  return { totals: (data && data[0]) || null };
}

export async function fetchRoleStats() {
  const { data, error } = await supabase.rpc("admin_role_stats");

  if (error) return { error: describe(error, "The role report could not be loaded.") };
  return { rows: data || [] };
}

export async function fetchRecruiterStats() {
  const { data, error } = await supabase.rpc("admin_recruiter_stats");

  if (error) return { error: describe(error, "The recruiter report could not be loaded.") };
  return { rows: data || [] };
}

export async function fetchCandidateStats() {
  const { data, error } = await supabase.rpc("admin_candidate_stats");

  if (error) return { error: describe(error, "The candidate report could not be loaded.") };
  return { rows: data || [] };
}

// The only call in the stage that returns an email address, and it needs a
// specific candidate id. Opening one person is a deliberate act; browsing 900
// of them is not something this page offers.
export async function fetchCandidateDetail(candidateId) {
  const { data, error } = await supabase.rpc("admin_candidate_detail", {
    p_candidate_id: candidateId,
  });

  if (error) return { error: describe(error, "That candidate could not be loaded.") };
  return { rows: data || [] };
}
