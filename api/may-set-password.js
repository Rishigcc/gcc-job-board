import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/may-set-password   ->   { allowed: true | false }
//
// Asked by the reset landing page about ITS OWN signed-in account, before it
// shows a password form. Authorization: Bearer <the caller's access token>.
//
// WHY IT EXISTS
//   A recovery link establishes a session, and then the browser could call
//   supabase.auth.updateUser({ password }) for any account. The account that
//   must NOT be allowed to is an OAuth-only one: setting a password there
//   gives a Google account a second sign-in method nobody asked for -- the
//   identity-linking risk from stage 3, and the reason the reset gate has an
//   identity half as well as a role half.
//
//   The decision is the same one api/request-password-reset.js makes, from
//   the same function, so the two cannot disagree about who may reset.
//
// WHY THIS IS NOT AN ENUMERATION ORACLE
//   It answers only about the bearer token's own account. There is no email
//   in the request: the address is read from the verified token server-side.
//   To ask about somebody else you would need their session, at which point
//   you have their account and this answer is the least of it.
//
// *** WHAT THIS DOES AND DOES NOT CLOSE ***
//   It stops the page offering a form it should not, which is what protects
//   the realistic case: a community member who receives an unexpected reset
//   email, clicks it, and would otherwise be handed a password field.
//
//   It does NOT stop a determined person calling Supabase's own updateUser
//   from the console with that session. That surface is Supabase's and
//   cannot be closed from here -- recorded in the stage 12 scope as accepted,
//   along with the reason the email itself carries a paragraph for someone
//   who signs in with Google.
// ===========================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("[may-set-password] missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No session." });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user?.email) {
    return res.status(401).json({ error: "That link has expired." });
  }

  const { data: verdict, error: gateError } = await admin.rpc(
    "reset_eligibility_for_email",
    { p_email: userData.user.email }
  );

  if (gateError) {
    // FAIL CLOSED, the same direction as the request endpoint. An unreadable
    // gate means no form: offering one would be the thing being prevented.
    console.error("[may-set-password] gate failed:", gateError.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ allowed: false });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ allowed: verdict === "eligible" });
}
