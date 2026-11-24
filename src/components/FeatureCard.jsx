import { Link } from "react-router-dom";

const ACCENT_CLASSES = {
  green: "bg-green-100 text-green-600",
  purple: "bg-purple-100 text-purple-600",
  blue: "bg-blue-100 text-blue-600",
};

const WAVE_CLASSES = {
  green: "bg-green-200",
  purple: "bg-purple-200",
  blue: "bg-blue-200",
};

function ArrowIcon(props) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FeatureCard({
  icon: Icon,
  accent,
  title,
  description,
  linkLabel,
  onClick,
  to,
}) {
  const content = (
    <>
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${ACCENT_CLASSES[accent]}`}
      >
        <Icon width={22} height={22} />
      </div>

      <h2 className="mt-4 text-xl font-bold text-slate-900">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      <div className="mt-auto flex items-center gap-1 pt-4 font-semibold text-blue-700">
        {linkLabel}
        <ArrowIcon />
      </div>
    </>
  );

  const className =
    "relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 text-left shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-lg";

  const wave = (
    <div
      className={`pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full opacity-30 ${WAVE_CLASSES[accent]} blur-2xl`}
    />
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {content}
        {wave}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
      {wave}
    </button>
  );
}

export default FeatureCard;
