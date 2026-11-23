// Shared furniture for the admin sections. Deliberately plain: this is an
// action queue, not a dashboard, and anything decorative here is a thing that
// can be misread at the moment something has gone wrong.

export function Panel({ title, note, children }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {note ? (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{note}</p>
      ) : null}
      {children}
    </section>
  );
}

export function Pill({ tone, children }) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tone === "risk"
        ? "bg-red-50 text-red-800 ring-red-200"
        : tone === "wait"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {children}
    </span>
  );
}

export function Button({ tone = "plain", busy, children, ...rest }) {
  const cls =
    tone === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300"
      : tone === "danger"
        ? "bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-300"
        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <button
      type="button"
      disabled={busy || rest.disabled}
      {...rest}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${cls}`}
    >
      {children}
    </button>
  );
}

export function Notice({ error, message }) {
  if (error) {
    return (
      <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3">
        <p className="text-sm font-semibold text-red-900">{error.message}</p>
        {error.detail ? (
          <p className="mt-1 font-mono text-xs text-red-700">{error.detail}</p>
        ) : null}
      </div>
    );
  }

  if (message) {
    return (
      <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p>
    );
  }

  return null;
}
