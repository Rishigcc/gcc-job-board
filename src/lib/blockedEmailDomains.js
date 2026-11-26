// Free email providers that cannot be used for a recruiter account.
//
// THIS LIST MUST STAY IN SYNC with the `blocked` array inside
// private.handle_new_recruiter() in supabase/migrations/001_job_board_foundation.sql.
// The database copy is the one that enforces the rule; this copy exists only
// so the form can show a useful message instead of a raw database error.
//
// Domain string match only. Deliberately no MX lookup: real companies run
// their own domains through Google Workspace and Zoho, and an MX check would
// reject them.
export const BLOCKED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.in",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "ymail.com",
  "rocketmail.com",
  "rediffmail.com",
  "rediff.com",
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "pm.me",
  "icloud.com",
  "me.com",
  "mac.com",
  "zoho.com",
  "zohomail.com",
  "zoho.in",
  "aol.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "inbox.com",
  "fastmail.com",
  "tutanota.com",
];

export function emailDomainOf(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .split("@")[1] || "";
}

export function isBlockedEmailDomain(email) {
  const domain = emailDomainOf(email);
  return domain !== "" && BLOCKED_EMAIL_DOMAINS.includes(domain);
}

// Named so the recruiter knows which rule they hit and what to do about it,
// rather than failing silently or saying "invalid email".
export const BLOCKED_DOMAIN_MESSAGE =
  "Recruiter accounts need a work email address — free providers like Gmail, " +
  "Outlook, Yahoo, Rediffmail, Proton, iCloud and Zoho aren't accepted. If " +
  "your company uses its own domain through Google Workspace or Zoho, that " +
  "works fine. If you don't have a work address, email jobs@iworkatgcc.com " +
  "and we'll sort it out with you.";
