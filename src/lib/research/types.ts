/**
 * Common contract for the multi-provider DISCOVERY layer.
 *
 * Every provider returns normalized records and links. Everything is machine-assembled:
 * review_status is fixed to "machine_assembled" and links are never eligible for ranking
 * or action. Provider confidence or scores are kept as `source_score`, never mapped onto
 * RarePath's review status or Research Connection Strength. Agreement between providers
 * only adds provenance; it never makes anything "reviewed".
 */

export type ProviderId = "opentargets" | "gwas" | "clinicaltrials" | "europepmc" | "openalex" | "crossref" | "datacite";

/** Stable identifier systems used for reconciliation (lower-case keys). */
export type IdSystem =
  | "doi"
  | "pmid"
  | "pmcid"
  | "mondo"
  | "efo"
  | "orphanet"
  | "omim"
  | "hpo"
  | "hgnc"
  | "ensembl"
  | "symbol"
  | "orcid"
  | "ror"
  | "nct"
  | "openalex"
  | "chembl"
  | "rsid"
  | "clinvar"
  | "gcst"
  | "grant"
  | "datacite";

export interface Provenance {
  provider: ProviderId;
  /** The provider's own id for this record or relationship. */
  source_id: string;
  /** Canonical human-facing URL for the record at the source. */
  url: string;
  /** ISO timestamp of retrieval. */
  retrieved_at: string;
  /** The source's own record / evidence type, verbatim where possible (e.g. "genetic_association", "Dataset"). */
  native_type: string;
}

interface RecordBase {
  /** Canonical key after reconciliation (e.g. "paper:doi:10.1/x"). */
  key: string;
  label: string;
  ids: Partial<Record<IdSystem, string>>;
  provenance: Provenance[];
  review_status: "machine_assembled";
}

export type PublicationStatus = "peer_reviewed" | "preprint" | "unknown";

export type DiseaseRecord = RecordBase & { kind: "disease"; synonyms: string[]; description?: string };
export type GeneRecord = RecordBase & { kind: "gene"; name?: string };
export type VariantRecord = RecordBase & { kind: "variant" };
export type PhenotypeRecord = RecordBase & { kind: "phenotype" };
export type PaperRecord = RecordBase & {
  kind: "paper";
  year?: number;
  venue?: string;
  publication_status: PublicationStatus;
  publication_types: string[];
  open_access?: boolean;
  full_text_available?: boolean;
  full_text_url?: string;
  cited_by_count?: number;
  abstract?: string;
  authors: string[];
  /** Set when Crossref returned matching DOI metadata. */
  metadata_verified_by?: "crossref";
  /** Retraction / correction / update notices deposited with Crossref. */
  update_notices: string[];
  /** Node id in the reviewed bundle when the same PMID/DOI already exists there. */
  in_reviewed_graph?: string;
};
export type PersonRecord = RecordBase & { kind: "person"; affiliations: string[]; roles: string[] };
export type InstitutionRecord = RecordBase & { kind: "institution"; country?: string };
export type StudyRecord = RecordBase & {
  kind: "study";
  /** Raw ClinicalTrials.gov overallStatus enum, never collapsed. */
  status: string;
  status_label: string;
  phases: string[];
  study_type?: string;
  conditions: string[];
  interventions: string[];
  sponsor?: string;
  collaborators: string[];
  start_date?: string;
  completion_date?: string;
  countries: string[];
  enrollment?: number;
};
export type GrantRecord = RecordBase & { kind: "grant"; funder: string };
export type DatasetRecord = RecordBase & { kind: "dataset"; resource_type: string; publisher?: string; year?: number; description?: string; subjects: string[] };
export type DrugRecord = RecordBase & { kind: "drug"; stage: string; drug_type?: string };

export type ResearchRecord =
  | DiseaseRecord
  | GeneRecord
  | VariantRecord
  | PhenotypeRecord
  | PaperRecord
  | PersonRecord
  | InstitutionRecord
  | StudyRecord
  | GrantRecord
  | DatasetRecord
  | DrugRecord;
export type RecordKind = ResearchRecord["kind"];

export type LinkRelation =
  | "associated_with" // disease ↔ gene, as listed by the source (not causation)
  | "variant_classified_for" // ClinVar classification of a variant for a condition
  | "gwas_association" // statistical association (not causation)
  | "subclass_of" // ontology hierarchy (not clinical similarity)
  | "has_phenotype"
  | "gene_associated_with_other_disease" // same gene listed for another disease (not shared mechanism)
  | "recorded_drug_candidate" // drug/candidate recorded for a disease (not a recommendation)
  | "studies_condition" // trial lists the condition
  | "sponsored_by"
  | "collaborator_on"
  | "investigator_on"
  | "mentions_disease" // paper/dataset retrieved by a disease search
  | "authored"
  | "affiliated_with"
  | "cites"
  | "funded_by"
  | "author_other_research"; // discovery lead: same identified author's other work

export interface ResearchLink {
  key: string;
  from: string;
  to: string;
  relation: LinkRelation;
  native_evidence_type: string;
  statement: string;
  /** True when the relationship is a navigation lead (co-occurrence, search hit), not a stated fact. */
  discovery_lead: boolean;
  /** A provider's own score, kept verbatim and labelled. Never a RarePath score. */
  source_score?: { name: string; value: number };
  provenance: Provenance[];
  review_status: "machine_assembled";
  eligible_for_ranking: false;
  eligible_for_action: false;
}

export interface DiseaseContext {
  query: string;
  label: string;
  /** Ontology id in Open Targets form, e.g. MONDO_0100135. Absent when resolution failed. */
  ontology_id?: string;
  synonyms: string[];
}

export interface ProviderResult {
  records: ResearchRecord[];
  links: ResearchLink[];
  /** Totals reported by the source (e.g. hitCount), which can exceed what was fetched. */
  totals: Record<string, number>;
  notes?: string[];
}

export type ProviderRole = "discovery" | "metadata";
export type ProviderMode = "live" | "offline";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  role: ProviderRole;
  mode: ProviderMode;
  data_types: string[];
  homepage: string;
}

export interface ProviderContext {
  disease: DiseaseContext;
  /** Records assembled by upstream providers (for enrichment providers). */
  upstream: ResearchRecord[];
  now: () => Date;
}

export interface ResearchProvider {
  meta: ProviderMeta;
  /** Providers listed here must finish first; their records arrive in ctx.upstream. */
  dependsOn?: ProviderId[];
  /** True when the provider needs a resolved ontology id. */
  needsOntologyId?: boolean;
  run(ctx: ProviderContext): Promise<ProviderResult>;
}

export const MACHINE = { review_status: "machine_assembled" as const, eligible_for_ranking: false as const, eligible_for_action: false as const };

export function link(
  l: Omit<ResearchLink, "key" | "review_status" | "eligible_for_ranking" | "eligible_for_action" | "discovery_lead"> & { discovery_lead?: boolean },
): ResearchLink {
  return { ...l, key: `${l.from}|${l.relation}|${l.to}`, discovery_lead: l.discovery_lead ?? false, ...MACHINE };
}
