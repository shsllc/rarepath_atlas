/**
 * 10× framing. Deliberately contains NO time-saving numbers: the claim is about
 * compressing many disconnected steps into one evidence-backed workflow, and the
 * metrics needed to quantify it are listed explicitly. tests/tenx.test.ts enforces this.
 */
export const TENX = {
  milestone: "Identifying and evaluating an existing research asset or collaboration precedent",
  claim:
    "RarePath compresses the discovery and evidence-assembly portion of this milestone from many disconnected research steps into one evidence-backed workflow.",
  notClaimed: "We do not claim RarePath makes treatments happen faster. The 10× case is about one early milestone, and it still has to be measured.",
  traditional: [
    "Search PubMed manually",
    "Search disease registries",
    "Search ClinicalTrials.gov",
    "Identify adjacent disease communities",
    "Work out whether shared infrastructure existed",
    "Contact researchers",
    "Compare protocols and outcome measures",
    "Decide whether anything is reusable",
  ],
  rarepath: [
    "Search the disease",
    "See evidence-backed adjacent research history",
    "Discover the shared study and infrastructure",
    "Inspect exactly why each connection exists",
    "See known differences and limitations",
    "Identify the reusable or adaptable research asset",
    "Leave with a concrete validation question",
  ],
  measures: [
    "Analyst hours to reach the same shortlist (with and without RarePath)",
    "Number of databases searched manually",
    "Time to identify a relevant shared research asset",
    "Time to assemble an evidence pack for a first collaboration conversation",
    "Expert-rated accuracy of the connections and limitations surfaced",
  ],
} as const;

/** Source systems behind a result, derived from stored SourceRecord kinds (facts, not estimates). */
export const SOURCE_SYSTEM_BY_KIND: Record<string, string> = {
  pubmed_abstract: "PubMed",
  pmc_excerpt: "PubMed Central",
  ctgov_record: "ClinicalTrials.gov",
  funding_record: "NIH RePORTER",
  ontology_term: "MONDO / HPO (EBI OLS)",
  gene_record: "HGNC",
  org_homepage: "Organization websites",
};

/**
 * Layer 2 of the impact story: a forward HYPOTHESIS, never presented as measured.
 * No time estimates: there is no sourced baseline for this milestone.
 */
export const HYPOTHESIS = {
  badge: "Hypothesis — not yet measured",
  milestone: "A research-ready natural-history and outcome-measure plan for CDD",
  traditional: [
    "Identify related communities",
    "Search studies",
    "Locate reusable infrastructure",
    "Identify researchers",
    "Compare populations",
    "Evaluate outcome measures",
    "Assemble evidence",
    "Design the research plan",
  ],
  rarepath: ["Ranked research connection", "Reusable infrastructure", "Relevant investigators", "Counter-evidence", "Validation questions", "Research Action Brief"],
  statement:
    "RarePath could contribute toward a 10× reduction in the discovery and planning portion of reaching this milestone, if reuse eliminates duplicated discovery and setup work.",
  assumptions: [
    "The relevant infrastructure is still accessible",
    "Researchers and patient groups confirm it applies",
    "The existing assets can actually be reused",
    "Validation does not uncover disqualifying differences",
    "Downstream institutional and regulatory timelines remain outside RarePath's control",
  ],
  validation: [
    "Test with multiple patient groups",
    "Measure the baseline time without RarePath",
    "Measure the RarePath-assisted time",
    "Track whether the assets and collaborators found are actually usable",
    "Compare time to the research-ready milestone",
  ],
} as const;
