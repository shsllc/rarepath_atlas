import { z } from "zod";

/**
 * Graph node types. Every node is a stable entity with external identifiers
 * (MONDO, HGNC, HPO, ClinVar, NCT, PMID, ...) once resolved by a provider.
 */
export const NodeType = z.enum([
  "Disease",
  "Gene",
  "Variant",
  "Phenotype",
  "Mechanism",
  "Paper",
  "Study",
  "ResearchAsset",
  "PatientOrganization",
  "Researcher",
]);
export type NodeType = z.infer<typeof NodeType>;

/** Whether an identifier/fact on a node has been checked against its source. */
export const VerificationStatus = z.enum([
  "verified", // resolved from the authoritative source by a provider
  "unverified_fixture", // hand-entered demo data — MUST be replaced before claims are shown as real
  "pending",
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ExternalId = z.object({
  system: z.string(), // e.g. "MONDO", "OMIM", "ORPHA", "HGNC", "HPO", "NCT", "PMID", "ROR"
  id: z.string(),
  url: z.string().url().optional(),
  verification: VerificationStatus,
});
export type ExternalId = z.infer<typeof ExternalId>;

const NodeBase = z.object({
  id: z.string(), // internal stable id, e.g. "disease:cdd"
  label: z.string(),
  aliases: z.array(z.string()).default([]),
  external_ids: z.array(ExternalId).default([]),
  description: z.string().optional(),
  /** Plain-language one-liner for families. */
  lay_summary: z.string().optional(),
  verification: VerificationStatus,
});

export const DiseaseNode = NodeBase.extend({
  type: z.literal("Disease"),
  inheritance: z.array(z.string()).default([]),
  typical_onset: z.string().optional(),
});
export const GeneNode = NodeBase.extend({ type: z.literal("Gene"), symbol: z.string() });
export const VariantNode = NodeBase.extend({
  type: z.literal("Variant"),
  hgvs: z.string().optional(),
  clinical_significance: z.string().optional(),
});
export const PhenotypeNode = NodeBase.extend({ type: z.literal("Phenotype") });
export const MechanismNode = NodeBase.extend({ type: z.literal("Mechanism") });
export const PaperNode = NodeBase.extend({
  type: z.literal("Paper"),
  year: z.number().int().optional(),
  journal: z.string().optional(),
  authors: z.array(z.string()).default([]),
  pub_date: z.string().optional(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  doi: z.string().optional(),
  /** "preprint" must be shown to users: it has not been peer reviewed. */
  publication_status: z.enum(["peer_reviewed", "preprint", "unknown"]).default("unknown"),
});
export const StudyNode = NodeBase.extend({
  type: z.literal("Study"),
  study_type: z.enum(["natural_history", "interventional", "observational", "registry", "biobank", "other"]),
  status: z.string().optional(),
  nct: z.string().optional(),
  conditions: z.array(z.string()).default([]),
  enrollment: z.number().int().optional(),
  sponsor: z.string().optional(),
  start_date: z.string().optional(),
  completion_date: z.string().optional(),
});

export const ResearchAssetKind = z.enum([
  "natural_history_protocol",
  "registry",
  "disease_model",
  "biomarker",
  "outcome_measure",
  "clinical_study_design",
  "research_infrastructure",
  "investigator_relationship",
]);
export type ResearchAssetKind = z.infer<typeof ResearchAssetKind>;

export const ResearchAssetNode = NodeBase.extend({
  type: z.literal("ResearchAsset"),
  asset_kind: ResearchAssetKind,
  owner_disease_id: z.string(), // the community that built it
  access_notes: z.string().optional(), // how one would request/review it
});
export const PatientOrganizationNode = NodeBase.extend({
  type: z.literal("PatientOrganization"),
  website: z.string().url().optional(),
});
export const ResearcherNode = NodeBase.extend({
  type: z.literal("Researcher"),
  affiliation: z.string().optional(),
});

export const GraphNode = z.discriminatedUnion("type", [
  DiseaseNode,
  GeneNode,
  VariantNode,
  PhenotypeNode,
  MechanismNode,
  PaperNode,
  StudyNode,
  ResearchAssetNode,
  PatientOrganizationNode,
  ResearcherNode,
]);
export type GraphNode = z.infer<typeof GraphNode>;
export type DiseaseNode = z.infer<typeof DiseaseNode>;
export type ResearchAssetNode = z.infer<typeof ResearchAssetNode>;
