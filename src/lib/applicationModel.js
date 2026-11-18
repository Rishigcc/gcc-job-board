// ===========================================================================
// What an application must contain, and the rules it has to satisfy.
//
// Pure: it imports nothing but jobOptions, so it runs in plain Node and the
// cases can be enumerated rather than clicked through. applications.js
// imports the Supabase client, which needs a browser to exist at all --
// which is why these live apart from it.
//
// Every rule mirrors a CHECK constraint on public.applications in migration
// 007. The database stays the enforcement; this is what turns a constraint
// name into a sentence.
// ===========================================================================

import { NOTICE_PERIODS } from "./jobOptions";

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

// Mirrors the CHECK constraints on public.applications. Same contract as the
// posting form: the database stays the enforcement, this turns a constraint
// name into a sentence.
// `hasResumeOnFile` is the one rule that is not a CHECK constraint, because
// the resume is no longer a column on the application at all (migration 008).
// It lives on the candidate, and applying to a second role reuses it. So the
// form needs a file only when there is nothing on file yet -- and the
// database enforces the same thing from the other side: private
// .applications_guard() refuses an insert by a candidate with no resume row.
export function validateApplication(v, { hasResumeOnFile = false } = {}) {
  const e = {};

  const name = (v.full_name || "").trim();
  if (name.length < 2) e.full_name = "Enter your full name.";
  else if (name.length > 120) e.full_name = "Keep your name to 120 characters or fewer.";

  const email = (v.email || "").trim();
  if (!email) e.email = "Enter the email address a recruiter should reply to.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "That does not look like an email address.";

  const phone = (v.phone || "").trim();
  if (phone && (phone.length < 6 || phone.length > 20)) {
    e.phone = "A phone number should be between 6 and 20 characters, or left blank.";
  }

  if (!v.notice_period) e.notice_period = "Choose your notice period.";
  else if (!NOTICE_PERIODS.some((n) => n.value === v.notice_period)) {
    e.notice_period = "Choose a notice period from the list.";
  }

  if (!v.resume && !hasResumeOnFile) e.resume = "Attach your resume as a PDF.";
  else if (v.resume && v.resume.size > MAX_RESUME_BYTES) {
    e.resume = "That file is larger than 2 MB. Most resumes are well under that.";
  }

  // Consent is a timestamp in the database, written by the server. Here it is
  // only the gate: the box has to be ticked before anything is sent.
  if (!v.consent) {
    e.consent = "Tick the box to confirm you are happy for us to share this with the recruiter.";
  }

  return e;
}

