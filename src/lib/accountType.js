// Is this signed-in user a recruiter?
//
// Recruiters are identified by the `account_type` written into auth
// user_metadata at signup (see src/Pages/PostAJob.jsx).
//
// IMPORTANT: this is a DISPLAY and ROUTING hint only. It is never a security
// boundary. user_metadata is supplied by the client at signup, so a
// determined person could put anything in it. Every real restriction lives
// in the database -- row-level security plus the `user_roles` and
// `recruiter_profiles` tables, none of which any client can write.
//
// Kept in one place so the call sites cannot drift apart:
//   - src/main.jsx                      (send recruiters to /recruiter)
//   - src/Pages/Welcome.jsx             (leave before a profiles row is made)
//   - src/components/SiteHeader.jsx     (Settings in place of Profile)
//   - src/components/Footer.jsx         (the same, in the Account column)
//   - src/components/RecruiterRoute.jsx (guard the recruiter area)
//   - src/Pages/PostAJob.jsx            (already-signed-in notice)
//   - src/lib/useViewer.js              (the viewer of a PUBLIC page)
//
// THE RULE THE LIST EXISTS FOR, written down because keeping the list was
// not enough on its own:
//
//   A recruiter is shown no candidate-only control and no link to a route
//   that blockRecruiters closes.
//
// It was applied at the header and missed at the footer, then applied at the
// job pages and missed at /questions. Both were found by sweeping for links
// to the seven closed routes, on 25 Nov 2026, and both had the same cause:
// the rule lived in whoever remembered it. A PUBLIC page now asks
// `useViewer()` rather than resolving the viewer itself, and
// `scripts/stage12-settings-test.mjs` holds a table of every file that links
// to one of the seven — a new link fails the suite until it is classified.
//
// The single place `account_type` is WRITTEN is the signUp call in
// src/Pages/PostAJob.jsx.
export function isRecruiterUser(user) {
  return user?.user_metadata?.account_type === "recruiter";
}
