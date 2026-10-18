import Link from "next/link";

/** Switch between the plain-language family view and the full research view of the same result. */
export function ViewToggle({ query, view }: { query: string; view: "family" | "research" }) {
  const q = encodeURIComponent(query);
  const item = (v: "family" | "research", text: string, hint: string) => (
    <Link
      href={`/results?q=${q}&view=${v}`}
      aria-current={view === v ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === v ? "bg-ink text-white shadow-sm" : "text-ink/70 hover:text-ink"}`}
      title={hint}
    >
      {text}
    </Link>
  );
  return (
    <nav aria-label="View" className="inline-flex rounded-full border border-line bg-white p-1">
      {item("family", "Family view", "Plain-language summary")}
      {item("research", "Research view", "Every source, the ranking formula and the full evidence map")}
    </nav>
  );
}
