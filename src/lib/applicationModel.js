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

// ---------------------------------------------------------------------------
// Phone numbers.
//
// Optional -- a candidate who would rather not give one still applies. But
// "777777" was being accepted, and a recruiter who cannot reach someone does
// not go looking for the real number; the application is simply dead.
//
// STRICTER THAN THE DATABASE, ON PURPOSE. The CHECK constraint is only
// "length between 6 and 20", because a constraint has to hold for every row
// ever written and a phone format is a product decision that may change. So
// this is the one rule here that does not mirror a constraint -- it narrows.
//
// WHAT COUNTS
//   Ten digits, first one 6-9. That is the whole of the Indian mobile range;
//   nothing else is a mobile number.
//   Optionally prefixed +91, 91 or 0, which is how people actually write it.
//   Spaces and hyphens anywhere, which is also how people actually write it.
//
// WHAT IS DELIBERATELY REJECTED
//   Landlines, mostly. The field asks for a mobile and a recruiter will text
//   or call one. Someone whose only number is a landline leaves it blank and
//   is contacted by email, which is the required field.
//
//   "Mostly", because of one hole that cannot be closed. A landline fails on
//   the digit after the trunk zero -- 011 Delhi, 022 Mumbai, 0484 Kochi --
//   but 08x and 09x codes do not. "080 2555 1234" is exactly as many digits
//   as a mobile written "0 8025551234", so nothing can separate a Bangalore
//   landline from a mobile with a leading zero. Accepting the leading zero
//   was the requirement, and this is the right way for the error to fall: a
//   real mobile is never refused, and the cost of the rare landline getting
//   through is one recruiter dialling a desk.
// ---------------------------------------------------------------------------
export function isIndianMobile(input) {
  const compact = (input || "").replace(/[\s-]/g, "");
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(compact);
}

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
  if (phone) {
    // The 20-character ceiling is the database's (CHECK length between 6 and
    // 20), and it is checked first so the form can never accept something the
    // insert would then refuse with a constraint name -- "+91 9-8-7-6-5-4-3-2
    // -1-0" is a valid mobile written in 24 characters.
    if (phone.length > 20) {
      e.phone = "That is longer than we can store. Write the number without extra spacing.";
    } else if (!isIndianMobile(phone)) {
      e.phone =
        "Enter a 10-digit Indian mobile number, like 98765 43210. " +
        "+91 or a leading 0 is fine. Leave it blank if you would rather not give one.";
    }
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

