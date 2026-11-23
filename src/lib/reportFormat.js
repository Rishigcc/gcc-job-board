// Pure formatting for the reports. Separate from the components so the rules
// that matter can be tested in Node -- a report that renders a wrong number
// confidently is worse than one that fails to render.

// Null means "not measured", and it must never read as zero. An unmeasured
// verification showing "0 days" would make the two-working-day promise look
// perfect precisely where there is no evidence either way.
export function notMeasured(value) {
  return value === null || value === undefined;
}

export function workingDaysLabel(days) {
  if (notMeasured(days)) return "not measured";
  if (days === 0) return "same day";
  return `${days} working day${days === 1 ? "" : "s"}`;
}

export function hoursLabel(hours) {
  if (notMeasured(hours)) return "—";

  const n = Number(hours);
  if (Number.isNaN(n)) return "—";
  if (n < 1) return "under an hour";
  if (n < 48) return `${Math.round(n)} hours`;

  return `${(n / 24).toFixed(1)} days`;
}

// "within 2 working days" is a published promise, so the three states are
// kept distinct: kept, missed, and nothing to judge.
export function promiseLabel(withinPromise) {
  if (notMeasured(withinPromise)) return "not measured";
  return withinPromise ? "within 2 working days" : "over 2 working days";
}

export function promiseTone(withinPromise) {
  if (notMeasured(withinPromise)) return "muted";
  return withinPromise ? "good" : "risk";
}

// The sentence that stops the candidate figures looking like a discrepancy.
// They are deliberately smaller than the total, because an anonymised
// application has no candidate left to attribute it to.
export function reconciliationLine(totals) {
  if (!totals) return "";

  const apps = totals.applications_total ?? 0;
  const people = totals.candidates_identifiable ?? 0;
  const anon = totals.applications_anonymised ?? 0;

  const base =
    `${apps} application${apps === 1 ? "" : "s"} from ` +
    `${people} candidate${people === 1 ? "" : "s"}`;

  if (!anon) return `${base}.`;

  return (
    `${base}, and ${anon} anonymised on request — those have no candidate ` +
    `left to attribute them to, so they count in the totals and not in the ` +
    `candidate list.`
  );
}
