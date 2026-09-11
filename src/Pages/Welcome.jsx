import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import TrendingQuestionCard from "../components/TrendingQuestionCard";
import CyclingBrandHeading from "../components/CyclingBrandHeading";
import FeatureCard from "../components/FeatureCard";
import SignInPopup from "../components/SignInPopup";
import Seo from "../components/Seo";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ChatIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function BriefcaseIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function DocumentIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function PeopleIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg {...iconProps} width={14} height={14} strokeWidth={3} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Welcome() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const [hasAskedQuestion, setHasAskedQuestion] = useState(false);
  const [hasRepliedAnswer, setHasRepliedAnswer] = useState(false);

  const [hasShownResumeInterest, setHasShownResumeInterest] = useState(false);
  const [showResumeInterestPopup, setShowResumeInterestPopup] =
    useState(false);
  const [submittingResumeInterest, setSubmittingResumeInterest] =
    useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText("iworkatgcc.com");
      setLinkCopied(true);
    } catch (err) {
      console.error("Error copying link:", err);
    }
  };

  useEffect(() => {
    if (!linkCopied) return;

    const timeout = setTimeout(() => setLinkCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [linkCopied]);

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
      setUserEmail(user.email || "");

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
        } else {
          // Brand-new signup: fire the one-time welcome email. The
          // server enforces exactly-once via a race-safe DB claim, so
          // this is safe even if it somehow runs more than once.
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (session?.access_token) {
              fetch("/api/send-welcome-email", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }).catch((err) =>
                console.error("Error requesting welcome email:", err)
              );
            }
          } catch (err) {
            console.error("Error requesting welcome email:", err);
          }
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
    };

    syncGoogleProfile();
  }, []);

  // --------------------------------------------------
  // Community journey — real checks against existing data.
  // --------------------------------------------------

  useEffect(() => {
    if (!userId) return;

    const loadJourney = async () => {
      const [askedResult, repliedResult] = await Promise.all([
        supabase
          .from("questions")
          .select("id")
          .eq("user_id", userId)
          .limit(1),
        supabase
          .from("answers")
          .select("id")
          .eq("user_id", userId)
          .limit(1),
      ]);

      setHasAskedQuestion(Boolean(askedResult.data?.length));
      setHasRepliedAnswer(Boolean(repliedResult.data?.length));
    };

    loadJourney();
  }, [userId]);

  // --------------------------------------------------
  // GCC Resume Preparer — "show interest" upvote.
  // --------------------------------------------------

  useEffect(() => {
    if (!userId) return;

    const loadResumeInterest = async () => {
      const { data, error } = await supabase
        .from("resume_preparer_interest")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error checking resume interest:", error);
        return;
      }

      setHasShownResumeInterest(Boolean(data));
    };

    loadResumeInterest();
  }, [userId]);

  const handleResumeInterestClick = async () => {
    if (!userId) {
      setShowResumeInterestPopup(true);
      return;
    }

    if (hasShownResumeInterest || submittingResumeInterest) return;

    setSubmittingResumeInterest(true);

    const { error } = await supabase
      .from("resume_preparer_interest")
      .insert({ user_id: userId, email: userEmail });

    // A duplicate-insert race (e.g. a double click) is fine — it just
    // means the interest was already recorded.
    if (error && error.code !== "23505") {
      console.error("Error recording resume interest:", error);
      setSubmittingResumeInterest(false);
      return;
    }

    setHasShownResumeInterest(true);
    setSubmittingResumeInterest(false);
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

    navigate("/signup", { state: { mode: "signin" } });
  };

  const dotGridStyle = {
    backgroundImage:
      "radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)",
    backgroundSize: "20px 20px",
  };

  const journeySteps = [
    {
      key: "join",
      done: true,
      title: "Join the community",
      subtitle: "You're in! 🎉",
    },
    {
      key: "ask",
      done: hasAskedQuestion,
      title: "Ask your first question",
      subtitle: "Get advice from the community",
      to: "/ask",
    },
    {
      key: "reply",
      done: hasRepliedAnswer,
      title: "Reply your first answer",
      subtitle: "Help others with your knowledge",
      to: "/questions",
    },
  ];

  const journeyComplete = journeySteps.every((step) => step.done);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <Seo
        title="My Dashboard | iWorkAtGCC"
        description="Your iWorkAtGCC dashboard."
        path="/welcome"
        noindex
      />

      <SiteHeader />

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8">

        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 via-blue-50 to-white px-6 py-9 shadow-sm sm:px-10 sm:py-12">

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
            <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-purple-200/25 blur-3xl" />
            <div
              className="absolute right-10 top-8 hidden h-24 w-32 opacity-30 sm:block"
              style={dotGridStyle}
            />
          </div>

          <div className="relative max-w-2xl">
            <CyclingBrandHeading
              headingTag="p"
              phraseClassName="text-xs font-medium tracking-wide text-slate-500 sm:text-sm"
              headingClassName="text-2xl font-extrabold leading-tight tracking-tight text-blue-600 sm:text-3xl"
            />

            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Welcome, {userName || "there"}!
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              You're now part of a community of professionals who work in
              Global Capability Centers. Ask questions, share experiences,
              discover opportunities and grow your career — all in one
              place.
            </p>
          </div>

        </section>

        {/* Get started */}
        <section className="mt-9 sm:mt-12">

          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            iWorkAtGCC Community
          </h2>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Explore what you can do in the community
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">

            {/* Ask, Answer & Connect — same card as the main page */}
            <FeatureCard
              icon={ChatIcon}
              accent="purple"
              title="Ask, Answer & Connect"
              description="Have a GCC-related question? Ask the community or join an existing conversation."
              linkLabel="Ask a question"
              onClick={() => navigate("/questions")}
            />

            {/* Explore GCC Jobs — same card as the main page */}
            <FeatureCard
              icon={BriefcaseIcon}
              accent="blue"
              title="Explore GCC Jobs"
              description="Discover the latest job openings across Global Capability Centers in India"
              linkLabel="Browse latest jobs"
              onClick={() => navigate("/jobs")}
            />

            {/* GCC Resume Preparer — coming soon */}
            <div className="relative flex h-full flex-col rounded-2xl border border-green-200 bg-green-50/40 p-5 shadow-sm ring-1 ring-green-200">

              <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
                Coming soon
              </span>

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-600">
                <DocumentIcon />
              </div>

              <p className="mt-4 text-base font-bold text-slate-900">
                GCC Resume Preparer
              </p>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                Create a professional resume tailored for GCC roles
              </p>

              <div className="relative mt-auto pt-4">
                <button
                  type="button"
                  onClick={handleResumeInterestClick}
                  disabled={hasShownResumeInterest || submittingResumeInterest}
                  className={`flex items-center gap-1.5 text-sm font-semibold transition ${
                    hasShownResumeInterest
                      ? "text-green-700"
                      : "text-blue-700 hover:text-blue-800"
                  }`}
                >
                  {hasShownResumeInterest && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white">
                      <CheckIcon width={10} height={10} />
                    </span>
                  )}
                  {hasShownResumeInterest
                    ? "Interest shown"
                    : "Upvote to show interest"}
                </button>

                {showResumeInterestPopup && (
                  <SignInPopup
                    onClose={() => setShowResumeInterestPopup(false)}
                  />
                )}
              </div>
            </div>

          </div>

        </section>

        {/* Popular discussions + Community journey */}
        <section
          className={
            journeyComplete
              ? "mt-9 sm:mt-12"
              : "mt-9 grid gap-6 sm:mt-12 lg:grid-cols-3"
          }
        >

          {/* Popular discussions */}
          <div
            className={
              journeyComplete ? "flex" : "flex lg:col-span-2 lg:items-center"
            }
          >
            <TrendingQuestionCard desktopIntervalMultiplier={1} />
          </div>

          {/* Your community journey */}
          {!journeyComplete && (
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">

              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Your community journey
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                A few ways to make the most of iWorkAtGCC
              </p>

              <div className="mt-4 space-y-4">
                {journeySteps.map((step) => {
                  const content = (
                    <>
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          step.done
                            ? "bg-blue-600 text-white"
                            : "border-2 border-slate-200 text-transparent"
                        }`}
                      >
                        <CheckIcon />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {step.title}
                        </p>
                        <p className="text-sm text-slate-500">
                          {step.subtitle}
                        </p>
                      </div>
                    </>
                  );

                  if (step.to && !step.done) {
                    return (
                      <Link
                        key={step.key}
                        to={step.to}
                        className="flex items-start gap-3 transition hover:opacity-75"
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      {content}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </section>

        {/* Grow Your Community */}
        <section className="mt-9 flex flex-col items-center gap-4 rounded-2xl bg-indigo-50/70 px-5 py-5 text-center sm:mt-12 sm:flex-row sm:justify-between sm:text-left sm:px-7">

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
              <PeopleIcon />
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900 sm:text-base">
                Share our community with those who may need it
              </p>
              <p className="text-sm text-slate-500">
                Ask. Share. Learn. Grow. Together.
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
            >
              Share the community →
            </button>

            {linkCopied && (
              <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow sm:left-auto sm:right-0 sm:translate-x-0">
                Link Copied
              </span>
            )}
          </div>

        </section>

        {/* Feedback */}
        <section className="mt-9 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm sm:mt-12 sm:px-6 sm:py-7">

          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 sm:h-12 sm:w-12">
            <ChatIcon />
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
              href="mailto:feedback@iworkatgcc.com"
              className="font-semibold text-blue-600 transition hover:text-blue-700"
            >
              feedback@iworkatgcc.com
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
