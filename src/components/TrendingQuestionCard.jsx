import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchAuthorNames } from "../lib/authors";
import { useQuestionCardInteractions } from "../lib/useQuestionCardInteractions";
import SignInPopup from "./SignInPopup";

const TRENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SPOTLIGHT_SIZE = 3;
const SPOTLIGHT_INTERVAL_MS = 4000;

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

function TrendingQuestionCard({ desktopIntervalMultiplier = 5 }) {
  const [spotlightUserId, setSpotlightUserId] = useState(null);
  const [spotlightQuestions, setSpotlightQuestions] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightVisible, setSpotlightVisible] = useState(true);
  const [spotlightPaused, setSpotlightPaused] = useState(false);

  // Desktop (md breakpoint and up) gets a longer loop time than mobile/tablet.
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = (e) => setIsDesktop(e.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSpotlightUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const loadSpotlight = async () => {
      const { data: questions, error } = await supabase
        .from("questions")
        .select("id, title, description, created_at, user_id, slug, tags")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error || !questions || questions.length === 0) {
        setSpotlightLoading(false);
        return;
      }

      const ids = questions.map((q) => q.id);
      const sevenDaysAgo = new Date(
        Date.now() - TRENDING_WINDOW_MS
      ).toISOString();

      const [heartsResult, answersResult] = await Promise.all([
        supabase
          .from("question_hearts")
          .select("question_id")
          .in("question_id", ids)
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("answers")
          .select("question_id")
          .in("question_id", ids)
          .gte("created_at", sevenDaysAgo),
      ]);

      const scores = {};

      for (const row of heartsResult.data || []) {
        scores[row.question_id] = (scores[row.question_id] || 0) + 1;
      }

      for (const row of answersResult.data || []) {
        scores[row.question_id] = (scores[row.question_id] || 0) + 1;
      }

      const trending = questions
        .filter((q) => scores[q.id] > 0)
        .sort((a, b) => {
          const diff = (scores[b.id] || 0) - (scores[a.id] || 0);
          if (diff !== 0) return diff;
          return new Date(b.created_at) - new Date(a.created_at);
        })
        .slice(0, SPOTLIGHT_SIZE);

      const trendingIds = new Set(trending.map((q) => q.id));

      const latestFill = questions
        .filter((q) => !trendingIds.has(q.id))
        .slice(0, SPOTLIGHT_SIZE - trending.length);

      const finalList = [...trending, ...latestFill];

      const authorNames = await fetchAuthorNames(
        finalList.map((q) => q.user_id)
      );

      setSpotlightQuestions(
        finalList.map((q) => ({
          ...q,
          author_name: authorNames[q.user_id] || "Community Member",
        }))
      );
      setSpotlightLoading(false);
    };

    loadSpotlight();
  }, []);

  const spotlightIds = useMemo(
    () => spotlightQuestions.map((q) => q.id),
    [spotlightQuestions]
  );
  const spotlightInteractions = useQuestionCardInteractions(
    spotlightUserId,
    spotlightIds
  );

  const heroDescriptionRef = useRef(null);
  const [isHeroDescriptionTruncated, setIsHeroDescriptionTruncated] =
    useState(false);

  useEffect(() => {
    if (spotlightQuestions.length < 2 || spotlightPaused) return;

    let fadeInTimeout;
    const intervalMs = isDesktop
      ? SPOTLIGHT_INTERVAL_MS * desktopIntervalMultiplier
      : SPOTLIGHT_INTERVAL_MS;

    const interval = setInterval(() => {
      setSpotlightVisible(false);

      fadeInTimeout = setTimeout(() => {
        setSpotlightIndex((i) => (i + 1) % spotlightQuestions.length);
        setSpotlightVisible(true);
      }, 300);
    }, intervalMs);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeInTimeout);
    };
  }, [
    spotlightQuestions.length,
    spotlightPaused,
    isDesktop,
    desktopIntervalMultiplier,
  ]);

  // Guard against a stale index if a spotlighted question gets deleted
  // between renders (setSpotlightQuestions shrinking the array before
  // the cycling effect above has a chance to wrap the index).
  const safeSpotlightIndex =
    spotlightQuestions.length === 0
      ? 0
      : spotlightIndex % spotlightQuestions.length;

  useEffect(() => {
    const node = heroDescriptionRef.current;
    if (!node) return;

    const checkTruncation = () => {
      setIsHeroDescriptionTruncated(
        node.scrollHeight > node.clientHeight + 1
      );
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [safeSpotlightIndex, spotlightQuestions]);

  if (!spotlightLoading && spotlightQuestions.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full">

      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-br from-blue-200/50 via-indigo-200/40 to-purple-200/40 blur-2xl" />

      <div
        onMouseEnter={() => setSpotlightPaused(true)}
        onMouseLeave={() => setSpotlightPaused(false)}
        className="relative flex h-72 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-indigo-50/40 to-blue-50/30 p-4 shadow-xl shadow-slate-200/60 sm:p-5"
      >

        {/* Faint decorative shapes — purely visual */}
        <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rotate-6 rounded-2xl bg-indigo-200/30" />
        <div className="pointer-events-none absolute -right-1 top-6 h-10 w-10 -rotate-6 rounded-xl bg-blue-200/30" />
        <div className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-40 rounded-full bg-blue-100/50 blur-2xl" />

        <div className="relative inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50 py-1 pl-1 pr-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-500">
            <PeopleIcon width={11} height={11} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Questions asked by the community
          </span>
        </div>

        {spotlightLoading ? (
          <div className="mt-2 flex flex-1 flex-col">
            <div className="h-12 space-y-2 py-1">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200/70" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200/70" />
            </div>
            <div className="mt-1.5 h-5">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70" />
            </div>
            <div className="mt-1.5 h-10 space-y-2 py-0.5">
              <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200/70" />
            </div>
            <div className="mt-1.5 border-t border-slate-200/70 pt-2">
              <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200/70" />
            </div>
            <div className="mt-auto flex justify-end">
              <div className="h-4 w-28 animate-pulse rounded bg-slate-200/70" />
            </div>
          </div>
        ) : (
          <>
            <div
              className={`relative mt-2 flex flex-col overflow-hidden transition-opacity duration-300 ${
                spotlightVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <Link
                to={`/questions/${spotlightQuestions[safeSpotlightIndex].slug}`}
                className="block h-12 line-clamp-2 text-lg font-extrabold leading-snug tracking-tight text-slate-900 transition hover:text-blue-700"
              >
                {spotlightQuestions[safeSpotlightIndex].title}
              </Link>

              <p className="mt-1.5 h-5 truncate text-sm text-slate-500">
                {spotlightQuestions[safeSpotlightIndex].author_name}
              </p>

              <p
                ref={heroDescriptionRef}
                className="mt-1.5 h-10 line-clamp-2 text-sm leading-5 text-slate-600"
              >
                {spotlightQuestions[safeSpotlightIndex].description}
              </p>

              <div className="h-4">
                {isHeroDescriptionTruncated && (
                  <Link
                    to={`/questions/${spotlightQuestions[safeSpotlightIndex].slug}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    See more →
                  </Link>
                )}
              </div>

              <div className="mt-1.5 border-t border-slate-200/70 pt-2">
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) =>
                        spotlightInteractions.handleHeartToggle(
                          e,
                          spotlightQuestions[safeSpotlightIndex].id
                        )
                      }
                      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition hover:bg-white/70 ${
                        spotlightInteractions.heartedByMe.has(
                          spotlightQuestions[safeSpotlightIndex].id
                        )
                          ? "text-red-600"
                          : "text-slate-500"
                      }`}
                    >
                      <span>
                        {spotlightInteractions.heartedByMe.has(
                          spotlightQuestions[safeSpotlightIndex].id
                        )
                          ? "❤️"
                          : "🤍"}
                      </span>
                      <span>
                        {spotlightInteractions.heartCounts[
                          spotlightQuestions[safeSpotlightIndex].id
                        ] || 0}
                      </span>
                    </button>

                    {spotlightInteractions.heartPopupFor ===
                      spotlightQuestions[safeSpotlightIndex].id && (
                      <SignInPopup
                        redirectState={{
                          scrollToId:
                            spotlightQuestions[safeSpotlightIndex].id,
                        }}
                        onClose={() =>
                          spotlightInteractions.setHeartPopupFor(null)
                        }
                      />
                    )}
                  </div>

                  <span className="h-4 w-px bg-slate-200" />

                  <Link
                    to={`/questions/${spotlightQuestions[safeSpotlightIndex].slug}`}
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-white/70"
                  >
                    <ChatIcon width={14} height={14} />
                    Reply
                  </Link>

                  <span className="h-4 w-px bg-slate-200" />

                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) =>
                        spotlightInteractions.handleShare(
                          e,
                          spotlightQuestions[safeSpotlightIndex]
                        )
                      }
                      aria-label="Copy question link"
                      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-white/70"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" />
                      </svg>
                      Share
                    </button>

                    {spotlightInteractions.copiedId ===
                      spotlightQuestions[safeSpotlightIndex].id && (
                      <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
                        Copied link
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-auto flex justify-end">
              <Link
                to="/questions"
                className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
              >
                View all questions →
              </Link>
            </div>
          </>
        )}

      </div>

    </div>
  );
}

export default TrendingQuestionCard;
