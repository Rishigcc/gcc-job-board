import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { isRecruiterUser } from "../lib/accountType";

// Today's date in IST (YYYY-MM-DD). Used only as a client-side guard to
// avoid redundant network calls; the authoritative IST date is computed
// server-side in the record_activity() function.
function istToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

// Records one "active day" per signed-in user per IST day. Mounted once
// at the app root. Fire-and-forget: never blocks rendering, and the DB
// function is idempotent per day, so at worst this is a cheap no-op.
function ActivityTracker() {
  useEffect(() => {
    const record = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      // user_activity counts COMMUNITY active days: it feeds the digest's
      // active-user set and the community stats. A recruiter account has no
      // profiles row, so counting it would inflate both. Recruiters reach
      // this code because ActivityTracker is mounted at the app root and
      // runs on every page, including /recruiter.
      //
      // If one account ever needs to be both a candidate and a recruiter,
      // change this to key off the presence of a profiles row instead of
      // the account_type metadata.
      if (isRecruiterUser(session.user)) return;

      const today = istToday();

      try {
        if (localStorage.getItem("activity_recorded_on") === today) return;
      } catch {
        // localStorage unavailable — fall through and let the DB dedupe.
      }

      const { error } = await supabase.rpc("record_activity");

      if (error) {
        console.error("Error recording activity:", error);
        return;
      }

      try {
        localStorage.setItem("activity_recorded_on", today);
      } catch {
        // Ignore storage failures; the DB has already deduped.
      }
    };

    record();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") record();
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}

export default ActivityTracker;
