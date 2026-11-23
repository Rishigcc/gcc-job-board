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
// EVERY FAILURE LOOKS LIKE A MISSING ROUTE -- EVERY ONE.
//   No token, a malformed token, an expired token, a broken lookup, a real
//   non-admin: all 404 "Not found.", identical bodies, no headers that differ.
//   Anything else confirms the endpoint exists.
//
//   This took two passes to get right, which is the point of writing it down.
//   The first version returned 502 "We could not confirm your account", which
//   announced both that the route was real and that it had tried to check the
//   caller. The second fixed that and left 401 "Sign in again and retry." on
//   the missing-token path -- which announces exactly the same thing to
//   exactly the same anonymous caller. A rule like this is only true if it has
//   no exceptions, and "mostly 404" is worth nothing.
//
//   The cost is that a genuine outage is indistinguishable from "not an admin"
//   IN THE RESPONSE. That is why the cases log differently: the response is
//   for the caller, the log is for us. And the common case of an admin whose
//   session has gone is caught earlier and more usefully, in postAsAdmin() in
//   src/lib/adminData.js, which checks for a session before it sends anything.
// ===========================================================================

export function serviceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// The single answer every failure gives. One function so a later edit cannot
// reintroduce a distinguishable response on one path and not the others.
export const notFound = () => ({ status: 404, error: "Not found." });

// Returns { userId } or { status, error }. Never throws.
export async function requireAdmin(req, admin) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    // An anonymous probe. Told nothing at all -- not even that signing in is
    // the thing it is missing.
    return notFound();
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user) {
    console.log("admin guard: rejected token");
    return notFound();
  }

  const userId = userData.user.id;

  const { data: isAdmin, error: roleError } = await admin.rpc("is_admin_user", {
    p_user: userId,
  });

  if (roleError) {
    // An outage, a missing migration, a revoked grant. The caller is told
    // nothing; this line is how we find out.
    console.error("admin guard: is_admin_user failed", roleError);
    return notFound();
  }

  if (!isAdmin) {
    // A real non-admin. Logged at a lower level, and distinguishable from the
    // case above, because one of them is a bug and the other is Tuesday.
    console.log(`admin guard: refused non-admin ${userId}`);
    return notFound();
  }

  return { userId };
}
