/**
 * Coverage layer: which diseases the committed graph represents, and how deeply.
 *
 * Everything here is DERIVED from the bundle. Only analyst-reviewed, non-contradicted,
 * non-inferred edges count towards a disease's tier; OpenAI-only extractions never do.
 * There is deliberately no numeric score: a tier says what has been reviewed, not how
 * "good" or "similar" a disease is.
 */
import { deriveEvidenceStatus, type EvidenceEdge, type EvidenceStatus, type GraphBundle, type GraphNode } from "@/lib/schemas";
import { isReviewedEvidenceEdge, isUnreviewedAiEdge } from "@/lib/graph-view";

export const COVERAGE_TIERS = ["full", "partial", "shared_study", "identity_only"] as const;
export type CoverageTier = (typeof COVERAGE_TIERS)[number];

export const TIER_META: Record<CoverageTier, { label: string; short: string; help: string }> = {
  full: {
    label: "FULL VERIFIED JOURNEY",
    short: "Full verified journey",
    help: "End-to-end reviewed evidence, ranked research connections and a reviewed Research Action Brief.",
  },
  partial: {
    label: "PARTIAL EVIDENCE GRAPH",
    short: "Reviewed partial journey",
    help: "Reviewed identity, study, research-asset and community links. No Research Action Brief has been reviewed.",
  },
  shared_study: {
    label: "SHARED-STUDY CONNECTION",
    short: "Shared-study connection",
    help: "Verified identity and enrolment in a study shared with another disease. No reviewed reusable-asset path.",
  },
  identity_only: {
    label: "IDENTITY VERIFIED ONLY",
    short: "Identity verified only",
    help: "The disease identity is verified against an ontology. No reviewed connections yet.",
  },
};

export const PARTIAL_BANNER = "Partial evidence graph — a full Research Action Brief has not yet been reviewed for this disease.";

export const COVERAGE_STATEMENT =
  "RarePath currently demonstrates one fully reviewed end-to-end journey for CDKL5 deficiency disorder, with additional reviewed disease and study nodes showing how the same evidence model expands beyond a single condition.";

/** Reviewed = not an OpenAI-only extraction. Positive = reviewed AND shown as directly supported. */
export const isReviewedEdge = (e: EvidenceEdge) => isReviewedEvidenceEdge(e);
const isPositive = (e: EvidenceEdge) => isReviewedEdge(e) && deriveEvidenceStatus(e) === "supported";

export type ReviewedLink = { edge_id: string; node_id: string; label: string; status: EvidenceStatus };
export type StudyLink = ReviewedLink & { nct?: string; url?: string; shared_with: { node_id: string; label: string }[]; investigators: { node_id: string; label: string }[] };
export type DiseaseConnection = ReviewedLink & { predicate: EvidenceEdge["predicate"]; direction: "out" | "in" };

export type DiseaseCoverage = {
  node_id: string;
  label: string;
  aliases: string[];
  summary?: string;
  identifiers: { system: string; id: string; url?: string }[];
  tier: CoverageTier;
  is_focus: boolean;
  has_action_brief: boolean;
  genes: ReviewedLink[];
  studies: StudyLink[];
  assets: ReviewedLink[];
  organizations: ReviewedLink[];
  phenotypes: ReviewedLink[];
  /** Reviewed disease↔disease relationships, including contradicted ones (they stay visible). */
  connections: DiseaseConnection[];
  /** Every reviewed edge used above, so the UI can show quotes and sources. */
  reviewed_edge_ids: string[];
  /** OpenAI-only extractions touching this disease: disclosed, never shown as findings, never counted. */
  unreviewed_ai_edge_count: number;
};

function link(e: EvidenceEdge, other: GraphNode | undefined): ReviewedLink | undefined {
  if (!other) return undefined;
  return { edge_id: e.id, node_id: other.id, label: other.label, status: deriveEvidenceStatus(e) };
}

export function diseaseCoverage(bundle: GraphBundle): DiseaseCoverage[] {
  const nodes = new Map(bundle.nodes.map((n) => [n.id, n]));
  const reviewed = bundle.edges.filter(isReviewedEdge);
  const positive = reviewed.filter(isPositive);
  const studiedIn = positive.filter((e) => e.predicate === "studied_in");

  const diseases = bundle.nodes.filter((n) => n.type === "Disease" && n.verification === "verified");
  const out = diseases.map((d): DiseaseCoverage => {
    const from = (pred: EvidenceEdge["predicate"]) => positive.filter((e) => e.predicate === pred && e.subject_id === d.id);
    const into = (pred: EvidenceEdge["predicate"]) => positive.filter((e) => e.predicate === pred && e.object_id === d.id);
    const pick = (es: EvidenceEdge[], side: "subject_id" | "object_id") => es.map((e) => link(e, nodes.get(e[side]))).filter((x): x is ReviewedLink => !!x);

    const genes = pick(from("caused_by_variant_in"), "object_id");
    const phenotypes = pick(from("has_phenotype"), "object_id");
    const assets = pick(into("applied_to"), "subject_id");
    const organizations = pick(into("supports_community"), "subject_id");

    const studies: StudyLink[] = from("studied_in").flatMap((e) => {
      const s = nodes.get(e.object_id);
      if (!s || s.type !== "Study") return [];
      const shared_with = studiedIn
        .filter((x) => x.object_id === s.id && x.subject_id !== d.id)
        .map((x) => nodes.get(x.subject_id))
        .filter((n): n is GraphNode => !!n)
        .map((n) => ({ node_id: n.id, label: n.label }));
      const investigators = positive
        .filter((x) => x.predicate === "investigates" && x.object_id === s.id)
        .map((x) => nodes.get(x.subject_id))
        .filter((n): n is GraphNode => !!n)
        .map((n) => ({ node_id: n.id, label: n.label }));
      const nctId = s.external_ids.find((x) => x.system === "NCT");
      return [{ ...link(e, s)!, nct: s.nct, url: nctId?.url, shared_with, investigators }];
    });

    const connections: DiseaseConnection[] = reviewed
      .filter((e) => (e.subject_id === d.id || e.object_id === d.id) && nodes.get(e.subject_id)?.type === "Disease" && nodes.get(e.object_id)?.type === "Disease")
      .map((e) => {
        const direction = e.subject_id === d.id ? "out" : "in";
        const other = nodes.get(direction === "out" ? e.object_id : e.subject_id)!;
        return { ...link(e, other)!, predicate: e.predicate, direction };
      });

    const is_focus = d.id === bundle.focus_disease_id;
    const has_action_brief = is_focus && !!bundle.action_brief;
    const hasSharedStudy = studies.some((s) => s.shared_with.length > 0);
    const tier: CoverageTier = has_action_brief
      ? "full"
      : hasSharedStudy && assets.length > 0 && organizations.length > 0
        ? "partial"
        : hasSharedStudy
          ? "shared_study"
          : "identity_only";

    const reviewed_edge_ids = [...new Set([genes, phenotypes, assets, organizations, studies, connections].flat().map((x) => x.edge_id))];
    const unreviewed_ai_edge_count = bundle.edges.filter((e) => isUnreviewedAiEdge(e) && (e.subject_id === d.id || e.object_id === d.id)).length;

    return {
      node_id: d.id,
      label: d.label,
      aliases: d.aliases,
      summary: d.lay_summary ?? d.description,
      identifiers: d.external_ids.filter((x) => x.verification === "verified").map(({ system, id, url }) => ({ system, id, url })),
      tier,
      is_focus,
      has_action_brief,
      genes,
      studies,
      assets,
      organizations,
      phenotypes,
      connections,
      reviewed_edge_ids,
      unreviewed_ai_edge_count,
    };
  });

  // Deepest coverage first; within a tier keep the bundle order.
  return out.sort((a, b) => COVERAGE_TIERS.indexOf(a.tier) - COVERAGE_TIERS.indexOf(b.tier));
}

export type CoverageCounts = {
  diseases: number;
  genes: number;
  studies: number;
  research_assets: number;
  investigators: number;
  patient_organizations: number;
  papers: number;
  reviewed_relationships: number;
  sources: number;
};

/** Plain counts of committed graph entities. Nothing is estimated or rounded. */
export function coverageCounts(bundle: GraphBundle): CoverageCounts {
  const count = (t: GraphNode["type"]) => bundle.nodes.filter((n) => n.type === t).length;
  return {
    diseases: count("Disease"),
    genes: count("Gene"),
    studies: count("Study"),
    research_assets: count("ResearchAsset"),
    investigators: count("Researcher"),
    patient_organizations: count("PatientOrganization"),
    papers: count("Paper"),
    reviewed_relationships: bundle.edges.filter(isReviewedEdge).length,
    sources: bundle.sources.length,
  };
}
