import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// Proving the caller is an admin, server-side.
//
// Under api/_lib/ so Vercel does not route it: it exports no handler.
//
// WHY THE ENDPOINTS CANNOT JUST TRUST A CLIENT CLAIM
//   Both admin endpoints finish by calling a function that is granted to
//   service_role only and takes an actor id. If the endpoint passed whatever
//   the browser said, that id would be a client-supplied fact and the audit
//   log would record fiction.
//
//   So the token is verified with the service key, and the admin row is read
//   with the service key too -- not through the caller's own session, which
//   would be reading a permission from the thing being permitted.
//
//   The database function re-checks the actor independently. Two checks for
//   one decision is right here: this one produces a useful HTTP status, and
//   that one is the lock.
// ===========================================================================

export function serviceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Returns { admin, userId } or { status, error }. Never throws.
export async function requireAdmin(req, admin) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { status: 401, error: "Sign in again and retry." };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user) {
    return { status: 401, error: "Your session has expired. Sign in again." };
  }

  const userId = userData.user.id;

  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    console.error("admin guard: role lookup failed", roleError);
    return { status: 502, error: "We could not confirm your account. Try again." };
  }

  if (!role) {
    // Deliberately the same shape of answer a missing route would give. An
    // endpoint that says "you are not an admin" confirms the endpoint exists.
    return { status: 404, error: "Not found." };
  }

  return { userId };
}
