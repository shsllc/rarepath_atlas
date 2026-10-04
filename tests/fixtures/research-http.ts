/**
 * Fake HTTP router for the discovery providers. Response bodies follow the real shapes of
 * Open Targets v26.9, GWAS Catalog v2, ClinicalTrials.gov v2, Europe PMC, OpenAlex, Crossref and DataCite,
 * trimmed to the fields RarePath reads. Used only by tests; production never sees these values.
 */
import { vi } from "vitest";

export type Failures = Partial<Record<"opentargets" | "gwas" | "clinicaltrials" | "europepmc" | "openalex" | "crossref" | "datacite" | "monarch" | "orphadata" | "hpo" | "clingen" | "clinvar" | "alliance" | "isrctn" | "euctr", "down" | "http500" | "timeout">>;
// Note: trial-publication links use the Europe PMC host, so a europepmc failure also fails them.

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

const OT_SEARCH = { data: { search: { total: 2, hits: [{ id: "MONDO_0100135", name: "Dravet syndrome", description: "x" }, { id: "MONDO_0018214", name: "generalized epilepsy with febrile seizures plus", description: null }] } } };
const OT_DISEASE = {
  data: {
    meta: { apiVersion: { x: "26", y: "9", z: "0" }, dataVersion: { year: "26", month: "09" } },
    disease: {
      id: "MONDO_0100135",
      name: "Dravet syndrome",
      description: "A channelopathy with epilepsy.",
      dbXRefs: ["GARD:0010430", "UMLS:C0751122"], // as in the live record: no Orphanet or OMIM xref on MONDO:0100135
      synonyms: [{ relation: "hasExactSynonym", terms: ["Dravet", "severe myoclonic epilepsy of infancy"] }],
      therapeuticAreas: [{ id: "MONDO_0005071", name: "nervous system disorder" }],
      parents: [{ id: "MONDO_0100062", name: "genetic developmental and epileptic encephalopathy" }],
      children: [],
      associatedTargets: {
        count: 1182,
        rows: [
          { score: 0.88, target: { id: "ENSG00000144285", approvedSymbol: "SCN1A", approvedName: "sodium voltage-gated channel alpha subunit 1" }, datatypeScores: [{ id: "genetic_association", score: 0.96 }, { id: "literature", score: 0.97 }] },
          { score: 0.58, target: { id: "ENSG00000147955", approvedSymbol: "SIGMAR1", approvedName: "sigma non-opioid intracellular receptor 1" }, datatypeScores: [{ id: "clinical", score: 0.93 }] },
        ],
      },
      phenotypes: { count: 1, rows: [{ phenotypeHPO: { id: "HP_0001250", name: "Seizure" } }] },
      drugAndClinicalCandidates: { count: 2, rows: [{ maxClinicalStage: "PHASE_3", drug: { id: "CHEMBL5095386", name: "ZOREVUNERSEN", drugType: "Oligonucleotide" } }, { maxClinicalStage: "APPROVAL", drug: { id: "CHEMBL1983350", name: "STIRIPENTOL", drugType: "Small molecule" } }] },
    },
  },
};
const OT_VARIANTS = { data: { disease: { evidences: { count: 1340, rows: [{ datasourceId: "eva", target: { id: "ENSG00000144285", approvedSymbol: "SCN1A" }, variant: { id: "2_165992359_C_G", rsIds: ["rs796053029"] }, variantRsId: "rs796053029", clinicalSignificances: ["pathogenic"], studyId: "RCV004577517", confidence: "reviewed by expert panel" }] } } } };
const OT_OTHER = { data: { target: { associatedDiseases: { count: 3, rows: [{ score: 0.9, disease: { id: "MONDO_0100135", name: "Dravet syndrome" } }, { score: 0.7, disease: { id: "MONDO_0018214", name: "generalized epilepsy with febrile seizures plus" } }] } } } };

const GWAS = { _embedded: { associations: [{ association_id: 111, p_value: 0, pvalue_mantissa: 2, pvalue_exponent: -9, accession_id: "GCST000001", pubmed_id: "123", first_author: "A", mapped_genes: ["SCN1A"], reported_trait: ["epilepsy"], snp_allele: [{ rs_id: "rs6732655" }] }] }, page: { totalElements: 1 } };

type StudyOpts = { type?: string; title?: string; conditions?: string[]; extra?: Record<string, unknown>; design?: Record<string, unknown>; status?: Record<string, unknown>; refs?: unknown[]; outcomes?: unknown[] };
export const study = (nct: string, status: string, o: StudyOpts = {}) => ({
  hasResults: status === "COMPLETED",
  ...(status === "COMPLETED" ? { documentSection: { largeDocumentModule: { largeDocs: [{ typeAbbrev: "Prot_SAP", hasProtocol: true, hasSap: true, label: "Study Protocol and Statistical Analysis Plan", filename: "Prot_SAP_000.pdf" }] } } } : {}),
  protocolSection: {
    identificationModule: { nctId: nct, briefTitle: o.title ?? `Study ${nct}`, officialTitle: `Official title of ${nct}`, secondaryIdInfos: nct === "NCT00000001" ? [{ id: "2019-000123-45", type: "EUDRACT_NUMBER" }] : [] },
    statusModule: { overallStatus: status, startDateStruct: { date: "2020-01" }, primaryCompletionDateStruct: { date: "2023-01" }, completionDateStruct: { date: "2023-06" }, lastUpdatePostDateStruct: { date: "2024-02-01" }, ...(o.status ?? {}) },
    sponsorCollaboratorsModule: { leadSponsor: { name: "Example Sponsor", class: "INDUSTRY" }, collaborators: [{ name: "Example Collaborator" }], responsibleParty: { type: "SPONSOR" } },
    conditionsModule: { conditions: o.conditions ?? ["Dravet Syndrome"] },
    designModule: {
      studyType: o.type ?? "INTERVENTIONAL",
      phases: (o.type ?? "INTERVENTIONAL") === "INTERVENTIONAL" ? ["PHASE3"] : [],
      designInfo: (o.type ?? "INTERVENTIONAL") === "INTERVENTIONAL" ? { allocation: "RANDOMIZED", interventionModel: "PARALLEL", primaryPurpose: "TREATMENT", maskingInfo: { masking: "QUADRUPLE" } } : { observationalModel: "COHORT", timePerspective: "PROSPECTIVE" },
      enrollmentInfo: { count: 40, type: "ACTUAL" },
      ...(o.design ?? {}),
    },
    armsInterventionsModule: { interventions: [{ type: "DRUG", name: "Investigational product" }] },
    outcomesModule: { primaryOutcomes: o.outcomes ?? [{ measure: "Change in convulsive seizure frequency", timeFrame: "14 weeks" }] },
    eligibilityModule: { sex: "ALL", minimumAge: "2 Years", maximumAge: "18 Years", stdAges: ["CHILD", "ADULT"] },
    contactsLocationsModule: { overallOfficials: [{ name: "Jane Smith", affiliation: "Hospital A", role: "PRINCIPAL_INVESTIGATOR" }], locations: [{ facility: "Hospital A", city: "Boston", state: "Massachusetts", country: "United States" }, { city: "Paris", country: "France" }] },
    referencesModule: { references: o.refs ?? [] },
  },
});
const CTGOV = {
  totalCount: 103,
  studies: [
    // Shares its endpoint wording with NCT00000006, which studies a different condition set.
    study("NCT00000001", "COMPLETED", { refs: [{ pmid: "555", type: "RESULT", citation: "Doe J. Results of the trial. N Engl J Med. 2023." }, { pmid: "556", type: "BACKGROUND", citation: "Roe R. Background review. Lancet. 2010." }, { citation: "A reference without any PMID." }] }),
    study("NCT00000002", "TERMINATED", { status: { whyStopped: "Sponsor decision" } }),
    study("NCT00000003", "WITHDRAWN", { status: { whyStopped: "No participants enrolled" } }),
    study("NCT00000004", "RECRUITING"),
    study("NCT00000005", "ACTIVE_NOT_RECRUITING", { type: "OBSERVATIONAL", title: "Natural History Study of Dravet Syndrome", outcomes: [{ measure: "Vineland Adaptive Behavior Scales", timeFrame: "5 years" }] }),
    study("NCT00000006", "COMPLETED", { conditions: ["Lennox-Gastaut Syndrome", "Dravet Syndrome"] }),
  ],
};
const CTGOV_INFRA = {
  totalCount: 7,
  studies: [
    // Duplicate of a main-search study: must not appear twice.
    study("NCT00000005", "ACTIVE_NOT_RECRUITING", { type: "OBSERVATIONAL", title: "Natural History Study of Dravet Syndrome", outcomes: [{ measure: "Vineland Adaptive Behavior Scales", timeFrame: "5 years" }] }),
    study("NCT00000007", "TERMINATED", { type: "OBSERVATIONAL", title: "Dravet Syndrome Patient Registry", design: { patientRegistry: true }, status: { whyStopped: "Funding ended" } }),
  ],
};
const EPMC_ACCESSION = { hitCount: 2, resultList: { result: [{ id: "555", source: "MED", pmid: "555", title: "Results of the trial", pubYear: "2023", pubType: "research-article; journal article", journalTitle: "N Engl J Med" }] } };

const author = (fullName: string, orcid?: string, affiliation?: string) => ({ fullName, ...(orcid ? { authorId: { type: "ORCID", value: orcid } } : {}), ...(affiliation ? { authorAffiliationDetailsList: { authorAffiliation: [{ affiliation }] } } : {}) });
const EPMC_REL = {
  hitCount: 6490,
  resultList: {
    result: [
      // Same paper as OpenAlex W1 and the Crossref record (DOI match).
      { id: "111", source: "MED", pmid: "111", doi: "10.1000/DUP", title: "Duplicate paper across providers.", pubYear: "2020", journalInfo: { journal: { title: "Epilepsia" } }, pubTypeList: { pubType: ["Journal Article"] }, isOpenAccess: "Y", inEPMC: "Y", pmcid: "PMC111", citedByCount: 50, authorList: { author: [author("Smith J", "0000-0001-2345-6789", "Hospital A")] }, grantsList: { grant: [{ agency: "NINDS NIH HHS", grantId: "R01NS000001" }] } },
      // PMID only; OpenAlex W2 carries the same PMID plus a DOI → must merge.
      { id: "222", source: "MED", pmid: "222", title: "PMID-only record", pubYear: "2019", pubTypeList: { pubType: ["Journal Article"] }, authorList: { author: [author("Doe A")] } },
      // A preprint. Crossref calls it a journal-article; the merged record must stay a preprint.
      { id: "PPR1", source: "PPR", doi: "10.1101/2024.01.01.000001", title: "A preprint about Dravet syndrome", pubYear: "2024", pubTypeList: { pubType: ["Preprint"] }, authorList: { author: [] } },
      // Already in the reviewed CDD bundle (PMID 32472944).
      { id: "32472944", source: "MED", pmid: "32472944", title: "Comparison of Core Features in Four Developmental Encephalopathies", pubYear: "2020", pubTypeList: { pubType: ["Journal Article"] } },
    ],
  },
};
const EPMC_CITED = { hitCount: 6490, resultList: { result: [] } };
const EPMC_RECENT = { hitCount: 6490, resultList: { result: [{ id: "333", source: "MED", pmid: "333", title: "Recent paper", pubYear: "2026", pubTypeList: { pubType: ["Journal Article"] } }] } };

const OA_WORKS = {
  results: [
    { id: "https://openalex.org/W1", doi: "https://doi.org/10.1000/dup", title: "Duplicate paper across providers", publication_year: 2020, ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/111" }, cited_by_count: 60, referenced_works: ["https://openalex.org/W9"], type: "article", primary_location: { source: { display_name: "Epilepsia" } }, funders: [{ id: "https://openalex.org/F1", display_name: "National Institutes of Health", ror: "https://ror.org/01cwqze88" }], authorships: [{ author: { id: "https://openalex.org/A1", display_name: "Jane Smith", orcid: "https://orcid.org/0000-0001-2345-6789" }, institutions: [{ id: "https://openalex.org/I1", display_name: "Hospital A", ror: "https://ror.org/000000001", country_code: "US" }] }, { author: { id: "https://openalex.org/A2", display_name: "Jane Smith" }, institutions: [{ id: "https://openalex.org/I2", display_name: "Hospital B", ror: "https://ror.org/000000002", country_code: "FR" }] }] },
    { id: "https://openalex.org/W2", doi: "https://doi.org/10.1000/b", title: "PMID-only record", publication_year: 2019, ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/222" }, cited_by_count: 5, referenced_works: [], type: "article", authorships: [] },
  ],
};
const OA_CITING = { meta: { count: 42 }, results: [{ id: "https://openalex.org/W5", doi: "https://doi.org/10.1000/citing", title: "A citing paper", publication_year: 2022, ids: {}, cited_by_count: 3, referenced_works: [], type: "article", authorships: [] }] };
const OA_REFS = { results: [{ id: "https://openalex.org/W9", doi: "https://doi.org/10.1000/ref", title: "A referenced paper", publication_year: 2010, ids: {}, cited_by_count: 900, referenced_works: [], type: "article", authorships: [] }] };

const CROSSREF = (doi: string) => ({ message: { DOI: doi.toUpperCase(), title: [doi === "10.1000/dup" ? "Duplicate paper across providers" : "A preprint about Dravet syndrome"], "container-title": ["Epilepsia"], published: { "date-parts": [[2020, 5, 1]] }, type: "journal-article", author: [{ given: "Jane", family: "Smith", ORCID: "https://orcid.org/0000-0001-2345-6789" }], funder: [{ name: "National Institutes of Health", DOI: "10.13039/100000002" }], "updated-by": doi === "10.1000/dup" ? [{ type: "correction", DOI: "10.1000/dup.corr" }] : [] } });

const DATACITE = { meta: { total: 63 }, data: [{ id: "10.5061/dryad.x1", attributes: { doi: "10.5061/dryad.x1", titles: [{ title: "Dravet syndrome mouse EEG dataset" }], publisher: "Dryad", publicationYear: 2023, types: { resourceTypeGeneral: "Dataset" }, descriptions: [{ descriptionType: "Abstract", description: "EEG recordings." }], subjects: [{ subject: "Neuroscience" }], creators: [{ name: "Smith, Jane", nameIdentifiers: [{ nameIdentifierScheme: "ORCID", nameIdentifier: "https://orcid.org/0000-0001-2345-6789" }], affiliation: [{ name: "Hospital A", affiliationIdentifier: "https://ror.org/000000001", affiliationIdentifierScheme: "ROR" }] }], fundingReferences: [] } }] };


// ---- Rare-disease sources (shapes of Monarch v3, Orphadata, JAX HPO, ClinGen, NCBI E-utilities, Alliance) ----
const MONARCH_ENTITY = { id: "MONDO:0100135", name: "Dravet syndrome", description: "A channelopathy with epilepsy.", xref: ["GARD:0010430", "MEDGEN:148243"], exact_synonym: ["Dravet"], association_counts: [{ label: "Variant to Disease", count: 261 }] };
const MONARCH_CAUSAL = { total: 1, items: [{ id: "uuid:1", subject: "HGNC:10585", subject_label: "SCN1A", predicate: "biolink:causes", primary_knowledge_source: "infores:clingen" }] };
const MONARCH_MODELS = { total: 1, items: [{ id: "uuid:2", subject: "ZFIN:ZDB-FISH-161012-5", subject_label: "scn1lab<sup>s552/s552</sup>", subject_taxon_label: "Danio rerio", predicate: "biolink:model_of", primary_knowledge_source: "infores:zfin", publications: ["PMID:34664432"] }] };
const orpha = (results: unknown) => ({ data: { __licence: { identifier: "CC-BY-4.0" }, results } });
const ORPHA_XREF = orpha({
  ORPHAcode: 33069,
  "Preferred term": "Dravet syndrome",
  Synonym: ["SMEI", "Severe myoclonic epilepsy of infancy"],
  SummaryInformation: [{ Definition: "A rare, genetic developmental and epileptic encephalopathy." }],
  ExternalReference: [
    { Source: "GARD", Reference: "10430", DisorderMappingRelation: "E (Exact mapping: the two concepts are equivalent)", DisorderMappingValidationStatus: "Validated" },
    { Source: "OMIM", Reference: "607208", DisorderMappingRelation: "E (Exact mapping: the two concepts are equivalent)", DisorderMappingValidationStatus: "Validated" },
    { Source: "ICD-10", Reference: "G40.4", DisorderMappingRelation: "NTBT (ORPHAcode is narrower than the targeted code used to represent it)", DisorderMappingValidationStatus: "Validated" },
  ],
});
const ORPHA_PHENO = orpha({ Disorder: { HPODisorderAssociation: [
  { HPO: { HPOId: "HP:0002376", HPOTerm: "Developmental regression" }, HPOFrequency: "Very frequent (99-80%)", DiagnosticCriteria: null },
  { HPO: { HPOId: "HP:0001250", HPOTerm: "Seizure" }, HPOFrequency: "Obligate (100%)", DiagnosticCriteria: "Diagnostic criterion" },
  { HPO: { HPOId: "HP:0000256", HPOTerm: "Macrocephaly" }, HPOFrequency: "Excluded (0%)", DiagnosticCriteria: null },
] } });
const ORPHA_GENES = orpha({ DisorderGeneAssociation: [
  { DisorderGeneAssociationType: "Disease-causing germline mutation(s) in", DisorderGeneAssociationStatus: "Assessed", Gene: { Symbol: "SCN1A", Name: "sodium voltage-gated channel alpha subunit 1", ExternalReference: [{ Source: "Ensembl", Reference: "ENSG00000144285" }, { Source: "HGNC", Reference: "10585" }] } },
  { DisorderGeneAssociationType: "Modifying germline mutation in", DisorderGeneAssociationStatus: "Assessed", Gene: { Symbol: "SCN9A", Name: "sodium voltage-gated channel alpha subunit 9", ExternalReference: [{ Source: "Ensembl", Reference: "ENSG00000169432" }] } },
] });
const ORPHA_EPI = orpha({ Prevalence: [{ PrevalenceType: "Prevalence at birth", PrevalenceClass: "1-9 / 100 000", PrevalenceGeographic: "Europe", PrevalenceQualification: "Value and class", PrevalenceValidationStatus: "Validated" }] });
const ORPHA_NH = orpha({ AverageAgeOfOnset: ["Infancy", "Neonatal"], TypeOfInheritance: ["Autosomal dominant"] });
const JAX = (id: string) => ({ disease: { id }, categories: id.startsWith("OMIM") ? { "Nervous System": [{ id: "HP:0032794", name: "Myoclonic seizure", metadata: { sex: "", onset: "HP:0011463", frequency: "HP:0040282", sources: ["PMID:17347258"] } }, { id: "HP:0002376", name: "Developmental regression", metadata: { sex: "", onset: "", frequency: "", sources: ["OMIM:607208"] } }] } : { "Nervous System": [{ id: "HP:0001250", name: "Seizure", metadata: { sex: "", onset: "", frequency: "HP:0040280", sources: ["ORPHA:33069"] } }] } });
const CLINGEN_VALIDITY = { rows: [
  { symbol: "SCN1A", hgnc_id: "HGNC:10585", ep: "Epilepsy Gene Curation Expert Panel", disease_name: "Dravet syndrome  ", mondo: "MONDO:0100135", moi: "AD", classification: "Definitive", report_id: "r1", released: "09/06/2019", date: "2019-09-06", animal_model_only: 0 },
  { symbol: "SCN1A", hgnc_id: "HGNC:10585", ep: "Epilepsy Gene Curation Expert Panel", disease_name: "generalized epilepsy with febrile seizures plus", mondo: "MONDO:0018214", moi: "AD", classification: "Definitive", report_id: "r2", released: "09/06/2019", date: "2019-09-06", animal_model_only: 0 },
] };
const CLINGEN_DOSAGE = { rows: [{ symbol: "SCN1A", hgnc_id: "HGNC:10585", haplo_assertion: 3, triplo_assertion: 0, haplo_disease: "developmental and epileptic encephalopathy, 6" }] };
const CLINGEN_EREPO = { variantInterpretations: [{ uuid: "u1", caid: "CAR:CA303333", hgvs: ["NM_001165963.4:c.2303C>T"], condition: { "@id": "MONDO:0100135", label: "Dravet syndrome" }, guidelines: [{ outcome: { label: "Likely Pathogenic" } }], publishedDate: "2024-05-07" }] };
const CLINVAR_SEARCH = { esearchresult: { count: "1506", idlist: ["68000"] } };
const CLINVAR_SUMMARY = { result: { uids: ["68000"], "68000": { uid: "68000", accession: "VCV000068000", title: "NM_001165963.4(SCN1A):c.5536_5539del", germline_classification: { description: "Pathogenic", review_status: "criteria provided, multiple submitters, no conflicts", last_evaluated: "2024/01/01", trait_set: [{ trait_name: "Severe myoclonic epilepsy in infancy" }] }, variation_set: [{ variation_xrefs: [{ db_source: "dbSNP", db_id: "796053029" }] }] } } };
const ALLIANCE_ORTH = { total: 2, results: [
  { geneToGeneOrthologyGenerated: { objectGene: { primaryExternalId: "MGI:98246", geneSymbol: { displayText: "Scn1a" }, taxon: { name: "Mus musculus" } }, isBestScore: { name: "Yes" }, confidence: { name: "high" } } },
  { geneToGeneOrthologyGenerated: { objectGene: { primaryExternalId: "ZFIN:ZDB-GENE-060906-1", geneSymbol: { displayText: "scn1lab" }, taxon: { name: "Danio rerio" } }, isBestScore: { name: "Yes" }, confidence: { name: "moderate" } } },
] };
const ALLIANCE_MODELS = (gene: string) => ({ total: 1, results: gene.startsWith("MGI") ? [{ model: { primaryExternalId: "MGI:4950073", name: { displayText: "Scn1a<tm1Kea>/Scn1a<+>" } }, diseaseModels: [{ associationType: "IS_MODEL_OF", diseaseModel: "Dravet syndrome" }] }] : [{ model: { primaryExternalId: "ZFIN:ZDB-FISH-161012-5", name: "scn1lab<sup>s552/s552</sup>" }, diseaseModels: [{ associationType: "IS_MODEL_OF", diseaseModel: "Dravet syndrome" }] }] });

// ---- International registries (shapes of the ISRCTN XML API and the EU CTR summary download) ----
export const ISRCTN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<allTrials totalCount="3" xmlns="http://www.67bricks.com/isrctn">
<fullTrial>
  <trial lastUpdated="2025-01-10T00:00:00Z" version="3" isPublished="true">
    <isrctn dateAssigned="2020-01-01T00:00:00Z">11111111</isrctn>
    <trialDescription><title>Study NCT00000001</title><scientificTitle>Official title of NCT00000001</scientificTitle></trialDescription>
    <externalRefs><doi>10.1186/ISRCTN11111111</doi><eudraCTNumber>2019-000123-45</eudraCTNumber><clinicalTrialsGovNumber>NCT00000001</clinicalTrialsGovNumber><protocolSerialNumber>EX-001</protocolSerialNumber></externalRefs>
    <trialDesign><primaryStudyDesign>Interventional</primaryStudyDesign><interventionalTrialDesign><allocation>Randomized controlled trial</allocation><masking>Blinded (masking used)</masking><purposes><purpose>Treatment</purpose></purposes></interventionalTrialDesign><secondaryStudyDesign>Randomised controlled trial</secondaryStudyDesign><overallEndDate>2023-06-30T00:00:00.000Z</overallEndDate></trialDesign>
    <conditions><condition><description>Dravet syndrome</description></condition></conditions>
    <interventions><intervention><interventionType>Drug</interventionType><drugNames>Investigational product</drugNames></intervention></interventions>
    <primaryOutcome>Change in convulsive seizure frequency</primaryOutcome>
    <participants><recruitmentCountries><country>United Kingdom</country></recruitmentCountries><trialCentres><trialCentre id="c1"><name>Great Ormond Street Hospital</name><city>London</city><country>England</country></trialCentre></trialCentres><targetEnrolment>40</targetEnrolment><totalFinalEnrolment>38</totalFinalEnrolment><ageRange>Child</ageRange><gender>All</gender><recruitmentStart>2020-01-01T00:00:00.000Z</recruitmentStart><recruitmentEnd>2022-12-31T00:00:00.000Z</recruitmentEnd></participants>
    <parties><sponsorId>s1</sponsorId><funderId>f1</funderId><contactId>k1</contactId></parties>
    <outputs><output><outputType>Results article</outputType></output></outputs>
  </trial>
  <sponsor id="s1"><organisation>Example Sponsor</organisation><rorId>https://ror.org/000000009</rorId></sponsor>
  <funder id="f1"><name>Example Funder</name></funder>
  <contact id="k1"><contactTypes><contactType>Principal investigator</contactType></contactTypes><forename>Ada</forename><surname>Lovelace</surname><orcid>https://orcid.org/0000-0002-0000-0001</orcid><contactDetails><email>ada@example.org</email><telephone>+44 0000</telephone></contactDetails></contact>
</fullTrial>
<fullTrial>
  <trial lastUpdated="2026-08-01T00:00:00Z" version="1" isPublished="true">
    <isrctn dateAssigned="2026-01-01T00:00:00Z">22222222</isrctn>
    <trialDescription><title>UK natural history registry of Dravet syndrome</title></trialDescription>
    <externalRefs><clinicalTrialsGovNumber/><eudraCTNumber/><protocolSerialNumber>NH-2</protocolSerialNumber></externalRefs>
    <trialDesign><primaryStudyDesign>Observational</primaryStudyDesign><secondaryStudyDesign>Cohort study</secondaryStudyDesign><overallEndDate>2031-01-01T00:00:00.000Z</overallEndDate></trialDesign>
    <conditions><condition><description>Dravet syndrome</description></condition></conditions>
    <primaryOutcome>Seizure burden measured with a seizure diary over 5 years</primaryOutcome>
    <participants><recruitmentCountries><country>United Kingdom</country><country>Ireland</country></recruitmentCountries><targetEnrolment>300</targetEnrolment><totalFinalEnrolment>0</totalFinalEnrolment><gender>All</gender><recruitmentStart>2026-01-01T00:00:00.000Z</recruitmentStart><recruitmentEnd>2029-12-31T00:00:00.000Z</recruitmentEnd></participants>
    <parties><sponsorId>s2</sponsorId><contactId>k2</contactId></parties>
  </trial>
  <sponsor id="s2"><organisation>University of Example</organisation></sponsor>
  <contact id="k2"><contactTypes><contactType>Principal investigator</contactType></contactTypes><forename>No</forename><surname>Orcid</surname><contactDetails><email>noorcid@example.org</email></contactDetails></contact>
</fullTrial>
<fullTrial>
  <trial lastUpdated="2024-01-01T00:00:00Z" version="1" isPublished="true">
    <isrctn>33333333</isrctn>
    <trialDescription><title>Study NCT00000004</title></trialDescription>
    <externalRefs><clinicalTrialsGovNumber/><eudraCTNumber/></externalRefs>
    <trialDesign><primaryStudyDesign>Interventional</primaryStudyDesign><overallEndDate>2020-01-01T00:00:00.000Z</overallEndDate></trialDesign>
    <recruitmentStatusOverride>Stopped</recruitmentStatusOverride>
    <participants><recruitmentCountries><country>Germany</country></recruitmentCountries></participants>
  </trial>
</fullTrial>
</allTrials>`;

export const EUCTR_TXT = `

EudraCT Number:          2019-000123-45
Sponsor Protocol Number: EX-001
Sponsor Name:            Example Sponsor
Full Title:              Official title of NCT00000001
Start Date:              2020-02-01
Medical condition:       Dravet syndrome
Disease:                 Version: 21.1, SOC Term: 10010331 - Congenital, familial and genetic disorders, Classification Code: 10077260, Term: Dravet syndrome, Level: PT
Population Age:          Children, Adolescents
Gender:                  Male, Female
Trial protocol:          FR(Completed) DE(Completed)
Link:                    https://www.clinicaltrialsregister.eu/ctr-search/search?query=eudract_number:2019-000123-45

EudraCT Number:          2016-000999-11
Sponsor Protocol Number: STOP-9
Sponsor Name:            Another Sponsor
Full Title:              An EU-only trial in Dravet syndrome
Start Date:              2016-05-01
Medical condition:       Dravet syndrome
Disease:                 Version: 19.0, Term: Dravet syndrome, Level: PT
Population Age:          Children
Gender:                  Male, Female
Trial protocol:          IT(Prematurely Ended) ES(Completed)
Link:                    https://www.clinicaltrialsregister.eu/ctr-search/search?query=eudract_number:2016-000999-11
`;

export function researchRouter(fail: Failures = {}) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const host = new URL(url).host;
    const provider = host.includes("clinicaltrialsregister.eu") ? "euctr" : host.includes("opentargets") ? "opentargets" : url.includes("/gwas/") ? "gwas" : host.includes("clinicaltrials") ? "clinicaltrials" : url.includes("europepmc") ? "europepmc" : host.includes("openalex") ? "openalex" : host.includes("crossref") ? "crossref" : host.includes("datacite") ? "datacite" : host.includes("monarchinitiative") ? "monarch" : host.includes("orphadata") ? "orphadata" : host.includes("ontology.jax.org") ? "hpo" : host.includes("clinicalgenome") ? "clingen" : host.includes("eutils.ncbi") ? "clinvar" : host.includes("alliancegenome") ? "alliance" : host.includes("isrctn.com") ? "isrctn" : host.includes("clinicaltrialsregister.eu") ? "euctr" : null;
    if (!provider) throw new Error(`unexpected URL ${url}`);
    const f = fail[provider];
    if (f === "down") throw new TypeError("fetch failed");
    if (f === "timeout") throw new DOMException("timed out", "TimeoutError");
    if (f === "http500") return new Response("error", { status: 500 });
    switch (provider) {
      case "opentargets": {
        const q = String(JSON.parse(String(init?.body)).query);
        return json(q.includes("search(") ? OT_SEARCH : q.includes("evidences(") ? OT_VARIANTS : q.includes("target(") ? OT_OTHER : OT_DISEASE);
      }
      case "gwas":
        return json(GWAS);
      case "clinicaltrials":
        return json(new URL(url).searchParams.get("query.term") ? CTGOV_INFRA : CTGOV);
      case "europepmc": {
        const q = decodeURIComponent(new URL(url).searchParams.get("query") ?? "");
        if (q.startsWith("ACCESSION_ID:")) return json(q.includes("NCT00000001") ? EPMC_ACCESSION : { hitCount: 0, resultList: { result: [] } });
        return json(q.includes("sort_cited") ? EPMC_CITED : q.includes("sort_date") ? EPMC_RECENT : EPMC_REL);
      }
      case "openalex": {
        const filter = new URL(url).searchParams.get("filter") ?? "";
        return json(filter.startsWith("cites:") ? OA_CITING : filter.startsWith("openalex:") ? OA_REFS : OA_WORKS);
      }
      case "crossref": {
        const doi = decodeURIComponent(new URL(url).pathname.replace("/works/", ""));
        return json(CROSSREF(doi.toLowerCase()));
      }
      case "monarch": {
        const cat = new URL(url).searchParams.get("category") ?? "";
        return json(url.includes("/entity/") ? MONARCH_ENTITY : cat.includes("CausalGene") ? MONARCH_CAUSAL : MONARCH_MODELS);
      }
      case "orphadata":
        return json(url.includes("rd-phenotypes") ? ORPHA_PHENO : url.includes("rd-associated-genes") ? ORPHA_GENES : url.includes("rd-epidemiology") ? ORPHA_EPI : url.includes("rd-natural_history") ? ORPHA_NH : ORPHA_XREF);
      case "hpo":
        return json(JAX(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")));
      case "clingen":
        return json(url.includes("/api/validity") ? CLINGEN_VALIDITY : url.includes("/api/dosage") ? CLINGEN_DOSAGE : CLINGEN_EREPO);
      case "clinvar":
        return json(url.includes("esearch") ? CLINVAR_SEARCH : CLINVAR_SUMMARY);
      case "alliance":
        return json(url.includes("/orthologs") ? ALLIANCE_ORTH : ALLIANCE_MODELS(decodeURIComponent(new URL(url).pathname.split("/")[3] ?? "")));
      case "isrctn":
        return new Response(ISRCTN_XML, { status: 200, headers: { "content-type": "application/xml" } });
      case "euctr":
        return new Response(EUCTR_TXT, { status: 200, headers: { "content-type": "application/octet-stream" } });
      case "datacite":
        return json(DATACITE);
    }
  });
}
