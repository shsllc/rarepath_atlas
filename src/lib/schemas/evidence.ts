import { z } from "zod";

/** Relationship predicates between nodes. Kept small and explicit. */
export const Predicate = z.enum([
  "caused_by_variant_in", // Disease -> Gene
  "has_variant", // Gene -> Variant
  "has_phenotype", // Disease -> Phenotype
  "involves_mechanism", // Disease|Gene -> Mechanism
  "phenotypically_overlaps", // Disease -> Disease
  "shares_mechanism_with", // Disease -> Disease
  "historically_classified_with", // Disease -> Disease (a past naming/grouping, stated as history)
  "classified_as_variant_of", // Disease -> Disease (the classification claim itself; may be contradicted)
  "co_studied_with", // Disease -> Disease (enrolled in the same study/infrastructure)
  "clinically_differs_from", // Disease -> Disease (evidence of distinct features)
  "applied_to", // ResearchAsset -> Disease (instrument/infrastructure used in that population)
  "informed_development_of", // Study|PatientOrganization|ResearchAsset -> ResearchAsset (experience fed into building it)
  "authored", // Researcher -> Paper (public PubMed author metadata)
  "studied_in", // Disease -> Study
  "produced_asset", // Study -> ResearchAsset
  "asset_measures", // ResearchAsset -> Phenotype
  "supports_community", // PatientOrganization -> Disease
  "investigates", // Researcher -> Disease|Study
  "described_in", // any -> Paper
  "associated_with", // Disease|Variant -> Gene|Disease: an association reported by a source, NOT causation
  "subclass_of", // Disease -> Disease: ontology hierarchy (MONDO/EFO), not clinical similarity
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
  "research_platform", // aggregated research databases (Open Targets, GWAS Catalog) — machine-assembled
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
  "machine_assembled", // copied from a structured research API at query time; not analyst reviewed
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const ContradictionStatus = z.enum(["none", "contested", "contradicted"]);
export type ContradictionStatus = z.infer<typeof ContradictionStatus>;

export const Confidence = z.enum(["high", "moderate", "low", "insufficient"]);
export type Confidence = z.infer<typeof Confidence>;

/** How an evidence item was produced. Shown in the UI so OpenAI's role is visible. */
export const EvidenceMethod = z.enum([
  "structured_api", // field copied from a registry/ontology API response
  "analyst_quote", // a human selected a verbatim quote from retrieved source text
  "openai_extractor", // OpenAI Evidence Extractor produced the claim; quote verified verbatim
  "fixture", // hand-entered demo data
]);
export type EvidenceMethod = z.infer<typeof EvidenceMethod>;

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
    .object({ pmid: z.string().optional(), pmcid: z.string().optional(), nct: z.string().optional(), doi: z.string().optional() })
    .optional(),
  method: EvidenceMethod.default("fixture"),
  /** Id of the stored SourceRecord the quote was checked against (real data only). */
  source_record_id: z.string().optional(),
  /** Does this item support, contradict, or qualify (limit/caveat) the edge's claim? */
  stance: z.enum(["supports", "contradicts", "qualifies"]).default("supports"),
  /** Present when an OpenAI role produced this item. */
  extraction: z.object({ model: z.string(), run_id: z.string(), created_at: z.string() }).optional(),
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
  /**
   * Evidence tier. Absent = the curated bundle's own edge (reviewed unless it is an OpenAI-only extraction).
   * "machine_assembled" edges come from the discovery layer and can never rank or drive actions.
   */
  review_status: z.enum(["reviewed", "machine_assembled"]).optional(),
  eligible_for_ranking: z.boolean().optional(),
  eligible_for_action: z.boolean().optional(),
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
