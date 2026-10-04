/**
 * Common contract for the multi-provider DISCOVERY layer.
 *
 * Every provider returns normalized records and links. Everything is machine-assembled:
 * review_status is fixed to "machine_assembled" and links are never eligible for ranking
 * or action. Provider confidence or scores are kept as `source_score`, never mapped onto
 * RarePath's review status or Research Connection Strength. Agreement between providers
 * only adds provenance; it never makes anything "reviewed".
 */

export type ProviderId = "opentargets" | "gwas" | "clinicaltrials" | "europepmc" | "openalex" | "crossref" | "datacite" | "trialpubs" | "monarch" | "orphadata" | "hpo" | "clingen" | "clinvar" | "alliance";

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
  | "datacite"
  | "eudract"
  | "ctis"
  | "utn"
  | "orgname"
  | "gard"
  | "vcv"
  | "model";

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

export type DiseaseRecord = RecordBase & {
  kind: "disease";
  synonyms: string[];
  description?: string;
  /** Orphanet epidemiology, verbatim classes; never interpreted further. */
  epidemiology?: { type: string; class?: string; geographic?: string; qualification?: string; validation?: string }[];
  /** Orphanet natural-history fields, verbatim. */
  natural_history?: { onset: string[]; inheritance: string[] };
  /** How an Orphanet record was tied to the MONDO disease (shared exact-mapped identifier), or why it was not. */
  mapping_basis?: string;
};
export type GeneRecord = RecordBase & { kind: "gene"; name?: string; taxon?: string };
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
/** Status families. Never flattened into "assets": terminated and withdrawn studies are cautions. */
export type StudyStatusCategory = "active" | "completed" | "caution" | "unknown";
/** Infrastructure flags, each recorded only when a source field states it. */
export type StudyInfrastructure = "natural_history" | "registry" | "observational_cohort" | "longitudinal" | "biobank";

export type StudyRecord = RecordBase & {
  kind: "study";
  /** Raw ClinicalTrials.gov overallStatus enum, never collapsed. */
  status: string;
  status_label: string;
  status_category: StudyStatusCategory;
  why_stopped?: string;
  official_title?: string;
  phases: string[];
  study_type?: string;
  design: {
    allocation?: string;
    intervention_model?: string;
    masking?: string;
    primary_purpose?: string;
    observational_model?: string;
    time_perspective?: string;
    patient_registry?: boolean;
  };
  conditions: string[];
  interventions: string[];
  intervention_details: { type: string; name: string }[];
  outcomes: { role: "primary" | "secondary" | "other"; measure: string; time_frame?: string; description?: string }[];
  sponsor?: string;
  sponsor_class?: string;
  collaborators: string[];
  responsible_party?: string;
  start_date?: string;
  primary_completion_date?: string;
  completion_date?: string;
  last_update?: string;
  countries: string[];
  locations: { facility?: string; city?: string; state?: string; country?: string }[];
  enrollment?: number;
  enrollment_type?: string;
  eligibility: { sex?: string; minimum_age?: string; maximum_age?: string; age_groups: string[] };
  has_results: boolean;
  documents: { label: string; url: string; protocol: boolean; sap: boolean }[];
  infrastructure: { flag: StudyInfrastructure; basis: string }[];
};
export type OrganizationRecord = RecordBase & { kind: "organization"; org_class?: string };
/** A model-organism or experimental model. Preclinical: never implies human clinical relevance. */
export type ModelRecord = RecordBase & { kind: "model"; species: string; model_type: string; disease_context?: string };
export type OutcomeMeasureRecord = RecordBase & {
  kind: "outcome_measure";
  /** Source-native wording; RarePath does not reclassify it as biomarker / PRO unless a source says so. */
  measure: string;
  roles: ("primary" | "secondary" | "other")[];
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
  | DrugRecord
  | OrganizationRecord
  | OutcomeMeasureRecord
  | ModelRecord;
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
  | "author_other_research" // discovery lead: same identified author's other work
  | "uses_outcome_measure" // registered study lists this outcome measure
  | "trial_publication" // ClinicalTrials.gov lists the paper as a RESULT or DERIVED reference
  | "trial_background_reference" // ClinicalTrials.gov lists the paper as BACKGROUND (not a result)
  | "paper_mentions_trial" // Europe PMC text-mining finds the NCT id in the paper (a lead)
  | "causal_gene" // a curated source states the gene causes the disease (Monarch / Orphanet), kept with its knowledge source
  | "clingen_validity" // ClinGen expert-curated gene-disease validity classification (source-native)
  | "dosage_sensitivity" // ClinGen dosage-sensitivity curation for a gene
  | "phenotype_excluded" // a curated NOT annotation: the feature is documented as absent
  | "ortholog_of" // Alliance orthology
  | "model_of"; // preclinical model of a disease context (not human clinical relevance)

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
  /** Source-native qualifiers (frequency, onset, sex, evidence code, classification, review status…), never reinterpreted. */
  qualifiers?: Record<string, string>;
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
