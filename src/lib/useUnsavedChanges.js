import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ===========================================================================
// "You have not finished this role" -- stop a half-filled form being thrown
// away by a stray click.
//
// The posting form is long. Losing it does not cost a recruiter a retype; it
// costs the posting, because they give up.
//
// TWO SEPARATE MECHANISMS, because the browser gives us no single one:
//
//   closing or reloading the tab, or following a link off the site
//       `beforeunload`. The browser writes the wording, not us -- that is
//       deliberate on the browser's part and cannot be overridden.
//
//   following a link inside the site
//       A capture-phase click listener on `document`. React attaches its own
//       listeners to the root element, which sits below `document`, so a
//       capture listener here runs first and `stopPropagation()` keeps the
//       click from ever reaching React Router's <Link>. The destination is
//       held, a real dialog is shown, and the navigation is replayed only if
//       the person chooses to leave.
//
// WHAT IS NOT COVERED: the browser's Back button.
//   Blocking that needs React Router's useBlocker, which only exists on a
//   data router (createBrowserRouter). This app uses <BrowserRouter> with
//   <Routes>, so useBlocker would throw. Converting the app to a data router
//   is a change to every route on the site, community pages included, and is
//   not worth making from inside the posting form. The alternative -- pushing
//   a sentinel entry onto the history stack and catching popstate -- corrupts
//   the Back button for everything after it. So Back is a known gap, stated
//   rather than papered over.
// ===========================================================================

export function useUnsavedChanges(active) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);

  // Set once the person has said "leave", so neither mechanism fires again
  // during the navigation itself.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!active) return undefined;

    const onBeforeUnload = (event) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  // Registered only while there is something to lose, and re-registered when
  // that flips, which keeps `active` out of a ref read during render.
  useEffect(() => {
    if (!active) return undefined;

    const onClick = (event) => {
      if (leavingRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // mailto:, tel: and anything on another origin are left alone --
      // beforeunload already covers leaving the site.
      if (url.origin !== window.location.origin) return;

      const here = window.location.pathname + window.location.search;
      if (url.pathname + url.search === here) return;

      event.preventDefault();
      event.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  const leave = useCallback(() => {
    const to = pending;
    leavingRef.current = true;
    setPending(null);
    if (to) navigate(to);
  }, [navigate, pending]);

  const stay = useCallback(() => setPending(null), []);

  return { pending, leave, stay };
}
