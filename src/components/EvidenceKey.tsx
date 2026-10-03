import { StatusBadge } from "./StatusBadge";

const KEY = [
  { status: "supported", text: "A retrieved source states this directly. Click to read the exact quote." },
  { status: "inferred", text: "A hypothesis generated from evidence. It needs validation." },
  { status: "contradictory", text: "Sources disagree, or historical and current evidence differ." },
  { status: "unknown", text: "Available evidence does not answer the question." },
] as const;

/** "How to read this" panel shown near the top of every result. */
export function EvidenceKey() {
  return (
    <section aria-labelledby="key-h" className="rounded-xl border border-line bg-white p-4">
      <h2 id="key-h" className="text-xs font-bold uppercase tracking-wide text-muted">
        How to read this
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {KEY.map((k) => (
          <li key={k.status} className="text-xs">
            <StatusBadge status={k.status} />
            <span className="mt-1 block text-muted">{k.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">RarePath Atlas is a research-navigation tool, not a diagnostic or treatment recommendation system.</p>
    </section>
  );
}
