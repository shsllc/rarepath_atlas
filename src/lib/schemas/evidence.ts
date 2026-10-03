import { z } from "zod";

/** Relationship predicates between nodes. Kept small and explicit. */
export const Predicate = z.enum([
  "caused_by_variant_in", // Disease -> Gene
  "has_variant", // Gene -> Variant
  "has_phenotype", // Disease -> Phenotype
  "involves_mechanism", // Disease|Gene -> Mechanism
  "phenotypically_overlaps", // Disease -> Disease
  "shares_mechanism_with", // Disease -> Disease
  "historically_classified_with", // Disease -> Disease
  "studied_in", // Disease -> Study
  "produced_asset", // Study -> ResearchAsset
  "asset_measures", // ResearchAsset -> Phenotype
  "supports_community", // PatientOrganization -> Disease
  "investigates", // Researcher -> Disease|Study
  "described_in", // any -> Paper
]);
export type Predicate = z.infer<typeof Predicate>;

export const SourceType = z.enum([
  "ontology", // MONDO, HPO, Orphanet
  "variant_database", // ClinVar
  "literature", // PubMed/PMC
  "trial_registry", // ClinicalTrials.gov
  "funding_database", // NIH RePORTER
  "patient_org_site", // NORD, Global Genes, verified org sites
  "web_scrape", // Bright Data (optional)
  "model_inference", // produced by an OpenAI role, never authoritative
  "demo_fixture", // hand-entered seed data, not evidence
]);
export type SourceType = z.infer<typeof SourceType>;

export const EvidenceType = z.enum([
  "curated_annotation", // structured ontology / database assertion
  "direct_statement", // quoted sentence from a source
  "study_record", // registry record fields
  "computed_overlap", // e.g. phenotype set similarity
  "llm_extraction", // OpenAI Evidence Extractor output (requires source text)
  "llm_inference", // OpenAI suggestion with no direct supporting text
  "placeholder", // fixture stand-in awaiting real retrieval
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const ContradictionStatus = z.enum(["none", "contested", "contradicted"]);
export type ContradictionStatus = z.infer<typeof ContradictionStatus>;

export const Confidence = z.enum(["high", "moderate", "low", "insufficient"]);
export type Confidence = z.infer<typeof Confidence>;

/** A single piece of provenance. An edge may carry several. */
export const EvidenceItem = z.object({
  id: z.string(),
  source: z.string(), // human name: "ClinicalTrials.gov", "PubMed", "MONDO"
  source_url: z.string().url(),
  retrieval_date: z.string(), // ISO date
  source_type: SourceType,
  evidence_type: EvidenceType,
  /** Verbatim quote or structured excerpt. Fixtures use a clearly labelled placeholder. */
  quoted_or_structured_evidence: z.string(),
  /** Optional structured citation fields. */
  citation: z
    .object({ pmid: z.string().optional(), nct: z.string().optional(), doi: z.string().optional() })
    .optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/**
 * An evidence-bearing relationship. Never a naked edge: every edge carries
 * provenance, confidence, inference flag and contradiction state.
 */
export const EvidenceEdge = z.object({
  id: z.string(),
  subject_id: z.string(),
  predicate: Predicate,
  object_id: z.string(),
  // Primary provenance (mirrors evidence[0]; kept flat for quick filtering/display)
  source: z.string(),
  source_url: z.string().url(),
  retrieval_date: z.string(),
  source_type: SourceType,
  evidence_type: EvidenceType,
  quoted_or_structured_evidence: z.string(),
  // Full provenance list
  evidence: z.array(EvidenceItem).default([]),
  confidence: Confidence,
  inferred: z.boolean(),
  contradiction_status: ContradictionStatus,
  contradiction_notes: z.string().optional(),
  created_at: z.string(),
});
export type EvidenceEdge = z.infer<typeof EvidenceEdge>;

/** The four statuses the UI is allowed to show. */
export const EvidenceStatus = z.enum(["supported", "inferred", "contradictory", "unknown"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

/**
 * Single source of truth for the visual status of any edge.
 * Order matters: contradiction beats inference beats support.
 * An inferred edge can NEVER be shown as "supported".
 */
export function deriveEvidenceStatus(edge: Pick<EvidenceEdge, "inferred" | "contradiction_status" | "confidence" | "source_type" | "evidence_type">): EvidenceStatus {
  if (edge.contradiction_status !== "none") return "contradictory";
  if (edge.inferred || edge.source_type === "model_inference" || edge.evidence_type === "llm_inference") return "inferred";
  if (edge.confidence === "insufficient") return "unknown";
  return "supported";
}

/** Combine several edge statuses into one summary status for a card. Most cautious wins. */
export function combineStatuses(statuses: EvidenceStatus[]): EvidenceStatus {
  if (statuses.length === 0) return "unknown";
  for (const s of ["contradictory", "unknown", "inferred"] as const) if (statuses.includes(s)) return s;
  return "supported";
}
