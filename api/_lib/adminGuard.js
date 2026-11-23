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
//   So the token is verified with the service key, and the admin question is
//   asked with the service key too -- not through the caller's own session,
//   which would be reading a permission from the thing being permitted.
//
//   The database function re-checks the actor independently. Two checks for
//   one decision is right here: this one produces a useful HTTP status, and
//   that one is the lock.
//
// WHY A FUNCTION AND NOT A TABLE READ
//   The first version read public.user_roles with the service key and
//   returned 502 to everyone, admin included: this project grants
//   service_role nothing by default, so that read was 42501. Granting
//   service_role SELECT on user_roles would have fixed it and widened the one
//   table whose entire design is that almost nothing can read it. So the
//   question is asked through public.is_admin_user(uuid), which is granted to
//   service_role only. Migration 015.
//
// EVERY FAILURE LOOKS LIKE A MISSING ROUTE
//   Not an admin, a broken lookup, a bad token: all 404 "Not found.", because
//   anything else confirms the endpoint exists. The previous message --
//   "We could not confirm your account" -- told an anonymous caller both that
//   the route was real and that it had tried to check them.
//
//   The cost is that a genuine outage is indistinguishable from "not an
//   admin" in the response. That is why the two cases log differently: the
//   response is for the caller, the log is for us.
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

  const { data: isAdmin, error: roleError } = await admin.rpc("is_admin_user", {
    p_user: userId,
  });

  if (roleError) {
    // An outage, a missing migration, a revoked grant. The caller is told
    // nothing; this line is how we find out.
    console.error("admin guard: is_admin_user failed", roleError);
    return { status: 404, error: "Not found." };
  }

  if (!isAdmin) {
    // A real non-admin. Logged at a lower level, and distinguishable from the
    // case above, because one of them is a bug and the other is Tuesday.
    console.log(`admin guard: refused non-admin ${userId}`);
    return { status: 404, error: "Not found." };
  }

  return { userId };
}
