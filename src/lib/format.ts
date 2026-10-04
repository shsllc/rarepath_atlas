import type { Predicate, ResearchAssetKind } from "@/lib/schemas";

export const PREDICATE_LABEL: Record<Predicate, string> = {
  caused_by_variant_in: "is caused by changes in",
  has_variant: "has variant",
  has_phenotype: "has feature",
  involves_mechanism: "involves",
  phenotypically_overlaps: "shares features with",
  shares_mechanism_with: "may share a mechanism with",
  historically_classified_with: "was historically grouped with",
  classified_as_variant_of: "is classified as a variant of",
  co_studied_with: "was studied in the same research infrastructure as",
  clinically_differs_from: "differs clinically from",
  applied_to: "has been applied in",
  informed_development_of: "informed the development of",
  authored: "is an author of",
  studied_in: "is studied in",
  produced_asset: "produced",
  asset_measures: "measures",
  supports_community: "supports",
  investigates: "investigates",
  described_in: "is described in",
};

export const ASSET_KIND_LABEL: Record<ResearchAssetKind, string> = {
  natural_history_protocol: "Natural-history protocol",
  registry: "Registry",
  disease_model: "Disease model",
  biomarker: "Biomarker",
  outcome_measure: "Outcome measure",
  clinical_study_design: "Clinical study design",
  research_infrastructure: "Research infrastructure",
  investigator_relationship: "Investigator relationship",
};

export const CONNECTION_TYPE_LABEL = {
  phenotypic_overlap: "Overlapping features",
  shared_gene: "Shared gene",
  shared_mechanism: "Shared mechanism",
  historical_classification: "Historical classification",
  shared_asset: "Shared research asset",
  shared_research_infrastructure: "Shared research infrastructure",
  clinical_difference: "Important clinical differences",
} as const;

export const REUSE_LABEL = {
  directly_reusable: "Directly reusable",
  potentially_adaptable: "Potentially adaptable",
  shared_infrastructure_precedent: "Shared research-infrastructure precedent",
  discovery_lead: "Discovery lead — needs expert review",
} as const;

export const METHOD_LABEL = {
  structured_api: "Copied from the source's API record",
  analyst_quote: "Verbatim quote selected by an analyst",
  openai_extractor: "Extracted by OpenAI Evidence Extractor (quote verified verbatim)",
  fixture: "Demo fixture (not retrieved)",
} as const;
