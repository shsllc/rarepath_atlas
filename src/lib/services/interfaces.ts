/**
 * Service boundaries. UI and API routes depend ONLY on these interfaces.
 * Gate 1 ships fixture-backed implementations; Gate 2+ swaps in real ones
 * via src/lib/services/registry.ts without touching the UI.
 */
import type {
  CandidateConnection,
  EvidenceEdge,
  EvidenceItem,
  GraphBundle,
  GraphNode,
  NodeType,
  Predicate,
  ReusableAssetOpportunity,
  SearchResponse,
} from "@/lib/schemas";

// ---------- OpenAI runtime roles (sponsor requirement) ----------

export interface ExtractedClaim {
  subject: { text: string; type: NodeType };
  predicate: Predicate;
  object: { text: string; type: NodeType };
  /** Verbatim span from the input text that supports the claim. Required. */
  supporting_quote: string;
  hedged: boolean; // "may", "suggests", etc.
  negated: boolean; // "no association was found"
}

export interface SourceDocument {
  source: string;
  source_url: string;
  source_type: EvidenceItem["source_type"];
  retrieval_date: string;
  text: string;
  citation?: EvidenceItem["citation"];
}

/** Role 1 — extract claims/entities/relationships from biomedical text. */
export interface OpenAIEvidenceExtractor {
  extract(doc: SourceDocument): Promise<ExtractedClaim[]>;
}

export interface ReconciliationResult {
  input: string;
  matched_node_id: string | null;
  match_type: "exact" | "alias" | "synonym" | "none";
  confidence: "high" | "moderate" | "low";
  rationale: string;
}

/** Role 2 — map aliases/synonyms to stable entities (candidate list comes from ontologies, never invented). */
export interface OpenAIEntityReconciler {
  reconcile(mention: string, candidates: GraphNode[]): Promise<ReconciliationResult>;
}

export interface PathExplanation {
  plain_language: string;
  caveats: string[];
  /** Edge ids the explanation relies on — the explainer may not cite anything outside the path. */
  cited_edge_ids: string[];
}

/** Role 3 — translate a supported graph path into patient-readable language. */
export interface OpenAIPathExplainer {
  explain(path: { nodes: GraphNode[]; edges: EvidenceEdge[] }, audience: "family" | "researcher"): Promise<PathExplanation>;
}

// ---------- Data providers (Gate 2+) ----------

/** MONDO / HPO / Orphanet / ClinVar. */
export interface DiseaseDataProvider {
  searchDiseases(query: string): Promise<GraphNode[]>;
  getDisease(externalId: string): Promise<GraphNode | null>;
  getGenes(diseaseExternalId: string): Promise<{ nodes: GraphNode[]; edges: EvidenceEdge[] }>;
  getPhenotypes(diseaseExternalId: string): Promise<{ nodes: GraphNode[]; edges: EvidenceEdge[] }>;
}

/** PubMed / PMC via NCBI E-utilities. */
export interface LiteratureProvider {
  search(query: string, limit?: number): Promise<SourceDocument[]>;
  fetchAbstract(pmid: string): Promise<SourceDocument | null>;
}

/** ClinicalTrials.gov v2 API. */
export interface TrialsProvider {
  searchStudies(condition: string, opts?: { studyType?: "natural_history" | "interventional" | "observational" }): Promise<GraphNode[]>;
  getStudy(nct: string): Promise<{ node: GraphNode; assets: GraphNode[]; edges: EvidenceEdge[] } | null>;
}

/** NIH RePORTER. */
export interface FundingResearchProvider {
  findProjects(query: string): Promise<{ researchers: GraphNode[]; edges: EvidenceEdge[] }>;
}

/** NORD / Global Genes / verified org sites (Bright Data optional). */
export interface PatientOrganizationProvider {
  findOrganizations(diseaseLabel: string): Promise<{ nodes: GraphNode[]; edges: EvidenceEdge[] }>;
}

// ---------- Core domain services ----------

export interface GraphService {
  getNode(id: string): GraphNode | undefined;
  getEdge(id: string): EvidenceEdge | undefined;
  neighbors(nodeId: string, predicates?: Predicate[]): { node: GraphNode; edge: EvidenceEdge }[];
  edgesFor(nodeId: string): EvidenceEdge[];
  /** Resolve a free-text query to a node id via label/alias match. */
  resolve(query: string): GraphNode | undefined;
  bundle(): GraphBundle;
}

export interface ReusableAssetFinder {
  findConnections(diseaseId: string): CandidateConnection[];
  findOpportunities(diseaseId: string): ReusableAssetOpportunity[];
}

export interface SearchService {
  search(query: string): Promise<SearchResponse>;
}
