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
// Kept in one place so the five call sites cannot drift apart:
//   - src/main.jsx                      (send recruiters to /recruiter)
//   - src/Pages/Welcome.jsx             (leave before a profiles row is made)
//   - src/components/SiteHeader.jsx     (hide the community nav items)
//   - src/components/RecruiterRoute.jsx (guard the recruiter area)
//   - src/Pages/PostAJob.jsx            (already-signed-in notice)
//
// The single place `account_type` is WRITTEN is the signUp call in
// src/Pages/PostAJob.jsx.
export function isRecruiterUser(user) {
  return user?.user_metadata?.account_type === "recruiter";
}
