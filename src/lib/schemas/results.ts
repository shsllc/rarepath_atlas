import { z } from "zod";
import { GraphNode } from "./entities";
import { SourceRecord } from "./sources";
import { Confidence, EvidenceEdge, EvidenceStatus } from "./evidence";

/** A concrete next step a patient organization can take. Never clinical advice. */
export const ActionRecommendation = z.object({
  id: z.string(),
  kind: z.enum([
    "contact_organization",
    "contact_researcher",
    "review_protocol",
    "compare_outcome_measures",
    "compare_eligibility",
    "request_data_access",
    "ask_expert_question",
  ]),
  /** Family-readable instruction. */
  label: z.string(),
  detail: z.string().optional(),
  target_node_id: z.string().optional(),
  /** Edges that justify this action. Required: no action without an evidence trail. */
  evidence_edge_ids: z.array(z.string()).min(1),
});
export type ActionRecommendation = z.infer<typeof ActionRecommendation>;

/** Another disease/community connected to the query disease. */
export const CandidateConnection = z.object({
  id: z.string(),
  disease_id: z.string(),
  connection_type: z.enum([
    "phenotypic_overlap",
    "shared_gene",
    "shared_mechanism",
    "historical_classification",
    "shared_asset",
    "shared_research_infrastructure",
    "clinical_difference",
  ]),
  why_connected: z.string(), // plain language
  evidence_edge_ids: z.array(z.string()).min(1),
  evidence_count: z.number().int().nonnegative(),
  confidence: Confidence,
  status: EvidenceStatus,
  key_difference: z.string(), // the important counterexample / difference
});
export type CandidateConnection = z.infer<typeof CandidateConnection>;

/** Conservative reuse classes. "directly_reusable" should be rare and needs strong evidence. */
export const ReuseClassification = z.enum([
  "directly_reusable",
  "potentially_adaptable",
  "shared_infrastructure_precedent",
  "discovery_lead",
]);
export type ReuseClassification = z.infer<typeof ReuseClassification>;

/** HERO object: something another community built that may be reusable. */
export const ReusableAssetOpportunity = z.object({
  id: z.string(),
  asset_id: z.string(),
  source_disease_id: z.string(),
  headline: z.string(), // "Natural-history protocol from Rett syndrome"
  reuse_classification: ReuseClassification.default("discovery_lead"),
  why_it_may_transfer: z.array(z.string()).min(1),
  what_differs: z.array(z.string()).min(1),
  what_is_uncertain: z.array(z.string()).min(1),
  requires_expert_validation: z.array(z.string()).min(1),
  evidence_edge_ids: z.array(z.string()).min(1),
  confidence: Confidence,
  status: EvidenceStatus,
  next_actions: z.array(ActionRecommendation).min(1),
});
export type ReusableAssetOpportunity = z.infer<typeof ReusableAssetOpportunity>;

export const KnowledgeGap = z.object({
  id: z.string(),
  kind: z.enum(["missing_evidence", "contradictory_evidence", "assumption", "open_question"]),
  statement: z.string(),
  suggested_question_or_experiment: z.string().optional(),
  related_edge_ids: z.array(z.string()).default([]),
});
export type KnowledgeGap = z.infer<typeof KnowledgeGap>;

export const EvidenceCoverage = z.object({
  supported: z.number().int(),
  inferred: z.number().int(),
  contradictory: z.number().int(),
  unknown: z.number().int(),
});
export type EvidenceCoverage = z.infer<typeof EvidenceCoverage>;

/** Build provenance: which OpenAI roles ran, when, with what model. */
export const BuildInfo = z.object({
  built_at: z.string(),
  openai_runs: z
    .array(z.object({ role: z.string(), model: z.string(), run_id: z.string(), created_at: z.string(), summary: z.string() }))
    .default([]),
});
export type BuildInfo = z.infer<typeof BuildInfo>;

/** The full payload the results page renders. */
export const SearchResult = z.object({
  query: z.string(),
  found: z.literal(true),
  is_fixture: z.boolean(),
  fixture_warning: z.string().optional(),
  /** How the query was resolved (e.g. typed "CDKL5" → matched Gene → focus Disease). */
  matched: z.object({ node_id: z.string(), label: z.string(), type: z.string() }),
  disease: z.object({
    node_id: z.string(),
    gene_ids: z.array(z.string()),
    mechanism_ids: z.array(z.string()),
    phenotype_ids: z.array(z.string()),
    coverage: EvidenceCoverage,
  }),
  connections: z.array(CandidateConnection),
  opportunities: z.array(ReusableAssetOpportunity),
  people: z.object({
    organization_ids: z.array(z.string()),
    researcher_ids: z.array(z.string()),
    study_ids: z.array(z.string()),
  }),
  gaps: z.array(KnowledgeGap),
  /** Subgraph for the evidence explorer and drawer lookups. */
  sources: z.array(SourceRecord).default([]),
  build_info: BuildInfo.optional(),
  nodes: z.array(GraphNode),
  edges: z.array(EvidenceEdge),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const NotFoundResult = z.object({
  query: z.string(),
  found: z.literal(false),
  message: z.string(),
  suggestions: z.array(z.string()),
});
export type NotFoundResult = z.infer<typeof NotFoundResult>;

export type SearchResponse = SearchResult | NotFoundResult;

/**
 * On-disk bundle format (data/fixtures/*.json, later data/cache/*.json).
 * Curated layers (connections/opportunities/gaps) sit beside the raw graph so
 * that the ReusableAssetFinder can later compute them instead.
 */
export const GraphBundle = z.object({
  bundle_id: z.string(),
  is_fixture: z.boolean(),
  fixture_warning: z.string().optional(),
  focus_disease_id: z.string(),
  nodes: z.array(GraphNode),
  edges: z.array(EvidenceEdge),
  connections: z.array(CandidateConnection),
  opportunities: z.array(ReusableAssetOpportunity),
  gaps: z.array(KnowledgeGap),
  /** Retrieved source texts every real quote is verified against. Empty for fixtures. */
  sources: z.array(SourceRecord).default([]),
  /** Build provenance: which OpenAI roles ran, when, with what model. */
  build_info: BuildInfo.optional(),
});
export type GraphBundle = z.infer<typeof GraphBundle>;
