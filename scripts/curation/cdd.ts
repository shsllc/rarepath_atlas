/**
 * Curation spec for the featured CDKL5 deficiency disorder journey.
 *
 * Every `quote` MUST appear verbatim (whitespace-normalised) in the stored
 * source text named by `src`; scripts/build-real-bundle.ts refuses to build otherwise.
 * External ids are copied only from retrieved ontology/gene records.
 * Plain-language text (why/differs/uncertain) must restate cited quotes, nothing more.
 */
import type { Confidence, ContradictionStatus, GraphNode, KnowledgeGap, Predicate, ReuseClassification } from "../../src/lib/schemas";

export interface EvidenceSpec {
  src: string; // SourceRecord id
  quote: string;
  stance?: "supports" | "contradicts" | "qualifies";
}

export interface EdgeSpec {
  key: string;
  s: string;
  p: Predicate;
  o: string;
  confidence: Confidence;
  contradiction?: ContradictionStatus;
  contradiction_notes?: string;
  evidence: EvidenceSpec[];
}

type NodeSpec = Omit<GraphNode, "verification" | "external_ids"> & {
  /** [system, id, sourceRecordId] — id must appear in that record's text. */
  ids?: [string, string, string][];
  // loose typing for type-specific fields
  [k: string]: unknown;
};

const P1 = "pubmed:32472944"; // Cutri-French 2020, Ann Neurol — comparison of 4 DEs in the Rett NHS
const PMC1 = "pmc:PMC8882337"; // full-text excerpts of the same paper
const P2 = "pubmed:35483386"; // Leonard 2022, Lancet Neurol — CDD review
const P3 = "pubmed:39867409"; // Aledo-Serrano 2025, medRxiv PREPRINT — CDD into adulthood
const P4 = "pubmed:31147226"; // Demarest 2019, Pediatr Neurol — CDD severity assessment (ref 22 of P1)
const NHS = "ctgov:NCT02738281";
const BIO = "ctgov:NCT02705677";
const GRANT = "reporter:U54HD061222";

export const NODES: NodeSpec[] = [
  {
    id: "disease:cdd",
    type: "Disease",
    label: "CDKL5 deficiency disorder",
    aliases: ["CDD", "CDKL5 deficiency", "CDKL5 disorder", "CDKL5-related disorder", "CDKL5-deficiency disorder", "CDKL5-deficency disorder", "CDKL5 Deficiency Disorder"],
    ids: [
      ["MONDO", "MONDO:0100039", "mondo:MONDO:0100039"],
      ["GARD", "GARD:0026021", "mondo:MONDO:0100039"],
    ],
    lay_summary:
      "A rare genetic condition caused by changes in the CDKL5 gene. Seizures usually begin within the first two months of life. It was once thought to be a form of Rett syndrome but is now recognised as its own disorder.",
    inheritance: [],
  },
  {
    id: "disease:rett",
    type: "Disease",
    label: "Rett syndrome",
    aliases: ["RTT", "Rett", "Rett’s disease", "T-RTT"],
    ids: [
      ["MONDO", "MONDO:0010726", "mondo:MONDO:0010726"],
      ["OMIM", "OMIM:312750", "mondo:MONDO:0010726"],
      ["ORPHA", "Orphanet:778", "mondo:MONDO:0010726"],
    ],
    lay_summary: "A rare, severe neurodevelopmental disorder.",
    inheritance: [],
  },
  {
    id: "disease:foxg1",
    type: "Disease",
    label: "FOXG1 disorder",
    aliases: ["FOXG1 syndrome", "FOXG1", "FOGX1", "FOXG1 Syndrome", "FOXG1 Disorders"],
    ids: [
      ["MONDO", "MONDO:0100040", "mondo:MONDO:0100040"],
      ["OMIM", "OMIM:613454", "mondo:MONDO:0100040"],
      ["ORPHA", "Orphanet:561854", "mondo:MONDO:0100040"],
    ],
    lay_summary: "A rare neurodevelopmental disorder caused by changes in the FOXG1 gene.",
    inheritance: [],
  },
  {
    id: "disease:mdd",
    type: "Disease",
    label: "MECP2 duplication syndrome",
    aliases: ["MECP2 duplication disorder", "MDD", "MECP2 Dup", "MECP2 Duplication", "MECP2 duplication syndrome", "Xq28 (MECP2) duplication"],
    description: "MONDO files this under the label 'syndromic X-linked intellectual disability Lubs type' and lists 'MECP2 duplication syndrome' as a synonym.",
    ids: [
      ["MONDO", "MONDO:0010283", "mondo:MONDO:0010283"],
      ["OMIM", "OMIM:300260", "mondo:MONDO:0010283"],
      ["ORPHA", "Orphanet:1762", "mondo:MONDO:0010283"],
    ],
    inheritance: [],
  },

  { id: "gene:cdkl5", type: "Gene", label: "CDKL5", symbol: "CDKL5", aliases: ["STK9"], ids: [["HGNC", "HGNC:11411", "hgnc:HGNC:11411"]] },
  { id: "gene:foxg1", type: "Gene", label: "FOXG1", symbol: "FOXG1", aliases: [], ids: [["HGNC", "HGNC:3811", "hgnc:HGNC:3811"]] },

  { id: "pheno:seizure", type: "Phenotype", label: "Seizure", aliases: ["seizures", "epilepsy"], ids: [["HPO", "HP:0001250", "hp:HP:0001250"]] },
  { id: "pheno:spasm", type: "Phenotype", label: "Epileptic spasm", aliases: ["epileptic spasms", "infantile spasms"], ids: [["HPO", "HP:0011097", "hp:HP:0011097"]] },
  { id: "pheno:cvi", type: "Phenotype", label: "Cerebral visual impairment", aliases: ["CVI"], ids: [["HPO", "HP:0100704", "hp:HP:0100704"]] },
  { id: "pheno:regression", type: "Phenotype", label: "Developmental regression", aliases: ["regression"], ids: [["HPO", "HP:0002376", "hp:HP:0002376"]] },

  {
    id: "study:nhs",
    type: "Study",
    label: "Natural History of Rett Syndrome & Related Disorders (NCT02738281)",
    aliases: ["Rett and Rett-Related Disorders Natural History Study", "Rett Natural History Study", "Natural History Study", "NHS"],
    study_type: "natural_history",
    ids: [["NCT", "NCT02738281", NHS]],
  },
  {
    id: "study:biobank",
    type: "Study",
    label: "Biobanking of Rett Syndrome and Related Disorders (NCT02705677)",
    aliases: [],
    study_type: "biobank",
    ids: [["NCT", "NCT02705677", BIO]],
  },

  {
    id: "asset:nhs-infrastructure",
    type: "ResearchAsset",
    asset_kind: "research_infrastructure",
    owner_disease_id: "disease:rett",
    label: "Rett and Rett-related disorders natural-history infrastructure (multi-site network and study database)",
    aliases: [],
    access_notes: "Run by the Rare Diseases Clinical Research Network (RDCRN 5211) with NIH funding (U54HD061222). Data-access terms are not stated in the retrieved sources.",
    ids: [],
  },
  {
    id: "asset:rtt-css",
    type: "ResearchAsset",
    asset_kind: "outcome_measure",
    owner_disease_id: "disease:rett",
    label: "RTT Clinical Severity Scale (CSS) and RTT Clinical Global Impression–Severity",
    aliases: ["Clinical Severity Scale", "CSS"],
    access_notes: "Published scale (Schanen et al., cited in PMID 32472944). Licensing not checked.",
    ids: [],
  },
  {
    id: "asset:cds",
    type: "ResearchAsset",
    asset_kind: "outcome_measure",
    owner_disease_id: "disease:cdd",
    label: "CDKL5 Developmental Score (CDS)",
    aliases: ["CDS", "CDKL5 Developmental Score"],
    ids: [],
  },
  {
    id: "asset:cdd-severity",
    type: "ResearchAsset",
    asset_kind: "outcome_measure",
    owner_disease_id: "disease:cdd",
    label: "CDKL5 Deficiency Disorder severity assessment (Demarest et al., 2019)",
    aliases: ["CDD severity assessment", "severity assessment"],
    access_notes: "Published in Pediatric Neurology 2019 (PMID 31147226). The authors state ongoing validation is required.",
    ids: [],
  },
  {
    id: "asset:biobank",
    type: "ResearchAsset",
    asset_kind: "research_infrastructure",
    owner_disease_id: "disease:rett",
    label: "Rett and related disorders biospecimen collection (DNA, RNA, plasma, cell lines)",
    aliases: [],
    access_notes: "Registry status: completed. Sample availability and access terms not stated in the retrieved record.",
    ids: [],
  },

  { id: "paper:32472944", type: "Paper", label: "Comparison of Core Features in Four Developmental Encephalopathies in the Rett Natural History Study", aliases: [], ids: [["PMID", "32472944", P1]] },
  { id: "paper:35483386", type: "Paper", label: "CDKL5 deficiency disorder: clinical features, diagnosis, and management", aliases: [], ids: [["PMID", "35483386", P2]] },
  { id: "paper:31147226", type: "Paper", label: "Severity Assessment in CDKL5 Deficiency Disorder", aliases: [], ids: [["PMID", "31147226", P4]] },
  { id: "paper:39867409", type: "Paper", label: "The natural history of CDKL5 deficiency disorder into adulthood (preprint)", aliases: [], ids: [["PMID", "39867409", P3]] },

  { id: "org:ifcr", type: "PatientOrganization", label: "International Foundation for CDKL5 Research", aliases: ["IFCR"], website: "https://cdkl5.com/", ids: [] },
  { id: "org:loulou", type: "PatientOrganization", label: "Loulou Foundation", aliases: ["LouLou Foundation"], website: "https://www.louloufoundation.org/", ids: [] },
  { id: "org:irsf", type: "PatientOrganization", label: "International Rett Syndrome Foundation", aliases: ["IRSF"], website: "https://www.rettsyndrome.org/", ids: [] },
  { id: "org:foxg1rf", type: "PatientOrganization", label: "FOXG1 Research Foundation", aliases: [], website: "https://www.foxg1research.org/", ids: [] },

  { id: "researcher:percy", type: "Researcher", label: "Alan K Percy, MD", affiliation: "University of Alabama at Birmingham", aliases: ["Percy A", "Alan Percy"], description: "Listed on ClinicalTrials.gov as principal investigator of NCT02738281.", ids: [] },
  {
    id: "researcher:demarest",
    type: "Researcher",
    label: "Demarest S (Children's Hospital Colorado)",
    affiliation: "Children's Hospital Colorado and University of Colorado",
    aliases: ["Demarest S"],
    description: "First author of the CDD severity assessment (PMID 31147226); same name and institution on the 2022 CDD review (PMID 35483386).",
    ids: [],
  },
  { id: "researcher:neul", type: "Researcher", label: "Jeffrey L Neul, MD, PhD", affiliation: "Vanderbilt University", aliases: ["Neul JL"], description: "Listed on ClinicalTrials.gov as study director of NCT02738281.", ids: [] },
];

const CONDITIONS_NHS = "Conditions: Rett Syndrome; MECP2 Duplication dIsorder; CDKL5 Disorder; FOXG1 Syndrome";
const ENROLLED_793 = "Comprehensive clinical information was collected from 793 individuals enrolled in the Rett and Rett-Related Disorders Natural History Study.";
const CDD_YOUNGEST = "Individuals with CDKL5-deficency disorder were the most severely affected and had the youngest age at seizure onset (2 months)";

export const EDGES: EdgeSpec[] = [
  // ---- genes
  { key: "cdd-gene", s: "disease:cdd", p: "caused_by_variant_in", o: "gene:cdkl5", confidence: "high", evidence: [{ src: "mondo:MONDO:0100039", quote: "are caused by mutations in the gene CDKL5" }] },
  { key: "foxg1-gene", s: "disease:foxg1", p: "caused_by_variant_in", o: "gene:foxg1", confidence: "high", evidence: [{ src: "mondo:MONDO:0100040", quote: "are caused by mutations in the gene FOXG1" }] },

  // ---- history: stated as history (supported) …
  {
    key: "history",
    s: "disease:cdd",
    p: "historically_classified_with",
    o: "disease:rett",
    confidence: "high",
    evidence: [
      { src: P2, quote: "Although initially considered a variant of Rett syndrome, CDD is now recognised as an independent disorder" },
      { src: PMC1, quote: "they were often imprecisely named “atypical or variant RTT” or “RTT-like”" },
      // Trimmed on purpose: the rest of this sentence ("no direct comparison has been performed") describes the
      // situation before this 2020 paper, which is itself that comparison. Out of context it reads as current fact.
      { src: P1, quote: "Although they are historically linked" },
    ],
  },
  // … and the classification claim itself (contradicted by current literature)
  {
    key: "variant-claim",
    s: "disease:cdd",
    p: "classified_as_variant_of",
    o: "disease:rett",
    confidence: "high",
    contradiction: "contradicted",
    contradiction_notes:
      "Superseded classification. Older naming grouped CDKL5-related cases under 'Atypical Rett Syndrome'. Current literature recognises CDD as an independent developmental and epileptic encephalopathy, and the 2020 Natural History Study comparison recommends against 'variant RTT' nomenclature.",
    evidence: [
      { src: "mondo:MONDO:0100039", quote: "eponymously named Early Infantile Epileptic Encephalopathy, Atypical Rett Syndrome, West Syndrome", stance: "supports" },
      { src: P2, quote: "CDD is now recognised as an independent disorder and classified as a developmental epileptic encephalopathy", stance: "contradicts" },
      { src: PMC1, quote: "The nomenclature “RTT-like”, “variant RTT”, or similar should not be used.", stance: "contradicts" },
      { src: P1, quote: "clear differences in severity, regression, and seizures warrant considering them as unique disorders", stance: "contradicts" },
    ],
  },

  // ---- shared research infrastructure
  { key: "costudy-rett", s: "disease:cdd", p: "co_studied_with", o: "disease:rett", confidence: "high", evidence: [{ src: P1, quote: ENROLLED_793 }, { src: NHS, quote: CONDITIONS_NHS }] },
  { key: "costudy-foxg1", s: "disease:cdd", p: "co_studied_with", o: "disease:foxg1", confidence: "high", evidence: [{ src: P1, quote: ENROLLED_793 }, { src: NHS, quote: CONDITIONS_NHS }] },
  { key: "costudy-mdd", s: "disease:cdd", p: "co_studied_with", o: "disease:mdd", confidence: "high", evidence: [{ src: P1, quote: ENROLLED_793 }, { src: NHS, quote: CONDITIONS_NHS }] },
  {
    key: "cdd-in-nhs",
    s: "disease:cdd",
    p: "studied_in",
    o: "study:nhs",
    confidence: "high",
    evidence: [
      { src: NHS, quote: CONDITIONS_NHS },
      { src: NHS, quote: "RTT-related disorders including those with mutations or deletions in CDKL5 and FOXG1 genes" },
    ],
  },
  { key: "rett-in-nhs", s: "disease:rett", p: "studied_in", o: "study:nhs", confidence: "high", evidence: [{ src: NHS, quote: CONDITIONS_NHS }] },
  { key: "foxg1-in-nhs", s: "disease:foxg1", p: "studied_in", o: "study:nhs", confidence: "high", evidence: [{ src: NHS, quote: CONDITIONS_NHS }] },
  { key: "mdd-in-nhs", s: "disease:mdd", p: "studied_in", o: "study:nhs", confidence: "high", evidence: [{ src: NHS, quote: CONDITIONS_NHS }] },
  {
    key: "nhs-paper",
    s: "study:nhs",
    p: "described_in",
    o: "paper:32472944",
    confidence: "high",
    evidence: [{ src: PMC1, quote: "Participants were recruited at one of 15 clinical sites that are part of the multicenter NIH funded Natural History Study of Rett Syndrome and Related Disorders (clinicaltrials.gov NCT02738281)." }],
  },
  {
    key: "nhs-infra",
    s: "study:nhs",
    p: "produced_asset",
    o: "asset:nhs-infrastructure",
    confidence: "high",
    evidence: [
      { src: NHS, quote: "Organization study ID: RDCRN 5211" },
      { src: GRANT, quote: "Project title: Rett syndrome, MECP2 Duplications, and Rett-related Disorders Natural History" },
      { src: GRANT, quote: "This RDCRC will focus on three distinct disorders: RTT, MECP2 duplication disorder, and the RTT-related disorders including CDKL5, FOXG1, and individuals with MECP2 mutations but lacking clinical criteria for RTT." },
      { src: GRANT, quote: "will rely principally on the Data Management and Coordinating Center for protocol management, data storage, a website portal, and biostatistical support" },
      { src: PMC1, quote: "potentially performed using the Natural History Study database" },
      { src: NHS, quote: "Primary outcome: Clinical and neurobehavioral longitudinal assessments in Rett syndrome (RTT) as reported by the mean Clinical Severity Scale (CSS) at 5 years", stance: "qualifies" },
      { src: NHS, quote: "Secondary outcome: Quality of Life Measures in RTT-related disorders", stance: "qualifies" },
    ],
  },
  {
    key: "infra-cdd",
    s: "asset:nhs-infrastructure",
    p: "applied_to",
    o: "disease:cdd",
    confidence: "high",
    evidence: [
      { src: NHS, quote: "RTT-related disorders including those with mutations or deletions in CDKL5 and FOXG1 genes" },
      { src: P1, quote: ENROLLED_793 },
      { src: GRANT, quote: "the RTT-related disorders including CDKL5, FOXG1" },
    ],
  },
  {
    key: "cdd-in-biobank",
    s: "disease:cdd",
    p: "studied_in",
    o: "study:biobank",
    confidence: "high",
    evidence: [{ src: BIO, quote: "Conditions: Rett Syndrome; MECP2 Duplication; CDKL5; FOXG1 Disorders" }, { src: BIO, quote: "RTT-related disorders including CDKL5, FOXG1" }],
  },
  {
    key: "biobank-asset",
    s: "study:biobank",
    p: "produced_asset",
    o: "asset:biobank",
    confidence: "high",
    evidence: [
      { src: BIO, quote: "biological materials (DNA, RNA, plasma, cell lines) will be collected from affected" },
      { src: BIO, quote: "clinical investigators currently do not have any biomarkers of disease status, clinical severity, or responsiveness to therapeutic intervention" },
      { src: BIO, quote: "Secondary ID: U54HD061222 (NIH)" },
    ],
  },

  // ---- shared AND distinct clinical features
  {
    key: "overlap-rett",
    s: "disease:cdd",
    p: "phenotypically_overlaps",
    o: "disease:rett",
    confidence: "moderate",
    evidence: [
      { src: P1, quote: "are developmental encephalopathies with shared and distinct features" },
      { src: P1, quote: "Although these developmental encephalopathies share many clinical features" },
    ],
  },
  {
    key: "differs-rett",
    s: "disease:cdd",
    p: "clinically_differs_from",
    o: "disease:rett",
    confidence: "high",
    evidence: [
      { src: P1, quote: CDD_YOUNGEST },
      { src: P1, quote: "Developmental regression occurred in all Rett syndrome participants (median = 18 months) but only 23 to 34% of the other disorders." },
      { src: P1, quote: "Seizure incidence prior to the baseline visit was highest for CDKL5 deficiency disorder (96.2%) and lowest for Rett syndrome (47.5%)." },
      { src: PMC1, quote: "support classifying these DEs as distinct disorders to understand the unique clinical features and prognosis of each" },
    ],
  },
  {
    key: "differs-mdd",
    s: "disease:cdd",
    p: "clinically_differs_from",
    o: "disease:mdd",
    confidence: "high",
    evidence: [{ src: P1, quote: CDD_YOUNGEST }, { src: P1, quote: "children with MECP2 duplication syndrome had the oldest median age at seizure onset (64 months) and lowest severity scores" }],
  },
  {
    key: "differs-foxg1",
    s: "disease:cdd",
    p: "clinically_differs_from",
    o: "disease:foxg1",
    confidence: "moderate",
    evidence: [{ src: P1, quote: CDD_YOUNGEST }, { src: P1, quote: "Rett syndrome and FOGX1 were intermediate in both features." }],
  },

  // ---- phenotypes (small, high-information set)
  {
    key: "cdd-seizure",
    s: "disease:cdd",
    p: "has_phenotype",
    o: "pheno:seizure",
    confidence: "high",
    evidence: [
      { src: P2, quote: "It is characterised by early-onset (generally within the first 2 months of life) seizures that are usually refractory to polypharmacy." },
      { src: P1, quote: "Seizure incidence prior to the baseline visit was highest for CDKL5 deficiency disorder (96.2%)" },
    ],
  },
  { key: "cdd-spasm", s: "disease:cdd", p: "has_phenotype", o: "pheno:spasm", confidence: "moderate", evidence: [{ src: P3, quote: "typically beginning with epileptic spasms or tonic seizures before 4 months of age" }] },
  { key: "cdd-cvi", s: "disease:cdd", p: "has_phenotype", o: "pheno:cvi", confidence: "moderate", evidence: [{ src: P2, quote: "the prevalence of cerebral visual impairment appears higher in CDD" }] },
  {
    key: "cdd-regression",
    s: "disease:cdd",
    p: "has_phenotype",
    o: "pheno:regression",
    confidence: "moderate",
    evidence: [
      { src: P1, quote: "but only 23 to 34% of the other disorders" },
      { src: P3, quote: "45% had regressed developmentally" },
    ],
  },
  { key: "rett-regression", s: "disease:rett", p: "has_phenotype", o: "pheno:regression", confidence: "high", evidence: [{ src: P1, quote: "Developmental regression occurred in all Rett syndrome participants (median = 18 months)" }] },

  // ---- outcome measures
  {
    key: "css-cdd",
    s: "asset:rtt-css",
    p: "applied_to",
    o: "disease:cdd",
    confidence: "high",
    evidence: [
      { src: PMC1, quote: "These two scales were performed on all of the participants in the natural history study, allowing a direct comparison between groups." },
      { src: PMC1, quote: "FOXG1 (28; IQR 22–31), and finally CDD (29; IQR 25–33)" },
      { src: PMC1, quote: "It is also possible that the increased frequency of seizures in CDD may partially contribute to its increased severity on this scale.", stance: "qualifies" },
      { src: PMC1, quote: "disease-specific severity scales are needed to be developed (and one has been developed for CDD)", stance: "qualifies" },
      { src: GRANT, quote: "Providing critical guidance to effective and discriminant outcome measures is a crucial feature of any clinical trial and requires special consideration for these disorders.", stance: "qualifies" },
    ],
  },
  {
    key: "css-rett",
    s: "asset:rtt-css",
    p: "applied_to",
    o: "disease:rett",
    confidence: "high",
    evidence: [
      { src: PMC1, quote: "Disease severity at the baseline visit was quantified using the RTT Clinical Severity Scale" },
      { src: PMC1, quote: "All the investigators at each site were trained on the CSS at site initiation" },
    ],
  },
  {
    key: "cds-cdd",
    s: "asset:cds",
    p: "applied_to",
    o: "disease:cdd",
    confidence: "moderate",
    evidence: [
      { src: P3, quote: "We analyzed demographic, phenotypic, CDKL5 Developmental Score (CDS), and treatment data" },
      { src: P3, quote: "16% never achieved any CDS skill, but most attained at least three, and 28% attained six or all seven." },
    ],
  },
  {
    key: "sa-cdd",
    s: "asset:cdd-severity",
    p: "applied_to",
    o: "disease:cdd",
    confidence: "high",
    evidence: [
      { src: P4, quote: "A specific severity assessment is lacking, required to monitor the clinical course and needed to define the natural history and for clinical trial readiness." },
      { src: P4, quote: "The final severity assessment comprised 51 items that comprehensively describe domains of epilepsy; motor; cognition, behavior, vision, and speech; and autonomic functions." },
      { src: P4, quote: "Refinement through ongoing validation is required for future clinical trials.", stance: "qualifies" },
    ],
  },
  {
    key: "nhs-informed-sa",
    s: "study:nhs",
    p: "informed_development_of",
    o: "asset:cdd-severity",
    confidence: "high",
    evidence: [
      { src: P4, quote: "A severity assessment was developed based on clinical and research experience from the International Foundation for CDKL5 Research Centers of Excellence consortium and the National Institutes of Health Rett and Rett-Related Disorders Natural History Study consortium." },
      { src: PMC1, quote: "disease-specific severity scales are needed to be developed (and one has been developed for CDD)" },
    ],
  },
  {
    key: "ifcr-informed-sa",
    s: "org:ifcr",
    p: "informed_development_of",
    o: "asset:cdd-severity",
    confidence: "high",
    evidence: [
      { src: P4, quote: "A severity assessment was developed based on clinical and research experience from the International Foundation for CDKL5 Research Centers of Excellence consortium" },
      { src: P4, quote: "The revised version of the severity assessment was presented for review, comment, and piloting to families at the International Foundation for CDKL5 Research-sponsored family meeting (Colorado, 2018)." },
    ],
  },
  { key: "sa-paper", s: "asset:cdd-severity", p: "described_in", o: "paper:31147226", confidence: "high", evidence: [{ src: P4, quote: "A severity assessment was rapidly developed with input from multiple stakeholders." }] },
  { key: "css-paper", s: "asset:rtt-css", p: "described_in", o: "paper:32472944", confidence: "high", evidence: [{ src: PMC1, quote: "The clinical severity scale (CSS) used was previously published by Schanen et al." }] },
  { key: "cds-paper", s: "asset:cds", p: "described_in", o: "paper:39867409", confidence: "moderate", evidence: [{ src: P3, quote: "CDKL5 Developmental Score (CDS)" }] },
  { key: "cdd-review", s: "disease:cdd", p: "described_in", o: "paper:35483386", confidence: "high", evidence: [{ src: P2, quote: "CDKL5 deficiency disorder (CDD) was first identified as a cause of human disease in 2004." }] },

  // ---- organizations (official homepages)
  { key: "org-ifcr", s: "org:ifcr", p: "supports_community", o: "disease:cdd", confidence: "high", evidence: [{ src: "org:ifcr", quote: "Page title: Home | International Foundation for CDKL5 Research" }] },
  { key: "org-loulou", s: "org:loulou", p: "supports_community", o: "disease:cdd", confidence: "high", evidence: [{ src: "org:loulou", quote: "dedicated to advancing research into the understanding and development of therapeutics for CDKL5 deficiency disorder" }] },
  { key: "org-irsf", s: "org:irsf", p: "supports_community", o: "disease:rett", confidence: "high", evidence: [{ src: "org:irsf", quote: "IRSF is the leading research, family support, and advocacy organization for Rett syndrome" }] },
  { key: "org-foxg1rf", s: "org:foxg1rf", p: "supports_community", o: "disease:foxg1", confidence: "high", evidence: [{ src: "org:foxg1rf", quote: "Affected by the Rare Children's Disease, FOXG1 Syndrome" }] },

  // ---- investigators (public registry listing only; no contact data)
  { key: "pi-percy", s: "researcher:percy", p: "investigates", o: "study:nhs", confidence: "high", evidence: [{ src: NHS, quote: "Overall official: Alan K Percy, MD, University of Alabama at Birmingham (PRINCIPAL_INVESTIGATOR)" }] },
  { key: "sd-neul", s: "researcher:neul", p: "investigates", o: "study:nhs", confidence: "high", evidence: [{ src: NHS, quote: "Overall official: Jeffrey L Neul, MD, PhD, Vanderbilt University (STUDY_DIRECTOR)" }] },

  // ---- collaborator layer: public PubMed author metadata. Registry investigators are linked to a paper ONLY
  // where name AND institution match (31147226). In PMID 32472944 the PubMed affiliations differ, so no link is made there.
  {
    key: "percy-authored-sa",
    s: "researcher:percy",
    p: "authored",
    o: "paper:31147226",
    confidence: "moderate",
    evidence: [
      { src: P4, quote: "Author: Percy AK — University of Alabama at Birmingham, Pediatrics, Neurology, Neurobiology, Genetics, and Psychology, Birmingham, Alabama" },
      { src: NHS, quote: "Overall official: Alan K Percy, MD, University of Alabama at Birmingham (PRINCIPAL_INVESTIGATOR)" },
    ],
  },
  {
    key: "neul-authored-sa",
    s: "researcher:neul",
    p: "authored",
    o: "paper:31147226",
    confidence: "moderate",
    evidence: [
      { src: P4, quote: "Author: Neul JL — Vanderbilt Kennedy Center, Vanderbilt University Medical Center, Tennessee" },
      { src: NHS, quote: "Overall official: Jeffrey L Neul, MD, PhD, Vanderbilt University (STUDY_DIRECTOR)" },
    ],
  },
  {
    key: "demarest-authored-sa",
    s: "researcher:demarest",
    p: "authored",
    o: "paper:31147226",
    confidence: "high",
    evidence: [{ src: P4, quote: "Author: Demarest S — Children's Hospital Colorado and University of Colorado School of Medicine Aurora, Colorado" }],
  },
  {
    key: "demarest-authored-review",
    s: "researcher:demarest",
    p: "authored",
    o: "paper:35483386",
    confidence: "moderate",
    evidence: [{ src: P2, quote: "Author: Demarest S — Department of Neurology, Children's Hospital Colorado, Aurora, CO, USA" }],
  },
];

export interface ConnectionSpec {
  id: string;
  disease_id: string;
  connection_type: "shared_research_infrastructure" | "historical_classification" | "clinical_difference" | "phenotypic_overlap";
  why_connected: string;
  edges: string[]; // edge keys
  confidence: Confidence;
  key_difference: string;
}

export const CONNECTIONS: ConnectionSpec[] = [
  {
    id: "conn:rett-infrastructure",
    disease_id: "disease:rett",
    connection_type: "shared_research_infrastructure",
    why_connected:
      "People with CDD and people with Rett syndrome were enrolled in the same NIH-funded natural-history study (NCT02738281). A 2020 analysis of 793 participants compared the disorders head to head.",
    edges: ["costudy-rett", "cdd-in-nhs", "nhs-paper"],
    confidence: "high",
    key_difference: "Being studied together is not evidence of shared biology. The same study concluded these are distinct disorders.",
  },
  {
    id: "conn:rett-history",
    disease_id: "disease:rett",
    connection_type: "historical_classification",
    why_connected: "CDD was initially considered a variant of Rett syndrome, so the two communities share research history.",
    edges: ["history", "variant-claim"],
    confidence: "high",
    key_difference: "That classification is superseded. CDD is now recognised as an independent developmental and epileptic encephalopathy, and 'variant RTT' naming should not be used.",
  },
  {
    id: "conn:rett-differences",
    disease_id: "disease:rett",
    connection_type: "clinical_difference",
    why_connected: "The 2020 comparison describes 'shared and distinct features'. Its abstract reports the differences in detail but does not list which features are shared.",
    edges: ["differs-rett", "overlap-rett"],
    confidence: "high",
    key_difference:
      "CDD: youngest median seizure onset (2 months), most severely affected, seizures before baseline in 96.2%. Rett: regression in all participants (median 18 months), seizures before baseline in 47.5%.",
  },
  {
    id: "conn:foxg1-infrastructure",
    disease_id: "disease:foxg1",
    connection_type: "shared_research_infrastructure",
    why_connected: "FOXG1 disorder was enrolled in the same natural-history study and compared alongside CDD.",
    edges: ["costudy-foxg1", "foxg1-in-nhs", "differs-foxg1"],
    confidence: "moderate",
    key_difference: "FOXG1 disorder was intermediate in severity and seizure-onset age; CDD had the earliest onset and highest severity.",
  },
  {
    id: "conn:mdd-infrastructure",
    disease_id: "disease:mdd",
    connection_type: "shared_research_infrastructure",
    why_connected: "MECP2 duplication syndrome was enrolled in the same natural-history study and compared alongside CDD.",
    edges: ["costudy-mdd", "mdd-in-nhs", "differs-mdd"],
    confidence: "moderate",
    key_difference: "MECP2 duplication syndrome had the oldest median seizure onset (64 months) and lowest severity scores, the opposite end from CDD.",
  },
];

export interface OpportunitySpec {
  id: string;
  asset_id: string;
  source_disease_id: string;
  headline: string;
  reuse_classification: ReuseClassification;
  why_it_may_transfer: string[];
  what_differs: string[];
  what_is_uncertain: string[];
  requires_expert_validation: string[];
  edges: string[];
  confidence: Confidence;
  story?: { label: string; text: string; edges: string[] }[];
  next_actions: { id: string; kind: "contact_organization" | "contact_researcher" | "review_protocol" | "compare_outcome_measures" | "compare_eligibility" | "request_data_access" | "ask_expert_question"; label: string; target_node_id?: string; edges: string[] }[];
}

export const OPPORTUNITIES: OpportunitySpec[] = [
  {
    id: "opp:nhs-precedent",
    asset_id: "asset:nhs-infrastructure",
    source_disease_id: "disease:rett",
    headline: "Rett and Rett-Related Disorders Natural History Study (NCT02738281)",
    reuse_classification: "shared_infrastructure_precedent",
    why_it_may_transfer: [
      "CDD was explicitly included: the registry lists 'CDKL5 Disorder' as a condition and its eligibility criteria name CDKL5.",
      "The study ran across multiple clinical sites and supported a head-to-head comparison of 793 participants.",
      "The study's authors suggest the Natural History Study database could be used to compare the Rett severity scale with a CDD-specific scale.",
    ],
    what_differs: [
      "The registry's primary outcome measures are defined for Rett syndrome and MECP2 duplication syndrome. The only outcome listed for 'RTT-related disorders', which the eligibility criteria say include CDKL5, is quality of life.",
      "CDD seizures start earliest (median 2 months) and are the most common at baseline, so visit timing and seizure measures designed around Rett may not fit.",
      "Registry status is completed (July 2021).",
    ],
    what_is_uncertain: [
      "Data-sharing and access terms for the study database are not stated in any retrieved source.",
      "How many CDD participants were followed over time. The registry reports 1,044 enrolled, while the 2020 paper analysed 793, so the two reflect different data cuts.",
      "The paper describes 15 clinical sites, while the registry lists 14 locations.",
    ],
    requires_expert_validation: [
      "Which recruitment, longitudinal-data or outcome-measure components are transferable to a CDD-focused effort?",
      "Is the CDD data already collected here enough for your organisation's question, or is a CDD-specific cohort needed?",
    ],
    edges: ["cdd-in-nhs", "nhs-paper", "nhs-infra", "costudy-rett", "differs-rett", "nhs-informed-sa"],
    confidence: "moderate",
    story: [
      {
        label: "What happened",
        text: "CDD participants were enrolled in the same NIH-funded natural-history study as Rett syndrome, FOXG1 disorder and MECP2 duplication syndrome.",
        edges: ["cdd-in-nhs", "costudy-rett", "nhs-paper"],
      },
      {
        label: "Why it matters",
        text: "Cross-disorder infrastructure sharing has already happened. Experience from this study's consortium also helped build a CDD-specific severity assessment.",
        edges: ["nhs-informed-sa", "nhs-infra"],
      },
      {
        label: "Potentially adaptable asset",
        text: "Outcome-measure experience: the RTT Clinical Severity Scale was given to every participant, including people with CDD (median score 29).",
        edges: ["css-cdd"],
      },
      {
        label: "Important limitation",
        text: "The Rett scale is not established as valid for CDD; its authors note CDD's more frequent seizures may raise scores. The CDD-specific assessment also still needs validation.",
        edges: ["css-cdd", "sa-cdd"],
      },
      {
        label: "Next research question",
        text: "How do the RTT Clinical Severity Scale and the CDD-specific severity assessment compare in people with CDD, and could the Natural History Study database support that comparison?",
        edges: ["css-cdd", "sa-cdd", "nhs-infra"],
      },
    ],
    next_actions: [
      {
        id: "act:review-methods",
        kind: "review_protocol",
        label:
          "Review the NCT02738281 registry record and the 2020 comparison paper's methods with a CDD clinical researcher to identify which recruitment, longitudinal-data or outcome-measure components are transferable.",
        target_node_id: "study:nhs",
        edges: ["cdd-in-nhs", "nhs-paper"],
      },
      {
        id: "act:ask-study-team",
        kind: "request_data_access",
        label:
          "Ask the study team, through the institutions listed on the registry (University of Alabama at Birmingham, Vanderbilt University), whether CDD data from the Natural History Study database can be shared and on what terms.",
        target_node_id: "study:nhs",
        edges: ["pi-percy", "sd-neul", "nhs-infra"],
      },
      {
        id: "act:ask-cdd-orgs",
        kind: "contact_organization",
        label: "Ask CDD organisations (International Foundation for CDKL5 Research, Loulou Foundation) whether they already work with this study network.",
        target_node_id: "org:ifcr",
        edges: ["org-ifcr", "org-loulou", "cdd-in-nhs"],
      },
    ],
  },
  {
    id: "opp:css-experience",
    asset_id: "asset:rtt-css",
    source_disease_id: "disease:rett",
    headline: "Outcome-measure experience: the RTT Clinical Severity Scale used in CDD participants",
    reuse_classification: "potentially_adaptable",
    why_it_may_transfer: [
      "The RTT Clinical Severity Scale and the RTT Clinical Global Impression–Severity were given to every study participant, including CDD (median CSS score 29), so the disorders could be compared directly.",
      "Investigators at each site were trained on the scale.",
    ],
    what_differs: [
      "The scale was built for Rett syndrome. The authors note that CDD's more frequent seizures may partly drive its higher scores.",
      "A CDD-specific severity assessment exists (51 items covering epilepsy, motor, cognition/behaviour/vision/speech and autonomic function), and the 2025 adult-cohort preprint used the CDKL5 Developmental Score (CDS).",
    ],
    what_is_uncertain: [
      "Whether the Rett scale is valid or sensitive to change in CDD. No retrieved source establishes this.",
      "The NIH-funded research centre's abstract says outcome measures 'require special consideration for these disorders'.",
      "The CDD-specific severity assessment still needs validation, according to its own authors.",
    ],
    requires_expert_validation: ["Should a CDD study use the Rett scale, the CDD-specific severity assessment, or both for comparability across disorders?"],
    edges: ["css-cdd", "sa-cdd", "cds-cdd", "differs-rett"],
    confidence: "moderate",
    next_actions: [
      {
        id: "act:compare-scales",
        kind: "compare_outcome_measures",
        label:
          "With a CDD clinical researcher, compare the RTT Clinical Severity Scale against the CDD-specific severity assessment. The 2020 authors note this comparison could be run on the Natural History Study database.",
        target_node_id: "asset:rtt-css",
        edges: ["css-cdd", "sa-cdd", "nhs-infra"],
      },
    ],
  },
  {
    id: "opp:biobank-lead",
    asset_id: "asset:biobank",
    source_disease_id: "disease:rett",
    headline: "Biobanking of Rett Syndrome and Related Disorders (NCT02705677)",
    reuse_classification: "discovery_lead",
    why_it_may_transfer: [
      "The biobank protocol lists CDKL5 among its conditions and planned to collect DNA, RNA, plasma and cell lines.",
      "Its stated motivation was the lack of biomarkers of disease status, severity or treatment response.",
    ],
    what_differs: ["Samples were collected under a Rett-centred protocol. The retrieved record does not state how many CDD participants contributed."],
    what_is_uncertain: ["Whether samples remain available, and on what terms.", "How many CDD samples exist."],
    requires_expert_validation: ["Would existing CDD samples help answer a biomarker question your organisation cares about?"],
    edges: ["cdd-in-biobank", "biobank-asset"],
    confidence: "low",
    next_actions: [
      {
        id: "act:biobank-advisors",
        kind: "ask_expert_question",
        label: "Ask your scientific advisors whether CDD samples from this completed biobank could support a biomarker question before approaching the study team.",
        target_node_id: "study:biobank",
        edges: ["cdd-in-biobank", "biobank-asset"],
      },
    ],
  },
];

export const GAPS: (Omit<KnowledgeGap, "related_edge_ids"> & { edges: string[] })[] = [
  {
    id: "gap:mechanism",
    kind: "missing_evidence",
    statement: "None of the retrieved sources describe how loss of CDKL5 affects cells, so no mechanism or pathway is shown.",
    suggested_question_or_experiment: "Retrieve a mechanism-focused review and run it through the Evidence Extractor before adding any pathway links.",
    edges: [],
  },
  {
    id: "gap:classification",
    kind: "contradictory_evidence",
    statement: "Older naming treated CDKL5-related cases as 'Atypical Rett Syndrome'. Current literature treats CDD as a distinct disorder.",
    suggested_question_or_experiment: "Use current nomenclature (CDD) and treat the Rett link as research history, not equivalence.",
    edges: ["variant-claim"],
  },
  {
    id: "gap:access",
    kind: "missing_evidence",
    statement: "Data-access terms for the Natural History Study database and the biobank are not stated in any retrieved source.",
    suggested_question_or_experiment: "Ask the study team or RDCRN directly.",
    edges: ["nhs-infra", "biobank-asset"],
  },
  {
    id: "gap:css-validity",
    kind: "open_question",
    statement: "Whether the RTT Clinical Severity Scale is valid or responsive in CDD has not been established, and the CDD-specific severity assessment itself still requires validation.",
    suggested_question_or_experiment: "Compare the two instruments in CDD participants, as the 2020 authors suggest.",
    edges: ["css-cdd", "sa-cdd"],
  },
  {
    id: "gap:no-transfer",
    kind: "assumption",
    statement:
      "Shared research infrastructure is not shared biology, and neither implies that a Rett treatment would work in CDD. Nothing on this page makes a treatment claim.",
    edges: ["costudy-rett", "differs-rett"],
  },
  {
    id: "gap:preprint",
    kind: "missing_evidence",
    statement: "The adult natural-history study (PMID 39867409) is a medRxiv preprint. No peer-reviewed version was found in PubMed on 2026-10-03.",
    suggested_question_or_experiment: "Re-check for a peer-reviewed version before relying on its figures.",
    edges: ["cds-cdd", "cdd-spasm"],
  },
  {
    id: "gap:counts",
    kind: "missing_evidence",
    statement: "Counts differ between sources: 1,044 enrolled in the registry vs. 793 analysed in the paper, and 14 listed locations vs. 15 sites described.",
    suggested_question_or_experiment: "Treat these as different data cuts or dates; confirm with the study team if exact numbers matter.",
    edges: ["nhs-paper", "cdd-in-nhs"],
  },
];


// ---------------------------------------------------------------------------
// Collaborator layer: relevance to this research path only. Never implies availability or willingness.
export interface CollaboratorSpec {
  node_id: string;
  role: string;
  why_relevant: string;
  identity_note?: string;
  collaboration_question: string;
  edges: string[];
}

export const COLLABORATORS: CollaboratorSpec[] = [
  {
    node_id: "researcher:percy",
    role: "Principal investigator, Natural History Study NCT02738281 (registry listing); co-author of the CDD severity assessment (PMID 31147226)",
    why_relevant: "Appears on both sides of the precedent: the shared natural-history infrastructure and the CDD-specific severity work it informed.",
    identity_note: "Linked across sources by name and the same institution (University of Alabama at Birmingham).",
    collaboration_question: "Which parts of the Natural History Study's protocols and data informed the CDD severity assessment, and what remains available to researchers?",
    edges: ["pi-percy", "percy-authored-sa", "nhs-informed-sa"],
  },
  {
    node_id: "researcher:neul",
    role: "Study director, Natural History Study NCT02738281 (registry listing); co-author of the CDD severity assessment (PMID 31147226)",
    why_relevant: "Connects the multi-site Rett/Rett-related study team with the CDD severity assessment.",
    identity_note: "Linked across sources by name and the same institution (Vanderbilt University).",
    collaboration_question: "How were the RTT Clinical Severity Scale and the CDD severity assessment used, and could they be compared on existing study data?",
    edges: ["sd-neul", "neul-authored-sa", "css-cdd"],
  },
  {
    node_id: "researcher:demarest",
    role: "First author, CDD severity assessment (PMID 31147226); co-author of the 2022 CDD review (PMID 35483386)",
    why_relevant: "Led the CDD-specific instrument whose own authors say it still needs validation.",
    identity_note: "Same name and institution (Children's Hospital Colorado) on both papers.",
    collaboration_question: "What validation work exists or is planned for the CDD severity assessment?",
    edges: ["demarest-authored-sa", "demarest-authored-review", "sa-cdd"],
  },
  {
    node_id: "org:ifcr",
    role: "Patient organization; its Centers of Excellence consortium informed the CDD severity assessment",
    why_relevant: "A CDD community organization already named in the evidence for this precedent.",
    collaboration_question: "Is the organization already connected to the Rett/Rett-related natural-history investigators, and what data-sharing routes exist?",
    edges: ["ifcr-informed-sa", "org-ifcr"],
  },
];

// ---------------------------------------------------------------------------
// Research Action Brief (featured CDD journey). Every line cites edge keys.
export const ACTION_BRIEF = {
  opportunity: {
    text: "CDD has already been studied inside shared Rett/Rett-related natural-history infrastructure, and that infrastructure informed a CDD-specific severity assessment. Its methods and outcome-measure experience are worth evaluating for current CDD research.",
    edges: ["cdd-in-nhs", "nhs-informed-sa", "css-cdd"],
  },
  why_surfaced: [
    { text: "The ClinicalTrials.gov record for NCT02738281 lists CDKL5 Disorder as a condition, and its eligibility criteria name CDKL5.", edges: ["cdd-in-nhs"] },
    { text: "A 2020 analysis compared 793 participants across Rett, CDD, FOXG1 and MECP2 duplication in that study.", edges: ["costudy-rett", "nhs-paper"] },
    { text: "A 2019 paper says the CDD severity assessment was developed from the experience of that study's consortium and the IFCR Centers of Excellence.", edges: ["nhs-informed-sa", "ifcr-informed-sa"] },
  ],
  existing_assets: [
    { asset_id: "asset:nhs-infrastructure", text: "Rett/Rett-related natural-history infrastructure: multi-site network and study database (RDCRN 5211; NIH U54HD061222)", edges: ["nhs-infra", "infra-cdd"] },
    { asset_id: "asset:rtt-css", text: "RTT Clinical Severity Scale experience in CDD participants (median score 29)", edges: ["css-cdd"] },
    { asset_id: "asset:cdd-severity", text: "CDD severity assessment: 51 items covering epilepsy, motor, cognition/behaviour/vision/speech and autonomic function", edges: ["sa-cdd", "sa-paper"] },
  ],
  who_is_relevant: ["researcher:percy", "researcher:neul", "researcher:demarest", "org:ifcr"],
  bring_sources: [
    { label: "NCT02738281: Natural History of Rett Syndrome & Related Disorders (registry record)", url: "https://clinicaltrials.gov/study/NCT02738281", edges: ["cdd-in-nhs"] },
    { label: "PMID 32472944: Comparison of core features in four developmental encephalopathies in the Rett Natural History Study (2020)", url: "https://pubmed.ncbi.nlm.nih.gov/32472944/", edges: ["costudy-rett", "differs-rett"] },
    { label: "PMID 31147226: Severity Assessment in CDKL5 Deficiency Disorder (2019)", url: "https://pubmed.ncbi.nlm.nih.gov/31147226/", edges: ["nhs-informed-sa", "sa-cdd"] },
    { label: "PMID 35483386: CDKL5 deficiency disorder: clinical features, diagnosis, and management (2022)", url: "https://pubmed.ncbi.nlm.nih.gov/35483386/", edges: ["history", "variant-claim"] },
  ],
  question: {
    text: "Which recruitment, longitudinal-data and outcome-measure components from the shared Rett/Rett-related natural-history infrastructure remain useful for current CDD research, and which require CDD-specific validation?",
    edges: ["nhs-infra", "css-cdd", "sa-cdd"],
  },
  must_validate: [
    { text: "Whether the RTT Clinical Severity Scale is valid for CDD. Its authors note CDD's more frequent seizures may raise scores.", edges: ["css-cdd"] },
    { text: "The CDD severity assessment itself: its authors say refinement through ongoing validation is required.", edges: ["sa-cdd"] },
    { text: "Current access to the study database and biobank. Access terms are not stated in any retrieved source.", edges: ["nhs-infra", "biobank-asset"] },
    { text: "Population differences: CDD has the earliest seizure onset (median 2 months) and less frequent regression than Rett.", edges: ["differs-rett"] },
  ],
  does_not_mean: [
    { text: "CDD and Rett syndrome are not equivalent. CDD is recognised as an independent disorder.", edges: ["variant-claim", "differs-rett"] },
    { text: "Shared research infrastructure does not imply that any treatment transfers.", edges: ["costudy-rett"] },
    { text: "Shared research history does not prove a shared biological mechanism. No retrieved source describes one.", edges: ["history"] },
  ],
};
