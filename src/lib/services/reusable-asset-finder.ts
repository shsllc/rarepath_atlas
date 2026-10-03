import { combineStatuses, deriveEvidenceStatus, type CandidateConnection, type EvidenceStatus, type ReusableAssetOpportunity } from "@/lib/schemas";
import type { GraphService, ReusableAssetFinder } from "./interfaces";

/**
 * Returns the curated connections/opportunities stored in the bundle, but
 * RECOMPUTES every status from the underlying edges so hand-written curation
 * can never claim more certainty than its evidence supports.
 *
 * Future: replace the bundle lookup with traversal:
 *   focus Disease -(phenotypically_overlaps|shares_mechanism_with|...)-> Disease B
 *   Disease B -(studied_in)-> Study -(produced_asset)-> ResearchAsset
 */
export class CuratedReusableAssetFinder implements ReusableAssetFinder {
  constructor(private readonly graph: GraphService) {}

  private statusOf(edgeIds: string[]): EvidenceStatus {
    return combineStatuses(
      edgeIds.map((id) => {
        const e = this.graph.getEdge(id);
        return e ? deriveEvidenceStatus(e) : "unknown";
      }),
    );
  }

  findConnections(diseaseId: string): CandidateConnection[] {
    const b = this.graph.bundle();
    if (b.focus_disease_id !== diseaseId) return [];
    return b.connections.map((c) => ({
      ...c,
      evidence_count: c.evidence_edge_ids.length,
      status: this.statusOf(c.evidence_edge_ids),
    }));
  }

  findOpportunities(diseaseId: string): ReusableAssetOpportunity[] {
    const b = this.graph.bundle();
    if (b.focus_disease_id !== diseaseId) return [];
    return b.opportunities.map((o) => {
      const s = this.statusOf(o.evidence_edge_ids);
      // A reuse opportunity is always a hypothesis: never display it as "supported".
      const status: EvidenceStatus = s === "contradictory" ? "contradictory" : "inferred";
      return { ...o, status };
    });
  }
}
