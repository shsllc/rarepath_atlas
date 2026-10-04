/**
 * Research connection strength: a transparent, deterministic ranking of neighbouring
 * disease communities for a focus disease. It answers "which research paths are most
 * useful to investigate, and why?"
 *
 * It is NOT a disease-, biological- or treatment-similarity score. It counts reviewed,
 * sourced research connections, and lists counterweights next to every score.
 * Analyst-unreviewed OpenAI-only edges are excluded by construction.
 */
import { deriveEvidenceStatus, type EvidenceEdge, type GraphNode } from "@/lib/schemas";
import { isUnreviewedAiEdge } from "@/lib/graph-view";

export type FactorKind = "shared_study" | "shared_asset" | "shared_phenotype" | "phenotypic_overlap" | "historical_link";

/** The whole formula. Shown verbatim in the UI. */
export const FACTOR_WEIGHTS: Record<FactorKind, { points: number; label: string }> = {
  shared_study: { points: 3, label: "Enrolled in the same study or infrastructure" },
  shared_asset: { points: 3, label: "Same research asset (instrument or infrastructure) applied in both" },
  shared_phenotype: { points: 1, label: "Same sourced clinical feature" },
  phenotypic_overlap: { points: 1, label: "Source states overlapping features" },
  historical_link: { points: 1, label: "Historical research connection (context only)" },
};

export type CautionKind = "contradicted_classification" | "clinical_differences" | "no_mechanism_evidence" | "no_treatment_transfer_evidence";

export const CAUTION_LABEL: Record<CautionKind, string> = {
  contradicted_classification: "A classification linking the two is contradicted by current evidence",
  clinical_differences: "Sources document important clinical differences",
  no_mechanism_evidence: "No retrieved source describes a shared mechanism",
  no_treatment_transfer_evidence: "No evidence that any treatment transfers between them",
};

export interface RankFactor {
  kind: FactorKind;
  points: number;
  detail: string;
  evidence_edge_ids: string[];
}
export interface RankCaution {
  kind: CautionKind;
  detail: string;
  evidence_edge_ids: string[];
}
export interface RankedConnection {
  disease_id: string;
  score: number;
  band: "Strongest" | "Moderate" | "Limited";
  factors: RankFactor[];
  cautions: RankCaution[];
}
export interface ResearchHub {
  node_id: string;
  disease_ids: string[];
  evidence_edge_ids: string[];
}

export const BAND_THRESHOLDS = { strongest: 7, moderate: 3 } as const;
const band = (score: number): RankedConnection["band"] => (score >= BAND_THRESHOLDS.strongest ? "Strongest" : score >= BAND_THRESHOLDS.moderate ? "Moderate" : "Limited");

/** Only analyst-reviewed, non-contradicted, non-inferred edges can add points. */
const reviewed = (edges: EvidenceEdge[]) => edges.filter((e) => !isUnreviewedAiEdge(e));
const positive = (e: EvidenceEdge) => deriveEvidenceStatus(e) === "supported";

export function rankResearchConnections(nodes: GraphNode[], allEdges: EvidenceEdge[], focusId: string): RankedConnection[] {
  const edges = reviewed(allEdges);
  const node = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => node.get(id)?.label ?? id;
  const diseases = nodes.filter((n) => n.type === "Disease" && n.id !== focusId).map((n) => n.id);
  const out = (s: string, p: EvidenceEdge["predicate"]) => edges.filter((e) => e.subject_id === s && e.predicate === p);
  const between = (a: string, b: string, p: EvidenceEdge["predicate"]) =>
    edges.filter((e) => e.predicate === p && ((e.subject_id === a && e.object_id === b) || (e.subject_id === b && e.object_id === a)));
  const focusMechanisms = edges.some((e) => e.predicate === "involves_mechanism" || e.predicate === "shares_mechanism_with");

  const ranked = diseases.map((d): RankedConnection => {
    const factors: RankFactor[] = [];
    const cautions: RankCaution[] = [];

    // shared study / infrastructure
    for (const fe of out(focusId, "studied_in").filter(positive)) {
      const de = out(d, "studied_in").filter(positive).find((e) => e.object_id === fe.object_id);
      if (de) {
        const co = between(focusId, d, "co_studied_with").filter(positive).map((e) => e.id);
        factors.push({ kind: "shared_study", points: FACTOR_WEIGHTS.shared_study.points, detail: label(fe.object_id), evidence_edge_ids: [fe.id, de.id, ...co] });
      }
    }
    // shared research asset applied in both
    for (const fa of edges.filter((e) => e.predicate === "applied_to" && e.object_id === focusId && positive(e))) {
      const da = edges.find((e) => e.predicate === "applied_to" && e.subject_id === fa.subject_id && e.object_id === d && positive(e));
      if (da) factors.push({ kind: "shared_asset", points: FACTOR_WEIGHTS.shared_asset.points, detail: label(fa.subject_id), evidence_edge_ids: [fa.id, da.id] });
    }
    // same sourced phenotype
    for (const fp of out(focusId, "has_phenotype").filter(positive)) {
      const dp = out(d, "has_phenotype").filter(positive).find((e) => e.object_id === fp.object_id);
      if (dp) factors.push({ kind: "shared_phenotype", points: FACTOR_WEIGHTS.shared_phenotype.points, detail: label(fp.object_id), evidence_edge_ids: [fp.id, dp.id] });
    }
    // explicit phenotypic overlap statement
    const ov = between(focusId, d, "phenotypically_overlaps").filter(positive);
    if (ov.length) factors.push({ kind: "phenotypic_overlap", points: FACTOR_WEIGHTS.phenotypic_overlap.points, detail: "shared and distinct features", evidence_edge_ids: ov.map((e) => e.id) });
    // historical research connection (context)
    const hist = between(focusId, d, "historically_classified_with").filter(positive);
    if (hist.length) factors.push({ kind: "historical_link", points: FACTOR_WEIGHTS.historical_link.points, detail: "historically grouped", evidence_edge_ids: hist.map((e) => e.id) });

    // counterweights (always shown; never hidden by a high score)
    const contra = between(focusId, d, "classified_as_variant_of").filter((e) => deriveEvidenceStatus(e) === "contradictory");
    if (contra.length) cautions.push({ kind: "contradicted_classification", detail: CAUTION_LABEL.contradicted_classification, evidence_edge_ids: contra.map((e) => e.id) });
    const diff = between(focusId, d, "clinically_differs_from").filter(positive);
    if (diff.length) cautions.push({ kind: "clinical_differences", detail: CAUTION_LABEL.clinical_differences, evidence_edge_ids: diff.map((e) => e.id) });
    if (!focusMechanisms) cautions.push({ kind: "no_mechanism_evidence", detail: CAUTION_LABEL.no_mechanism_evidence, evidence_edge_ids: [] });
    // The graph has no treatment predicates at all; state that explicitly rather than leave it implied.
    cautions.push({ kind: "no_treatment_transfer_evidence", detail: CAUTION_LABEL.no_treatment_transfer_evidence, evidence_edge_ids: [] });

    const score = factors.reduce((n, f) => n + f.points, 0);
    return { disease_id: d, score, band: band(score), factors, cautions };
  });

  return ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.disease_id.localeCompare(b.disease_id));
}

/** Studies/infrastructure that connect the most disease communities (simple degree centrality on reviewed edges). */
export function researchHubs(nodes: GraphNode[], allEdges: EvidenceEdge[]): ResearchHub[] {
  const edges = reviewed(allEdges).filter((e) => e.predicate === "studied_in" && positive(e));
  const studies = nodes.filter((n) => n.type === "Study");
  return studies
    .map((s) => {
      const es = edges.filter((e) => e.object_id === s.id);
      return { node_id: s.id, disease_ids: [...new Set(es.map((e) => e.subject_id))], evidence_edge_ids: es.map((e) => e.id) };
    })
    .filter((h) => h.disease_ids.length >= 2)
    .sort((a, b) => b.disease_ids.length - a.disease_ids.length);
}
