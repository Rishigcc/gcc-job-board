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
// Playwright and saves the HTML, and it waits for this attribute to stop
// saying "pending" before it saves. Without it the save races the count: the
// static /jobs would carry the card on some builds and not others, with
// nothing to show which had happened. With it, the prerendered page always
// states the answer that was true at build time, and the live query corrects
// it on hydration if a role was posted since.
//
// COLOUR, revised 24 Nov 2026. Amber first, and Rishi was right about it:
// "it reads as a warning rather than an announcement." Yellow is the colour
// this site uses for nothing, and the colour the whole web uses for caution.
//
// So: blue into purple, both already in use on the homepage cards, with no
// new hue introduced -- the design pass is still deferred until every stage
// is done, and this must not pre-empt it.
//
// It is the SATURATION that does the work rather than the hue. Everything
// else on /jobs is a white card or the pale blue Notify Me box directly
// below, so a filled, shadowed panel reads as an announcement at a glance
// while still being the site's own blue. The gradient and the two blurred
// highlights are there for depth, which was the other half of the note:
// flat colour reads as a notice, a lit surface reads as a feature.
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
          className="group relative mb-8 block overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 px-6 py-7 shadow-lg shadow-blue-900/20 transition hover:shadow-xl hover:shadow-blue-900/30 sm:px-8"
        >
          {/* Depth, not decoration: two soft highlights so the panel reads as
              a lit surface rather than a block of flat colour. aria-hidden
              and pointer-events-none -- they are lighting, not content. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-purple-300/20 blur-2xl"
          />

          <div className="relative">
            {showBadge ? (
              <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-white/30">
                {PROMO.badge}
              </span>
            ) : null}

            <h2
              className={`text-xl font-bold tracking-tight text-white sm:text-2xl ${
                showBadge ? "mt-3" : ""
              }`}
            >
              {PROMO.heading}
            </h2>

            {/* No max-width. It had one, and on a wide screen it wrapped
                "all in one place" onto a second line with half the line above
                it empty. The card is already inside the page's max-w-6xl
                column, so that was a second constraint doing nothing but
                breaking the sentence. */}
            <p className="mt-2 text-[15px] leading-relaxed text-blue-50">
              {PROMO.body}
            </p>

            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
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
                className="transition-transform group-hover:translate-x-0.5"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </Link>
      ) : null}
    </div>
  );
}

export default BoardPromoCard;
