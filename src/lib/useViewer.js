import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { isRecruiterUser } from "./accountType";

// ===========================================================================
// Who is looking at a PUBLIC page, for display decisions only.
//
// WHY THIS HOOK EXISTS. Three public pages each resolved the viewer for
// themselves — `supabase.auth.getUser()`, keep the id, forget the rest — and
// the rule "a recruiter is not shown a candidate-only control" then had to be
// remembered separately at every one of them. It was applied at the header
// and missed at the footer, and applied at the job pages and missed at
// /questions. **Twice is a pattern, and the pattern is per-page duplication**,
// so the viewer is resolved in one place and the rule is asked of one value.
//
// NOT A SECURITY BOUNDARY, for the same reason `isRecruiterUser` is not: the
// value comes from `user_metadata`, which the client supplies at signup. It
// decides what is drawn, never what is permitted. Every real restriction is
// in the database.
//
// THE THREE STATES MATTER, and callers must not collapse them:
//
//   { resolved: false, userId: undefined, isRecruiter: false }  nothing known
//   { resolved: true,  userId: null,      isRecruiter: false }  signed out
//   { resolved: true,  userId: "...",     isRecruiter: bool  }  signed in
//
// `userId` stays `undefined` until resolved, because /gcc-jobs' empty state
// says something different to a visitor than to a signed-in member, and
// showing a member "join our community" for half a second before correcting
// it is worse than waiting half a second to say anything. That distinction
// predates this hook and is preserved exactly.
//
// A CANDIDATE-ONLY CONTROL RENDERS ON `resolved && !isRecruiter`, never on
// `!isRecruiter` alone. Before resolution `isRecruiter` is false, so the
// shorter test would draw the control and then take it away again — the same
// flash that moving the recruiter redirect out of Welcome.jsx and into
// ProtectedRoute existed to remove. The cost is that the control appears a
// moment after the page for everyone, which is already true of its state: a
// bookmark cannot know it is filled until the session resolves.
// ===========================================================================

export function useViewer() {
  const [viewer, setViewer] = useState({
    resolved: false,
    userId: undefined,
    isRecruiter: false,
  });

  useEffect(() => {
    let active = true;

    const apply = (user) => {
      if (!active) return;

      setViewer({
        resolved: true,
        userId: user?.id || null,
        isRecruiter: isRecruiterUser(user),
      });
    };

    supabase.auth.getUser().then(({ data }) => apply(data?.user));

    // Signing in or out on the page itself must move the control, not leave
    // the previous viewer's version of it on screen.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return viewer;
}

// The one question every candidate-only control asks. Keeping it as a named
// function rather than an inline `!isRecruiter` is what lets the route-link
// sweep in scripts/stage12-settings-test.mjs find every call site.
export function showsCandidateControls(viewer) {
  return viewer.resolved && !viewer.isRecruiter;
}
