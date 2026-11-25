import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/password   ->   two actions behind one function
//
//   { action: "request", email }   ask for a reset link
//   { action: "may-set" }          may THIS session set a password?
//                                  (Authorization: Bearer <access token>)
//
// WHY THEY SHARE A FILE
//   Vercel's Hobby plan allows 12 serverless functions per deployment and
//   the project reached 14, so the build stopped. Rishi, 25 Nov 2026: "I'm
//   not upgrading to Pro. Consolidate."
//
//   THE DISPATCH IS THE POINT, not the saving. One slot is one slot; a file
//   that branches on an `action` is a file the NEXT endpoint can join
//   instead of adding a fifteenth. That is what stops the count growing --
//   carried item 22's admin-set-password tool, if it is ever built, is an
//   action on api/admin.js rather than a new file.
//
// WHY THESE TWO AND NOT OTHERS
//   They are the two newest and neither is signed off, so this merge was
//   done first on purpose -- if the consolidation breaks something, it
//   should break the code written yesterday rather than the code that
//   handles people's resumes. api/delete-my-data.js was deliberately left
//   out of the whole exercise: it erases people's data and the merge would
//   have bought exactly one slot.
//
// THEY DO NOT SHARE AN AUTH MODEL, AND THAT IS DELIBERATE
//   "request" takes no token -- the person asking cannot sign in, which is
//   the entire problem. "may-set" requires one, because the only account it
//   will answer about is the bearer's own. Each action checks what it needs;
//   nothing is checked once and assumed for both.
// ===========================================================================

// Padded to this on every "request" path. Comfortably longer than the gate,
// and long enough to cover most of an SMTP send, which is the slow half.
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

function serviceClient(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ===========================================================================
// ACTION: request  ->  { ok: true }, always
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
//   wording names the resend-confirmation path, because the endpoint cannot.
//
// THE TIMING FLOOR, AND WHAT IT ACTUALLY PROTECTS
//   An identical body is no use if the eligible path takes a second and the
//   rest return instantly: the duration IS the answer. So every path does the
//   same gate call, and every response is padded to the same floor.
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
//   hammering it -- only database load, which the gate is cheap enough to
//   absorb. If that ever stops being true, the fix belongs at the edge.
//
//   No logging of the address. The verdict is logged because it is useful
//   when a recruiter says "nothing arrived"; the address is not, because a
//   log of who asked for a reset is a record nobody needs. What was sent is
//   in Brevo's log already.
// ===========================================================================
async function requestReset(req, res, body, env) {
  const startedAt = Date.now();

  // THE ONE REPLY for this action. Every outcome below goes through here, so
  // there is one place to read and no path that can answer differently by
  // accident.
  const sameReply = async (verdict, sent) => {
    console.log(
      `[password:request] verdict=${verdict} sent=${sent} ` +
        `elapsed=${Date.now() - startedAt}ms`
    );
    await padTo(startedAt, FLOOR_MS);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  };

  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!looksLikeEmail(email)) {
    return sameReply("malformed", false);
  }

  // --- the gate -----------------------------------------------------------
  // Service key, because reset_eligibility_for_email is granted to
  // service_role alone. It returns a word, never a user: no id, no email,
  // no row.
  const admin = serviceClient(env.url, env.serviceKey);

  const { data: verdict, error: gateError } = await admin.rpc(
    "reset_eligibility_for_email",
    { p_email: email }
  );

  if (gateError) {
    // FAIL CLOSED. An unreadable gate means no email: sending one anyway
    // would be the single thing this action exists to prevent.
    console.error("[password:request] gate failed:", gateError.message);
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
  const anon = createClient(env.url, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: sendError } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${originOf(req)}${LANDING_PATH}`,
  });

  if (sendError) {
    // Still the same reply. A failure here is ours, and telling the browser
    // about it would say "this address was eligible", which is precisely the
    // fact being withheld.
    console.error("[password:request] send failed:", sendError.message);
    return sameReply("eligible", false);
  }

  return sameReply("eligible", true);
}

// ===========================================================================
// ACTION: may-set  ->  { allowed: true | false }
//
// Asked by the reset landing page about ITS OWN signed-in account, before it
// shows a password form.
//
// WHY IT EXISTS
//   A recovery link establishes a session, and then the browser could call
//   supabase.auth.updateUser({ password }) for any account. The account that
//   must NOT be allowed to is an OAuth-only one: setting a password there
//   gives a Google account a second sign-in method nobody asked for -- the
//   identity-linking risk from stage 3, and the reason the reset gate has an
//   identity half as well as a role half.
//
//   It asks the same function "request" asks, so the two cannot disagree
//   about who may reset. That is the real reason they belong in one file.
//
// WHY THIS IS NOT AN ENUMERATION ORACLE
//   It answers only about the bearer token's own account. There is no email
//   in the request: the address is read from the verified token server-side.
//   To ask about somebody else you would need their session, at which point
//   you have their account and this answer is the least of it.
//
// *** WHAT THIS DOES AND DOES NOT CLOSE ***
//   It stops the page offering a form it should not, which protects the
//   realistic case: a community member who receives an unexpected reset
//   email, clicks it, and would otherwise be handed a password field.
//
//   It does NOT stop a determined person calling Supabase's own updateUser
//   from the console with that session. That surface is Supabase's and
//   cannot be closed from here -- recorded in the stage 12 scope as accepted,
//   along with the reason the email itself carries a paragraph for someone
//   who signs in with Google.
// ===========================================================================
async function maySetPassword(req, res, env) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No session." });
  }

  const admin = serviceClient(env.url, env.serviceKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user?.email) {
    return res.status(401).json({ error: "That link has expired." });
  }

  const { data: verdict, error: gateError } = await admin.rpc(
    "reset_eligibility_for_email",
    { p_email: userData.user.email }
  );

  // FAIL CLOSED BY INITIALISATION, and ONE reply site for this action.
  //
  // The first version had two 200 replies here -- a gate-error branch and a
  // normal one -- which was correct but the wrong shape: a second reply site
  // is a second place a future edit can answer differently. Initialising to
  // false makes the unreadable-gate case fall out of the structure instead of
  // out of a branch, and the test asserts one 200 per action.
  let allowed = false;

  if (gateError) {
    // An unreadable gate means no form: offering one would be the thing
    // being prevented.
    console.error("[password:may-set] gate failed:", gateError.message);
  } else {
    allowed = verdict === "eligible";
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ allowed });
}

// ===========================================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const env = {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  if (!env.url || !env.serviceKey || !env.publishableKey) {
    console.error("[password] missing Supabase configuration");
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

  // THE ACTION IS REQUIRED AND UNKNOWN ONES ARE REFUSED LOUDLY.
  //
  // Not folded into "request" as a default: a client that forgets to send
  // the action would then silently ask for a reset with no email and get the
  // same cheerful reply as everyone else, and nobody would ever find out.
  // A 400 is a bug report.
  //
  // This reply does not vary with the email address, so it tells an attacker
  // nothing the identical-reply rule is protecting.
  switch (body?.action) {
    case "request":
      return requestReset(req, res, body, env);
    case "may-set":
      return maySetPassword(req, res, env);
    default:
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({ error: "Unknown action" });
  }
}
