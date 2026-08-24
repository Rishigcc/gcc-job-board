import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Footer from "../components/Footer";

function Welcome() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState(null);

  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [upvoteLoading, setUpvoteLoading] = useState(false);

  const FEATURE_NAME = "ask_answer_connect";

  useEffect(() => {
    const syncGoogleProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Error getting user:", userError);
        return;
      }

      if (!user) {
        return;
      }

      setUserId(user.id);

      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "";

      const firstName = fullName.trim().split(/\s+/)[0] || "";

      const formattedFirstName =
        firstName.charAt(0).toUpperCase() +
        firstName.slice(1).toLowerCase();

      setUserName(formattedFirstName);

      // Check if profile already exists
      const { data: existingProfile, error: profileError } =
        await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) {
        console.error("Error checking profile:", profileError);
        return;
      }

      // Google profile information
      const googleProfile = {
        id: user.id,
        google_display_name: fullName,
        google_email: user.email || "",
        google_avatar_url:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null,
        updated_at: new Date().toISOString(),
      };

      if (!existingProfile) {
        // First login — create profile
        const { error: insertError } = await supabase
          .from("profiles")
          .insert(googleProfile);

        if (insertError) {
          console.error("Error creating profile:", insertError);
        }
      } else {
        // Returning user — update ONLY Google fields
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            google_display_name: googleProfile.google_display_name,
            google_email: googleProfile.google_email,
            google_avatar_url: googleProfile.google_avatar_url,
            updated_at: googleProfile.updated_at,
          })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating Google profile:", updateError);
        }
      }

      // --------------------------------------------------
      // Load user's upvote status
      // --------------------------------------------------

      const { data: existingInterest, error: interestError } =
        await supabase
          .from("feature_interest")
          .select("id")
          .eq("user_id", user.id)
          .eq("feature_name", FEATURE_NAME)
          .maybeSingle();

      if (interestError) {
        console.error("Error checking upvote:", interestError);
      } else {
        setHasUpvoted(!!existingInterest);
      }

      // --------------------------------------------------
      // Load total upvote count
      // --------------------------------------------------

      const { count, error: countError } = await supabase
        .from("feature_interest")
        .select("id", { count: "exact", head: true })
        .eq("feature_name", FEATURE_NAME);

      if (countError) {
        console.error("Error getting upvote count:", countError);
      } else {
        setUpvoteCount(count || 0);
      }
    };

    syncGoogleProfile();
  }, []);

  // --------------------------------------------------
  // Handle Upvote
  // --------------------------------------------------

  const handleUpvote = async () => {
    if (!userId || hasUpvoted || upvoteLoading) {
      return;
    }

    setUpvoteLoading(true);

    const { error } = await supabase
      .from("feature_interest")
      .insert({
        user_id: userId,
        feature_name: FEATURE_NAME,
      });

    if (error) {
      // If the user has already upvoted, keep the UI in the
      // correct state rather than showing an error.
      if (error.code === "23505") {
        setHasUpvoted(true);
      } else {
        console.error("Error adding upvote:", error);
      }

      setUpvoteLoading(false);
      return;
    }

    setHasUpvoted(true);
    setUpvoteCount((currentCount) => currentCount + 1);
    setUpvoteLoading(false);
  };

  // --------------------------------------------------
  // Sign Out
  // --------------------------------------------------

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Sign out error:", error);
      return;
    }

    navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="mx-3 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:mx-5 sm:mt-5 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">

          <div className="text-xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            iWorkAtGCC
          </div>

          <button
            onClick={() => navigate("/")}
            className="shrink-0 rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 sm:px-7 sm:py-3 sm:text-lg"
          >
            🎓 &nbsp; Explore GCC Jobs
          </button>

        </div>
      </header>


      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-9 sm:px-6 sm:pb-20 sm:pt-16">

        {/* Thank You */}
        <section className="text-center">

          <p className="text-base font-semibold text-slate-600 sm:text-xl">
            Hi {userName || "there"}! 👋
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:mt-3 sm:text-3xl md:text-4xl">
            Thank You for Joining the
            <br className="hidden sm:block" />
            iWorkAtGCC Community! ❤️
          </h1>

        </section>


        {/* Benefits */}
        <section className="mt-9 sm:mt-12">

          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Benefits Unlocked
          </h2>

          <div className="mx-auto mt-6 max-w-2xl space-y-4 sm:mt-7">

            {/* Benefit 1 */}
            <div className="flex min-h-[96px] items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:gap-4 sm:px-5">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg">
                🔔
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900 sm:text-base">
                  Instant GCC Job Alerts
                </p>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  We will instantly notify you when new jobs go live.
                </p>
              </div>

            </div>


            {/* Benefit 2 */}
            <div className="flex min-h-[96px] items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:gap-4 sm:px-5">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-lg">
                📰
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900 sm:text-base">
                  Weekly GCC News Digest
                </p>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Receive the weekly GCC news digest with the latest updates,
                  trends, and developments.
                </p>
              </div>

            </div>


            {/* Benefit 3 */}
            <div className="relative rounded-2xl border-2 border-purple-200 bg-purple-50/40 px-4 py-6 shadow-md sm:min-h-[180px] sm:px-8 sm:py-8">

              {/* Coming Soon Badge */}
              <span className="absolute right-4 top-4 rounded-full bg-purple-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm sm:right-5 sm:top-5 sm:px-3 sm:text-xs">
                Coming Soon
              </span>


              {/* Heading & Description */}
              <div>

                <h2 className="text-lg font-bold leading-snug text-slate-900 sm:text-2xl">
                  Ask, Answer & Connect
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  Have a question about salaries, hike %, or your GCC career?
                  Post a question to the community or join an existing
                  conversation.
                </p>

              </div>


              {/* Upvote */}
              <div className="mt-5 flex items-center gap-2">

                <button
                  type="button"
                  onClick={handleUpvote}
                  disabled={hasUpvoted || upvoteLoading}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition sm:px-4 sm:text-sm ${
                    hasUpvoted
                      ? "border-purple-300 bg-purple-100 text-purple-700"
                      : "border-purple-300 bg-white text-purple-700 hover:bg-purple-50"
                  } ${
                    upvoteLoading
                      ? "cursor-wait opacity-70"
                      : hasUpvoted
                      ? "cursor-default"
                      : ""
                  }`}
                >
                  👍 &nbsp;
                  {upvoteLoading
                    ? "Saving..."
                    : hasUpvoted
                    ? "Interest shown"
                    : "Upvote to show interest"}
                </button>


                {/* Question Mark */}
                <div className="group relative">

                  <button
                    type="button"
                    aria-label="More information about upvoting"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-500 transition hover:border-purple-300 hover:text-purple-600"
                  >
                    ?
                  </button>


                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-3 hidden w-64 rounded-xl bg-slate-900 px-4 py-3 text-left text-xs leading-5 text-white shadow-lg group-hover:block sm:left-1/2 sm:w-72 sm:-translate-x-1/2">
                    Upvote to show your interest!{" "}
                    {upvoteCount > 0
                      ? `${upvoteCount}+ community ${
                          upvoteCount === 1 ? "member has" : "members have"
                        } already upvoted.`
                      : "Be one of the first community members to upvote."}{" "}
                    The more upvotes we get, the faster we can bring this
                    feature to you.
                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>


        {/* Grow Your Community */}
        <section className="mt-9 text-center sm:mt-10">

          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Grow Your Community
          </h2>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            Know someone who would benefit from our iWorkAtGCC community?
            Share it with them.
          </p>

          <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 shadow-sm">
            iworkatgcc.com
          </div>

        </section>


        {/* Feedback */}
        <section className="mt-9 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm sm:mt-10 sm:px-6 sm:py-7">

          {/* Feedback Icon */}
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-xl sm:h-12 sm:w-12 sm:text-2xl">
            💬
          </div>

          <h2 className="mt-4 text-lg font-bold text-slate-900 sm:text-2xl">
            Have any feedback or suggestions?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Have an idea, suggestion, or feedback that could help us improve
            the community?
          </p>

          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Write to{" "}
            <a
              href="mailto:rishi_nigam@outlook.com"
              className="font-semibold text-blue-600 transition hover:text-blue-700"
            >
              rishi_nigam@outlook.com
            </a>
          </p>

        </section>


        {/* Sign Out */}
        <div className="mt-8 text-center sm:mt-10">

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Sign Out
          </button>

        </div>

      </main>


      {/* Footer */}
      <Footer />

    </div>
  );
}

export default Welcome;