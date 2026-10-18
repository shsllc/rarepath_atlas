import type { GraphBundle } from "@/lib/schemas";
import { rankResearchConnections, researchHubs } from "@/lib/analytics";

/**
 * Hero map drawn from the reviewed graph itself: the focus disease, its highest-ranked research
 * communities (node size by connection strength), the shared study that links them, and any
 * contradicted classification as a dashed line. Nothing here is illustrative filler.
 */
export function AtlasMap({ bundle }: { bundle: GraphBundle }) {
  const focusId = bundle.focus_disease_id;
  const label = new Map(bundle.nodes.map((n) => [n.id, n.label]));
  const short = (id: string) => {
    const n = bundle.nodes.find((x) => x.id === id);
    const alias = n?.aliases.find((a) => /^[A-Z0-9-]{2,8}$/.test(a));
    return alias ?? (label.get(id) ?? id).replace(/ (syndrome|disorder|deficiency disorder)$/i, "");
  };
  const ranked = rankResearchConnections(bundle.nodes, bundle.edges, focusId).slice(0, 4);
  const hub = researchHubs(bundle.nodes, bundle.edges).find((h) => h.disease_ids.includes(focusId));
  const W = 420;
  const H = 320;
  const cx = 215;
  const cy = 138;
  // Spread neighbours around the focus; the shared study sits bottom-left.
  const angles = [-155, -28, 32, 148];
  const pos = ranked.map((r, i) => {
    const a = (angles[i] * Math.PI) / 180;
    return { r, x: cx + 150 * Math.cos(a), y: cy + 96 * Math.sin(a), size: 9 + Math.min(r.score, 10) * 1.2 };
  });
  const hubPos = { x: 56, y: 270 };
  const max = Math.max(...ranked.map((r) => r.score), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="atlas-title atlas-desc" className="h-auto w-full">
      <title id="atlas-title">{`${label.get(focusId)} and its closest research communities`}</title>
      <desc id="atlas-desc">
        {ranked.map((r) => `${label.get(r.disease_id)}: ${r.score} points (${r.band.toLowerCase()})`).join("; ")}
        {hub ? `. Shared study: ${label.get(hub.node_id)}.` : ""}
      </desc>
      <defs>
        <pattern id="atlas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#ecebf2" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} rx="18" fill="url(#atlas-grid)" />
      {hub &&
        pos
          .filter((p) => hub.disease_ids.includes(p.r.disease_id))
          .map((p) => <line key={`h${p.r.disease_id}`} x1={hubPos.x} y1={hubPos.y} x2={p.x} y2={p.y} stroke="#9fd1bd" strokeWidth="1.4" />)}
      {hub && <line x1={hubPos.x} y1={hubPos.y} x2={cx} y2={cy} stroke="#9fd1bd" strokeWidth="1.4" />}
      {pos.map((p) => {
        const contradicted = p.r.cautions.some((c) => c.kind === "contradicted_classification");
        return (
          <g key={p.r.disease_id}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#4f46a5" strokeOpacity={0.25 + 0.6 * (p.r.score / max)} strokeWidth={1.5 + 2.5 * (p.r.score / max)} />
            {contradicted && <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#b84a62" strokeWidth="1.6" strokeDasharray="5 4" transform="translate(0 6)" />}
          </g>
        );
      })}
      {hub && (
        <g>
          <rect x={hubPos.x - 16} y={hubPos.y - 12} width="32" height="24" rx="6" fill="#e6f1ea" stroke="#0f6b65" strokeWidth="1.4" />
          <text x={hubPos.x + 24} y={hubPos.y + 4} fontSize="11" fill="#0f6b65" fontWeight="700">
            Shared natural history study
          </text>
        </g>
      )}
      {pos.map((p) => (
        <g key={`n${p.r.disease_id}`}>
          <circle cx={p.x} cy={p.y} r={p.size} fill="#ffffff" stroke="#4f46a5" strokeWidth="2" />
          <text x={p.x} y={p.y + p.size + 15} textAnchor="middle" fontSize="12" fill="#182033" fontWeight="700">
            {short(p.r.disease_id)}
          </text>
          <text x={p.x} y={p.y + p.size + 28} textAnchor="middle" fontSize="10.5" fill="#4f5873">
            {p.r.score} pts · {p.r.band}
          </text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r="34" fill="#4f46a5" />
      <circle cx={cx} cy={cy} r="42" fill="none" stroke="#4f46a5" strokeOpacity=".2" strokeWidth="6" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fill="#ffffff" fontWeight="700">
        {short(focusId)}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9.5" fill="#dcd9ff">
        reviewed
      </text>
      <g transform={`translate(${W - 150} ${H - 26})`}>
        <line x1="0" y1="0" x2="18" y2="0" stroke="#b84a62" strokeWidth="1.6" strokeDasharray="5 4" />
        <text x="24" y="4" fontSize="10" fill="#4f5873">
          contradicted classification
        </text>
      </g>
    </svg>
  );
}
