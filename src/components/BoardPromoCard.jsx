import { Link } from "react-router-dom";
import { PROMO, isNewFeature, promoState } from "../lib/boardPromo";
import { trackEvent } from "../analytics";

// ===========================================================================
// The board's one entrance: a feature-announcement banner at the top of
// /jobs. Text left, Rishi's illustration right, and the whole thing is one
// link.
//
// THE WRAPPER ALWAYS RENDERS, even when there is no card inside it, and it
// carries data-board-promo="pending" | "show" | "hide".
//
// That attribute is not decoration. scripts/prerender.mjs renders /jobs with
// Playwright and saves the HTML, and it waits for this attribute to stop
// saying "pending" before it saves. Without it the save races the count: the
// static /jobs would carry the card on some builds and not others, with
// nothing to show which had happened.
//
// COLOUR, third version. Amber read as a warning; a saturated blue-purple
// panel read as too heavy. This one is Rishi's brief: near-white on the left
// warming into pale blue and teal on the right, so the text side stays
// high-contrast and the illustration sits on the tinted half. No new hue --
// blue and teal are both in the illustration he drew, which is what the
// gradient is tuned to rather than to a palette of my own.
//
// THE CTA IS A SPAN, NOT A BUTTON. The whole card is a link, and a <button>
// inside an <a> is invalid HTML -- a nested interactive element, which
// screen readers and keyboard navigation both handle badly. It is styled as
// a button and the card around it is the click target, so there is one
// thing to click and one thing to announce rather than two.
//
// ON PHONES THE ILLUSTRATION IS NOT RENDERED AT ALL. Rishi: "I'd rather lose
// the artwork than squeeze it." md:block, not a scaled-down copy, so a phone
// does not download 4KB it will never show.
// ===========================================================================

function MegaphoneIcon(props) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function BoardPromoCard({ loading, error, liveRoles }) {
  const state = promoState({ loading, error, liveRoles });
  const showBadge = isNewFeature();

  return (
    <div data-board-promo={state}>
      {state === "show" ? (
        <Link
          to={PROMO.to}
          onClick={() => trackEvent("exclusive_jobs_promo_clicked")}
          className="group relative mb-8 block overflow-hidden rounded-3xl bg-gradient-to-r from-white via-blue-50 to-teal-100 shadow-lg shadow-blue-900/5 ring-1 ring-inset ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/10"
        >
          <div className="grid gap-6 px-6 py-7 sm:px-8 md:grid-cols-[1fr_auto] md:items-center md:gap-8">

            {/* ---------- Text ---------- */}
            <div>
              {showBadge ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-200/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-950">
                  <MegaphoneIcon />
                  {PROMO.badge}
                </span>
              ) : null}

              <h2
                className={`text-2xl font-bold tracking-tight text-blue-950 sm:text-3xl ${
                  showBadge ? "mt-3" : ""
                }`}
              >
                {PROMO.headingLead}{" "}
                <span className="text-blue-600">{PROMO.headingAccent}</span>
              </h2>

              {/* No max-width. It had one, and inside a card already
                  constrained by the page's max-w-6xl column it was a second
                  cap doing nothing but breaking the sentence with half the
                  line above it empty. */}
              <p className="mt-2.5 text-[15px] leading-relaxed text-slate-700">
                {PROMO.body}
              </p>

              <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-blue-700">
                {PROMO.linkLabel}
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </div>

            {/* ---------- Illustration ---------- */}
            {/* alt="" on purpose: it illustrates the heading and body beside
                it and adds nothing a screen reader needs, so announcing it
                would be repetition. The negative right margin is bigger than
                the card's padding, so the artwork runs to the edge and a
                little past it -- the card's overflow-hidden does the
                cropping. */}
            <div className="hidden md:block">
              <img
                src={PROMO.illustration}
                alt=""
                width={610}
                height={366}
                className="-my-4 -mr-12 h-auto w-[260px] max-w-none lg:w-[340px] xl:w-[390px]"
              />
            </div>

          </div>
        </Link>
      ) : null}
    </div>
  );
}

export default BoardPromoCard;
