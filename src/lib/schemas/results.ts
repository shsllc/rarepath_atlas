import { z } from "zod";
import type { DiseaseCoverage } from "@/lib/coverage";
import type { DiscoveryPreview } from "@/lib/discovery";
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
  /** Optional featured narrative: each line cites its own evidence edges. */
  story: z.array(z.object({ label: z.string(), text: z.string(), evidence_edge_ids: z.array(z.string()).min(1) })).default([]),
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

/** A person or organization relevant to a research path. Public metadata only; never implies willingness. */
export const Collaborator = z.object({
  node_id: z.string(),
  role: z.string(),
  why_relevant: z.string(),
  identity_note: z.string().optional(),
  collaboration_question: z.string(),
  evidence_edge_ids: z.array(z.string()).min(1),
});
export type Collaborator = z.infer<typeof Collaborator>;

const BriefLine = z.object({ text: z.string(), evidence_edge_ids: z.array(z.string()).min(1) });

/** One-page output a patient-group leader can take into a research conversation. */
export const ActionBrief = z.object({
  opportunity: BriefLine,
  why_surfaced: z.array(BriefLine).min(1),
  existing_assets: z.array(z.object({ asset_id: z.string(), text: z.string(), evidence_edge_ids: z.array(z.string()).min(1) })).min(1),
  who_is_relevant: z.array(z.string()).min(1), // collaborator node ids
  bring_sources: z.array(z.object({ label: z.string(), url: z.string().url(), evidence_edge_ids: z.array(z.string()).min(1) })).min(3),
  question: BriefLine,
  must_validate: z.array(BriefLine).min(1),
  does_not_mean: z.array(BriefLine).min(3),
  /** "What can this patient group do this week?" — concrete, source-linked, never implies willingness. */
  this_week: z
    .object({
      next_step: BriefLine,
      destinations: z.array(z.object({ node_id: z.string(), why: z.string(), evidence_edge_ids: z.array(z.string()).min(1) })).min(1),
      community_ids: z.array(z.string()).min(1),
      community_evidence_edge_ids: z.array(z.string()).min(1),
    })
    .optional(),
});
export type ActionBrief = z.infer<typeof ActionBrief>;

/** Reusable-asset catalogue entry. Status describes evidence for reuse, never validity. */
export const AssetEntry = z.object({
  asset_id: z.string(),
  category: z.enum(["shared_infrastructure", "outcome_measure", "registry_biobank"]),
  status: z.enum(["supported", "potentially_adaptable", "discovery_lead", "not_established"]),
  strongest: z.boolean().default(false),
  what: z.string(),
  why_it_matters: z.string(),
  supported: BriefLine,
  must_validate: BriefLine,
});
export type AssetEntry = z.infer<typeof AssetEntry>;

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
  matched: z.object({ node_id: z.string(), label: z.string(), type: z.string(), via: z.enum(["label", "alias", "identifier"]).optional(), matched_text: z.string().optional() }),
  collaborators: z.array(Collaborator).default([]),
  action_brief: ActionBrief.optional(),
  asset_catalog: z.array(AssetEntry).default([]),
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

/**
 * A supported disease that is NOT the fully reviewed journey. Carries only its reviewed
 * coverage and the reviewed edges behind it: never an action brief, ranking or score.
 */
export type PartialDiseaseResult = {
  query: string;
  found: false;
  partial: true;
  matched: { node_id: string; label: string; type: string; via?: "label" | "alias" | "identifier"; matched_text?: string };
  banner: string;
  coverage: DiseaseCoverage;
  /** Reviewed edges referenced by `coverage` (no OpenAI-only extractions). */
  edges: EvidenceEdge[];
  full_journey: { label: string; query: string };
};

/**
 * A disease outside the reviewed graph, assembled at query time from structured research APIs.
 * Machine-assembled only: no ranking, no reuse classification, no action brief.
 */
export type DiscoveryResult = {
  query: string;
  found: false;
  discovery: true;
  preview: DiscoveryPreview;
  full_journey: { label: string; query: string };
};

export type SearchResponse = SearchResult | NotFoundResult | PartialDiseaseResult | DiscoveryResult;

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
  collaborators: z.array(Collaborator).default([]),
  action_brief: ActionBrief.optional(),
  asset_catalog: z.array(AssetEntry).default([]),
});
export type GraphBundle = z.infer<typeof GraphBundle>;
