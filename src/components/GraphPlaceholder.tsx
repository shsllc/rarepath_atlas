"use client";

import { deriveEvidenceStatus, type EvidenceEdge, type GraphNode } from "@/lib/schemas";
import { PREDICATE_LABEL } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

/**
 * Gate 1 placeholder: a filterable edge table that already uses the real
 * evidence contract. Gate 3 replaces the table with Cytoscape.js, using
 * line style per status: solid=supported, dashed=inferred, double=contradictory, dotted=unknown.
 */
export function GraphPlaceholder({ nodes, edges, onSelectEdge }: { nodes: GraphNode[]; edges: EvidenceEdge[]; onSelectEdge: (e: EvidenceEdge) => void }) {
  const label = new Map(nodes.map((n) => [n.id, `${n.label}`]));
  const type = new Map(nodes.map((n) => [n.id, n.type]));
  return (
    <div className="rounded-xl border border-dashed border-line bg-white p-4">
      <p className="mb-3 text-xs text-muted">
        Interactive graph view coming next ({nodes.length} nodes, {edges.length} evidence-bearing relationships). Table view below uses the same data.
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-3">From</th>
              <th className="py-2 pr-3">Relationship</th>
              <th className="py-2 pr-3">To</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => (
              <tr key={e.id} onClick={() => onSelectEdge(e)} className="cursor-pointer border-t border-line hover:bg-canvas">
                <td className="py-2 pr-3">
                  {label.get(e.subject_id)} <span className="text-xs text-muted">{type.get(e.subject_id)}</span>
                </td>
                <td className="py-2 pr-3 text-muted">{PREDICATE_LABEL[e.predicate]}</td>
                <td className="py-2 pr-3">
                  {label.get(e.object_id)} <span className="text-xs text-muted">{type.get(e.object_id)}</span>
                </td>
                <td className="py-2">
                  <StatusBadge status={deriveEvidenceStatus(e)} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
