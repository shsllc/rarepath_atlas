/**
 * Gate 2 placeholders. Each class documents the real endpoint it will call.
 * They throw rather than return empty data so nothing silently looks like "no evidence".
 */
import type {
  DiseaseDataProvider,
  FundingResearchProvider,
  LiteratureProvider,
  PatientOrganizationProvider,
  TrialsProvider,
} from "../interfaces";

class NotImplementedYet extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet (planned for Gate 2). Running in DATA_MODE=fixture.`);
  }
}

/** MONDO via OLS4 (https://www.ebi.ac.uk/ols4/api), HPO annotations (https://ontology.jax.org/api), ClinVar via E-utilities. */
export class MondoHpoDiseaseProvider implements DiseaseDataProvider {
  async searchDiseases(): Promise<never> { throw new NotImplementedYet("DiseaseDataProvider.searchDiseases"); }
  async getDisease(): Promise<never> { throw new NotImplementedYet("DiseaseDataProvider.getDisease"); }
  async getGenes(): Promise<never> { throw new NotImplementedYet("DiseaseDataProvider.getGenes"); }
  async getPhenotypes(): Promise<never> { throw new NotImplementedYet("DiseaseDataProvider.getPhenotypes"); }
}

/** PubMed/PMC via NCBI E-utilities (https://eutils.ncbi.nlm.nih.gov/entrez/eutils/). */
export class PubMedLiteratureProvider implements LiteratureProvider {
  async search(): Promise<never> { throw new NotImplementedYet("LiteratureProvider.search"); }
  async fetchAbstract(): Promise<never> { throw new NotImplementedYet("LiteratureProvider.fetchAbstract"); }
}

/** ClinicalTrials.gov API v2 (https://clinicaltrials.gov/api/v2/studies). No key required. */
export class ClinicalTrialsGovProvider implements TrialsProvider {
  async searchStudies(): Promise<never> { throw new NotImplementedYet("TrialsProvider.searchStudies"); }
  async getStudy(): Promise<never> { throw new NotImplementedYet("TrialsProvider.getStudy"); }
}

/** NIH RePORTER API v2 (https://api.reporter.nih.gov/v2/projects/search). No key required. */
export class NihReporterProvider implements FundingResearchProvider {
  async findProjects(): Promise<never> { throw new NotImplementedYet("FundingResearchProvider.findProjects"); }
}

/** NORD / Global Genes directories + verified org sites. Bright Data is an optional fetch backend. */
export class DirectoryPatientOrgProvider implements PatientOrganizationProvider {
  async findOrganizations(): Promise<never> { throw new NotImplementedYet("PatientOrganizationProvider.findOrganizations"); }
}
