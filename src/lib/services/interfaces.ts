/**
 * Service boundaries. UI and API routes depend ONLY on these interfaces.
 * Real providers live in src/lib/providers; the offline ingestion scripts turn
 * their records into a GraphBundle, which src/lib/services/registry.ts loads.
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
  SourceRecord,
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

// ---------- Data providers ----------
// Providers return verbatim SourceRecords. Turning them into graph edges is the
// job of the ingestion pipeline (scripts/), which verifies every quote.

/** MONDO / HPO via EBI OLS4; HGNC REST for genes. */
export interface OntologyProvider {
  searchTerms(ontology: "mondo" | "hp", query: string, rows?: number): Promise<{ obo_id: string; label: string }[]>;
  getTerm(ontology: "mondo" | "hp", oboId: string): Promise<SourceRecord>;
  getGene(symbol: string): Promise<SourceRecord>;
}

/** PubMed/PMC via NCBI E-utilities. */
export interface LiteratureProvider {
  fetchAbstracts(pmids: string[]): Promise<SourceRecord[]>;
  /** Selected sentences from PMC full text, only when its license permits text mining. */
  fetchPmcExcerpt(pmcid: string, pmid: string, sentenceFilter: (s: string) => boolean): Promise<SourceRecord | null>;
}

/** ClinicalTrials.gov API v2. */
export interface TrialsProvider {
  searchStudies(term: string, pageSize?: number): Promise<{ nct: string; title: string; conditions: string[]; status: string; studyType: string }[]>;
  getStudy(nct: string): Promise<SourceRecord>;
}

/** NIH RePORTER API v2. */
export interface FundingResearchProvider {
  getProjectsByCoreNumber(coreProjectNum: string, prefer?: RegExp): Promise<SourceRecord | null>;
}

/** Official organization homepages (title + meta description only). Bright Data is an optional backend. */
export interface PatientOrganizationProvider {
  fetchHomepage(id: string, url: string): Promise<SourceRecord>;
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
