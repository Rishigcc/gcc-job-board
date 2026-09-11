import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchAuthorNames } from "../lib/authors";
import { formatRelativeTime } from "../lib/relativeTime";

const EVENTS_PER_TYPE = 30;
const MAX_LIST = 30;

function NotificationsBell({ userId }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Fetch my question ids/titles/slugs — shared by both the badge count
  // and the list build.
  const loadMyQuestions = useCallback(async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("id, title, slug")
      .eq("user_id", userId);

    if (error) {
      console.error("Error loading your questions:", error);
      return [];
    }

    return data || [];
  }, [userId]);

  // Fetch my answer ids/question ids — shared by both the badge count
  // and the list build.
  const loadMyAnswers = useCallback(async () => {
    const { data, error } = await supabase
      .from("answers")
      .select("id, question_id")
      .eq("user_id", userId);

    if (error) {
      console.error("Error loading your answers:", error);
      return [];
    }

    return data || [];
  }, [userId]);

  // A head-only count query, short-circuited to 0 when there are no ids
  // to filter on (an empty .in() is otherwise a wasted round trip).
  const countSince = (table, column, ids, userId, lastSeen) => {
    if (ids.length === 0) return Promise.resolve(0);

    const query = supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, ids)
      .neq("user_id", userId);

    if (lastSeen) query.gt("created_at", lastSeen);

    return query.then((res) => res.count || 0);
  };

  // Badge: count hearts + answers on my questions, and hearts on my
  // answers, since I last opened the panel (excluding my own actions).
  const refreshUnreadCount = useCallback(async () => {
    const [myQuestions, myAnswers] = await Promise.all([
      loadMyQuestions(),
      loadMyAnswers(),
    ]);

    const qIds = myQuestions.map((q) => q.id);
    const aIds = myAnswers.map((a) => a.id);

    if (qIds.length === 0 && aIds.length === 0) {
      setUnreadCount(0);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("notifications_last_seen_at")
      .eq("id", userId)
      .maybeSingle();

    const lastSeen = profile?.notifications_last_seen_at;

    const [questionHearts, answers, answerHearts] = await Promise.all([
      countSince("question_hearts", "question_id", qIds, userId, lastSeen),
      countSince("answers", "question_id", qIds, userId, lastSeen),
      countSince("answer_hearts", "answer_id", aIds, userId, lastSeen),
    ]);

    setUnreadCount(questionHearts + answers + answerHearts);
  }, [userId, loadMyQuestions, loadMyAnswers]);

  useEffect(() => {
    if (!userId) return;
    // refreshUnreadCount only setState()s after awaited network calls,
    // not synchronously within this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUnreadCount();
  }, [userId, refreshUnreadCount]);

  // Build the list of individual notification events.
  const loadNotifications = useCallback(async () => {
    setListLoading(true);

    const [myQuestions, myAnswers] = await Promise.all([
      loadMyQuestions(),
      loadMyAnswers(),
    ]);

    if (myQuestions.length === 0 && myAnswers.length === 0) {
      setNotifications([]);
      setListLoading(false);
      return;
    }

    const qIds = myQuestions.map((q) => q.id);
    const aIds = myAnswers.map((a) => a.id);

    const questionById = {};
    for (const q of myQuestions) {
      questionById[q.id] = q;
    }

    // My answers' parent questions aren't necessarily mine to have loaded
    // above — fetch title/slug for whichever of those aren't already known.
    const answerQuestionIds = [...new Set(myAnswers.map((a) => a.question_id))];
    const missingQuestionIds = answerQuestionIds.filter(
      (id) => !questionById[id]
    );

    if (missingQuestionIds.length > 0) {
      const { data, error } = await supabase
        .from("questions")
        .select("id, title, slug")
        .in("id", missingQuestionIds);

      if (error) {
        console.error("Error loading answered questions:", error);
      } else {
        for (const q of data || []) {
          questionById[q.id] = q;
        }
      }
    }

    const answerById = {};
    for (const a of myAnswers) {
      answerById[a.id] = a;
    }

    const emptyResult = Promise.resolve({ data: [], error: null });

    const [heartsResult, answersResult, answerHeartsResult] = await Promise.all([
      qIds.length > 0
        ? supabase
            .from("question_hearts")
            .select("question_id, user_id, created_at")
            .in("question_id", qIds)
            .neq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(EVENTS_PER_TYPE)
        : emptyResult,
      qIds.length > 0
        ? supabase
            .from("answers")
            .select("id, question_id, user_id, created_at")
            .in("question_id", qIds)
            .neq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(EVENTS_PER_TYPE)
        : emptyResult,
      aIds.length > 0
        ? supabase
            .from("answer_hearts")
            .select("answer_id, user_id, created_at")
            .in("answer_id", aIds)
            .neq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(EVENTS_PER_TYPE)
        : emptyResult,
    ]);

    if (heartsResult.error) {
      console.error("Error loading heart notifications:", heartsResult.error);
    }
    if (answersResult.error) {
      console.error(
        "Error loading answer notifications:",
        answersResult.error
      );
    }
    if (answerHeartsResult.error) {
      console.error(
        "Error loading answer heart notifications:",
        answerHeartsResult.error
      );
    }

    const hearts = heartsResult.data || [];
    const answers = answersResult.data || [];
    const answerHearts = answerHeartsResult.data || [];

    const actorIds = [
      ...hearts.map((h) => h.user_id),
      ...answers.map((a) => a.user_id),
      ...answerHearts.map((h) => h.user_id),
    ];
    const actorNames = await fetchAuthorNames(actorIds);

    const events = [
      ...hearts.map((h) => ({
        key: `heart-${h.question_id}-${h.user_id}-${h.created_at}`,
        type: "heart",
        actorName: actorNames[h.user_id] || "Someone",
        question: questionById[h.question_id],
        createdAt: h.created_at,
      })),
      ...answers.map((a) => ({
        key: `answer-${a.id}`,
        type: "answer",
        actorName: actorNames[a.user_id] || "Someone",
        question: questionById[a.question_id],
        answerId: a.id,
        createdAt: a.created_at,
      })),
      ...answerHearts.map((h) => ({
        key: `answer-heart-${h.answer_id}-${h.user_id}-${h.created_at}`,
        type: "answer_heart",
        actorName: actorNames[h.user_id] || "Someone",
        question: questionById[answerById[h.answer_id]?.question_id],
        answerId: h.answer_id,
        createdAt: h.created_at,
      })),
    ]
      .filter((e) => e.question)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_LIST);

    setNotifications(events);
    setListLoading(false);
  }, [userId, loadMyQuestions, loadMyAnswers]);

  // Opening the panel: load the list, then mark everything as seen so
  // the badge resets to what's new from here on.
  const openPanel = useCallback(async () => {
    setOpen(true);
    loadNotifications();

    const { error } = await supabase
      .from("profiles")
      .update({ notifications_last_seen_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("Error updating notifications last seen:", error);
    } else {
      setUnreadCount(0);
    }
  }, [userId, loadNotifications]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    openPanel();
  };

  // Auto-open when arriving via the digest email's CTA
  // (/profile/asked?notifications=open), then strip the param so a
  // refresh or back-navigation doesn't re-open it.
  useEffect(() => {
    if (!userId) return;
    if (searchParams.get("notifications") !== "open") return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    openPanel();

    const next = new URLSearchParams(searchParams);
    next.delete("notifications");
    setSearchParams(next, { replace: true });
  }, [userId, searchParams, openPanel, setSearchParams]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleNotificationClick = (n) => {
    setOpen(false);

    // For answer and answer-heart notifications, deep-link to the specific
    // answer so the detail page scrolls to it and briefly highlights it.
    if ((n.type === "answer" || n.type === "answer_heart") && n.answerId) {
      navigate(`/questions/${n.question.slug}`, {
        state: { scrollToAnswerId: n.answerId },
      });
    } else {
      navigate(`/questions/${n.question.slug}`);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed left-1/2 top-20 z-50 max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:-translate-x-0"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
          </div>

          {listLoading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${
                        n.type === "heart" || n.type === "answer_heart"
                          ? "bg-red-50"
                          : "bg-blue-50"
                      }`}
                    >
                      {n.type === "heart" || n.type === "answer_heart"
                        ? "❤️"
                        : "💬"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-5 text-slate-700">
                        <span className="font-semibold text-slate-900">
                          {n.actorName}
                        </span>{" "}
                        {n.type === "heart"
                          ? "hearted your question"
                          : n.type === "answer_heart"
                            ? "hearted your answer on"
                            : "answered your question"}{" "}
                        <span className="font-medium text-slate-900">
                          &lsquo;{n.question.title}&rsquo;
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationsBell;
