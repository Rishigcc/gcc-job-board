import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchAuthorNames } from "../lib/authors";
import { formatRelativeTime } from "../lib/relativeTime";

const EVENTS_PER_TYPE = 30;
const MAX_LIST = 30;

function NotificationsBell({ userId }) {
  const navigate = useNavigate();

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

  // Badge: count hearts + answers on my questions since I last opened
  // the panel (excluding my own actions).
  const refreshUnreadCount = useCallback(async () => {
    const myQuestions = await loadMyQuestions();
    if (myQuestions.length === 0) {
      setUnreadCount(0);
      return;
    }

    const ids = myQuestions.map((q) => q.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("notifications_last_seen_at")
      .eq("id", userId)
      .maybeSingle();

    const lastSeen = profile?.notifications_last_seen_at;

    const heartsQuery = supabase
      .from("question_hearts")
      .select("*", { count: "exact", head: true })
      .in("question_id", ids)
      .neq("user_id", userId);

    const answersQuery = supabase
      .from("answers")
      .select("*", { count: "exact", head: true })
      .in("question_id", ids)
      .neq("user_id", userId);

    if (lastSeen) {
      heartsQuery.gt("created_at", lastSeen);
      answersQuery.gt("created_at", lastSeen);
    }

    const [heartsResult, answersResult] = await Promise.all([
      heartsQuery,
      answersQuery,
    ]);

    setUnreadCount((heartsResult.count || 0) + (answersResult.count || 0));
  }, [userId, loadMyQuestions]);

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

    const myQuestions = await loadMyQuestions();

    if (myQuestions.length === 0) {
      setNotifications([]);
      setListLoading(false);
      return;
    }

    const ids = myQuestions.map((q) => q.id);
    const questionById = {};
    for (const q of myQuestions) {
      questionById[q.id] = q;
    }

    const [heartsResult, answersResult] = await Promise.all([
      supabase
        .from("question_hearts")
        .select("question_id, user_id, created_at")
        .in("question_id", ids)
        .neq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(EVENTS_PER_TYPE),
      supabase
        .from("answers")
        .select("id, question_id, user_id, created_at")
        .in("question_id", ids)
        .neq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(EVENTS_PER_TYPE),
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

    const hearts = heartsResult.data || [];
    const answers = answersResult.data || [];

    const actorIds = [
      ...hearts.map((h) => h.user_id),
      ...answers.map((a) => a.user_id),
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
    ]
      .filter((e) => e.question)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_LIST);

    setNotifications(events);
    setListLoading(false);
  }, [userId, loadMyQuestions]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);

    if (next) {
      // Opening: load the list, then mark everything as seen so the
      // badge resets to what's new from here on.
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
    }
  };

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

    // For answer notifications, deep-link to the specific answer so the
    // detail page scrolls to it and briefly highlights it.
    if (n.type === "answer" && n.answerId) {
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
                        n.type === "heart"
                          ? "bg-red-50"
                          : "bg-blue-50"
                      }`}
                    >
                      {n.type === "heart" ? "❤️" : "💬"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-5 text-slate-700">
                        <span className="font-semibold text-slate-900">
                          {n.actorName}
                        </span>{" "}
                        {n.type === "heart"
                          ? "hearted your question"
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
