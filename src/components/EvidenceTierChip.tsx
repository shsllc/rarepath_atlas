/**
 * Evidence-tier chip. Text + icon + border style, never colour alone:
 * reviewed = solid border + ✓, machine-assembled = dashed border + ◌.
 */
export function EvidenceTierChip({ tier }: { tier: "reviewed" | "machine_assembled" }) {
  return tier === "reviewed" ? (
    <span title="Analyst-reviewed evidence. Eligible for Research Connection Strength and the Research Action Brief." className="inline-flex items-center gap-1 whitespace-nowrap rounded border-2 border-solid border-supported bg-supported-bg px-2 py-0.5 text-xs font-bold text-supported">
      <span aria-hidden>✓</span> Reviewed evidence
    </span>
  ) : (
    <span title="Assembled automatically from structured research APIs. Not eligible for ranking or actions." className="inline-flex items-center gap-1 whitespace-nowrap rounded border-2 border-dashed border-unknown bg-unknown-bg px-2 py-0.5 text-xs font-bold text-unknown">
      <span aria-hidden>◌</span> Machine-assembled
    </span>
  );
}
