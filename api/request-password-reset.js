import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/request-password-reset   ->   { ok: true }, always
//
// Body: { email }. The reply is IDENTICAL whatever happens, and that is the
// whole design rather than a detail of it.
//
// WHY THIS ENDPOINT EXISTS AT ALL
//   supabase.auth.resetPasswordForEmail() runs in the browser with the
//   publishable key and emails ANY existing account. It has no notion of a
//   role. Rishi's condition, 24 Nov 2026: a reset goes only to an account
//   with the recruiter role, and "everything else -- a community member's
//   email, an unknown address, no account at all -- gets no email and the
//   same reply."
//
//   So the decision is made here, with the service key, by
//   public.reset_eligibility_for_email() (migration 025), which reads
//   auth.users and public.user_roles -- neither of which a client may touch.
//
// *** THE REPLY IS THE SAME FOR EVERY OUTCOME ***
//
//   Same status, same body, every path:
//
//     eligible            an email is sent
//     role_not_eligible   a community member, or the admin
//     no_identity         an eligible role with no password (invariant I3)
//     none                no account on that address
//     a malformed address
//     the send itself failing
//
//   "I don't want this page to become a way of discovering which emails are
//   registered here" -- Rishi, 24 Nov 2026, the same position taken on the
//   admin endpoints and the one Supabase's own signup already takes.
//
//   ONE CONSEQUENCE, STATED SO IT IS NOT A SURPRISE: a recruiter who signed
//   up but never confirmed has no recruiter_profiles row, so no user_roles
//   row, so no email -- and this reply tells them nothing. The page's own
//   wording has to name the resend-confirmation path, because the endpoint
//   cannot.
//
// THE TIMING FLOOR, AND WHAT IT ACTUALLY PROTECTS
//   An identical body is no use if the eligible path takes a second and the
//   rest return instantly: the duration IS the answer. So every path does the
//   same RPC, and every response is padded to the same floor.
//
//   What it protects is NOT "does this address have an account" -- Supabase's
//   own /auth/v1/recover is open to anyone holding the publishable key and
//   answers identically, so that secret is not ours to keep. It protects the
//   secret this endpoint adds: WHETHER THAT ADDRESS HAS THE RECRUITER ROLE.
//
//   And it is mitigation, not elimination. Sending mail through SMTP has
//   variance a fixed floor cannot fully mask, so someone with many samples
//   could still see a difference. Written down rather than papered over.
//
// WHAT IS DELIBERATELY NOT HERE
//   No rate limiter. Supabase already enforces one reset per user per 60
//   seconds and 30 requests per 5 minutes per IP on the send itself, and
//   since every reply here is identical there is nothing to be learned by
//   hammering it -- only database load, which the RPC is cheap enough to
//   absorb. If that ever stops being true, the fix belongs at the edge, not
//   in this file.
//
//   No logging of the address. The verdict is logged because it is useful
//   when a recruiter says "nothing arrived"; the address is not, because a
//   log of who asked for a reset is a record nobody needs. What was sent is
//   in Brevo's log already.
// ===========================================================================

// Padded to this on every path. Comfortably longer than the RPC, and long
// enough to cover most of an SMTP send, which is the slow half.
const FLOOR_MS = 1200;

// The page that takes the token from the email and sets the new password.
// It MUST be on Supabase's Redirect URLs allowlist or the link in the email
// dead-ends -- Authentication -> URL Configuration. Added 25 Nov 2026 for
// the preview host, www.iworkatgcc.com and localhost.
const LANDING_PATH = "/recruiter/reset-password";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function padTo(startedAt, floorMs) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < floorMs) await sleep(floorMs - elapsed);
}

// Deliberately permissive: this is here to avoid a pointless round trip on
// obvious rubbish, NOT to judge the address. Anything that passes goes to the
// gate, and anything that fails gets the same reply as everything else.
function looksLikeEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
  );
}

function originOf(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const startedAt = Date.now();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // THE ONE REPLY. Every outcome below goes through here, so there is one
  // place to read and no path that can answer differently by accident.
  const sameReply = async (verdict, sent) => {
    console.log(
      `[request-password-reset] verdict=${verdict} sent=${sent} ` +
        `elapsed=${Date.now() - startedAt}ms`
    );
    await padTo(startedAt, FLOOR_MS);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  };

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !serviceKey || !publishableKey) {
    console.error("[request-password-reset] missing Supabase configuration");
    // NOT the same reply: this is our failure and the person should retry
    // rather than sit waiting for an email that was never going to arrive.
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "Server not configured" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!looksLikeEmail(email)) {
    return sameReply("malformed", false);
  }

  // --- the gate -----------------------------------------------------------
  // Service key, because the function is granted to service_role alone. It
  // returns a word, never a user: no id, no email, no row.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: verdict, error: gateError } = await admin.rpc(
    "reset_eligibility_for_email",
    { p_email: email }
  );

  if (gateError) {
    // FAIL CLOSED. An unreadable gate means no email: sending one anyway
    // would be the single thing this endpoint exists to prevent.
    console.error("[request-password-reset] gate failed:", gateError.message);
    return sameReply("gate_error", false);
  }

  if (verdict !== "eligible") {
    return sameReply(verdict || "unknown", false);
  }

  // --- the send -----------------------------------------------------------
  // The PUBLISHABLE key, not the service key. This is Supabase's own reset
  // flow: it mints the recovery token, applies its own rate limits, and
  // sends through the SMTP already configured for the signup email. Nothing
  // here composes or delivers mail, which is why this is the second
  // permitted email rather than a new sending path.
  const anon = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: sendError } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${originOf(req)}${LANDING_PATH}`,
  });

  if (sendError) {
    // Still the same reply. A failure here is ours, and telling the browser
    // about it would say "this address was eligible", which is precisely the
    // fact being withheld.
    console.error("[request-password-reset] send failed:", sendError.message);
    return sameReply("eligible", false);
  }

  return sameReply("eligible", true);
}
