// ===========================================================================
// The promo card at the top of /jobs, as pure logic.
//
// Rishi's decision, 24 Nov 2026: the board gets ONE placement -- a card on
// /jobs, where someone is already looking for work -- instead of the header
// link and homepage card round one shipped. Both of those were removed.
//
// His reason, which is the better argument: a nav item reaches people already
// looking for the board, and a homepage card reaches people who arrive at the
// homepage. Neither is a person in the middle of a job hunt. /jobs is.
//
// Everything that decides whether the card renders lives here rather than in
// the component, so it can be enumerated by scripts/stage10-promo-test.mjs
// instead of clicked at.
// ===========================================================================

// ---------------------------------------------------------------------------
// THE "NEW FEATURE" BADGE EXPIRES BY ITSELF.
//
// Rishi's decision, 24 Nov 2026: eight weeks, set at merge alongside
// LAST_UPDATED in src/Pages/Privacy.jsx.
//
// WHY A DATE AND NOT A ROLE COUNT. The badge's job is to make the ~2,520
// members who already know /jobs notice that the page has changed. They will
// nearly all have passed through within a few weeks, and after that it is
// talking to nobody. A role count measures supply, which is a different fact
// -- the board could hit 40 roles in a fortnight while the feature is still
// genuinely new, and worse, it would keep the badge shouting "New Feature"
// over an empty board, which is the one reading to avoid.
//
// WHY A DATE AND NOT A REMINDER. A badge that needs someone to remember to
// take it down is a badge that is still there in six months. This one comes
// off on its own: the comparison happens at render, so the live page drops it
// the moment the date passes, and the 02:00 rebuild refreshes the prerendered
// /jobs within a day.
//
// PLACEHOLDER -- eight weeks from the day this was written, so the badge is
// visible on the preview. CARRIED ITEM: reset at merge, same as LAST_UPDATED.
// The launch date is the only date eight weeks can honestly be measured from.
export const NEW_FEATURE_UNTIL = "2027-01-20";

// Rishi's wording, 24 Nov 2026, as written (heading and first sentence
// revised by him the same day). Kept here so the card and the
// test are reading the same strings.
// The heading is two-tone on screen -- "Exclusive" in navy, "GCC Jobs" in
// blue -- so it is stored as its two halves AND as the whole sentence. The
// test asserts the whole is the halves joined, which is what stops the
// rendered heading drifting from the string everything else reads.
const HEADING_LEAD = "Exclusive";
const HEADING_ACCENT = "GCC Jobs";

export const PROMO = {
  badge: "New Feature",
  headingLead: HEADING_LEAD,
  headingAccent: HEADING_ACCENT,
  heading: `${HEADING_LEAD} ${HEADING_ACCENT}`,
  illustration: "/exclusive-jobs-illustration.svg",
  body:
    "These jobs are posted directly to our community website. Search, " +
    "save, apply and track your application, all in one place.",
  linkLabel: "See exclusive jobs",
  to: "/gcc-jobs",
};

// ---------------------------------------------------------------------------
// Is the badge still in date?
//
// Compared as date-only strings, so it flips at the same moment for everyone
// regardless of timezone, and so an unparseable constant cannot be read as
// "forever". Anything it cannot make sense of means NO BADGE: the card still
// does its job without one, and a badge is the part that goes stale.
// ---------------------------------------------------------------------------
export function isNewFeature(now = new Date(), until = NEW_FEATURE_UNTIL) {
  if (typeof until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return false;
  }

  const today =
    now instanceof Date && !Number.isNaN(now.getTime())
      ? now.toISOString().slice(0, 10)
      : null;

  if (!today) return false;

  // Inclusive: the badge is still on during the whole of its last day.
  return today <= until;
}

// ---------------------------------------------------------------------------
// Three states, not a boolean, because "we have not found out yet" and "there
// are no roles" must not render the same way during prerendering.
//
//   "pending"  the count has not come back. Renders nothing visible, and the
//              prerender waits for this to resolve so the static /jobs
//              carries the right answer rather than whichever one won a race.
//   "show"     at least one live role.
//   "hide"     no live roles, or the count failed.
//
// FAIL CLOSED. An error means hide, not show. The card promises roles; the
// one outcome worse than a visitor not seeing it is a visitor clicking it
// into an empty board. That is the failure Rishi named, so it is the one the
// default has to avoid.
// ---------------------------------------------------------------------------
export function promoState({ loading, error, liveRoles } = {}) {
  if (loading) return "pending";
  if (error) return "hide";
  if (!Number.isFinite(liveRoles)) return "hide";
  return liveRoles > 0 ? "show" : "hide";
}
