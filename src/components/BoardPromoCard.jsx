import { Link } from "react-router-dom";
import { PROMO, isNewFeature, promoState } from "../lib/boardPromo";
import { trackEvent } from "../analytics";

// ===========================================================================
// The board's one entrance: a card at the top of /jobs.
//
// THE WRAPPER ALWAYS RENDERS, even when there is no card inside it, and it
// carries data-board-promo="pending" | "show" | "hide".
//
// That attribute is not decoration. scripts/prerender.mjs renders /jobs with
// Playwright and saves the HTML, and it now waits for this attribute to stop
// saying "pending" before it saves. Without it the save races the count: the
// static /jobs would carry the card on some builds and not others, with
// nothing to show which had happened. With it, the prerendered page always
// states the answer that was true at build time, and the live query corrects
// it on hydration if a role was posted since.
//
// COLOUR. Amber, against the white job cards and the blue Notify Me box
// below it -- distinct, as Rishi asked, without inventing an identity. The
// real palette (muted plum, mauve, warm rose, amber accents) comes at the
// design stage, and amber is the one accent already named in it, so this is
// the choice least likely to need undoing.
// ===========================================================================

function BoardPromoCard({ loading, error, liveRoles }) {
  const state = promoState({ loading, error, liveRoles });
  const showBadge = isNewFeature();

  return (
    <div data-board-promo={state}>
      {state === "show" ? (
        <Link
          to={PROMO.to}
          onClick={() => trackEvent("exclusive_jobs_promo_clicked")}
          className="mb-8 block rounded-2xl border border-amber-300 bg-amber-50 px-6 py-6 transition hover:border-amber-400 hover:bg-amber-100/70"
        >
          {showBadge ? (
            <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {PROMO.badge}
            </span>
          ) : null}

          <h2
            className={`text-lg font-bold text-slate-900 md:text-xl ${
              showBadge ? "mt-3" : ""
            }`}
          >
            {PROMO.heading}
          </h2>

          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-700">
            {PROMO.body}
          </p>

          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            {PROMO.linkLabel}
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
      ) : null}
    </div>
  );
}

export default BoardPromoCard;
