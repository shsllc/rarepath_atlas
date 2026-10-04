/**
 * Every research source RarePath actually uses, with how it is used. Drives the Research Sources view
 * and the live discovery orchestration (live providers only).
 */
import { ClinicalTrialsProvider } from "./providers/clinicaltrials";
import { CrossrefProvider } from "./providers/crossref";
import { DataCiteProvider } from "./providers/datacite";
import { EuropePmcProvider } from "./providers/europepmc";
import { GwasProvider } from "./providers/gwas";
import { OpenAlexProvider } from "./providers/openalex";
import { OpenTargetsProvider } from "./providers/opentargets";
import { TrialPublicationsProvider } from "./providers/trialpubs";
import type { ResearchProvider } from "./types";

export function liveProviders(): ResearchProvider[] {
  return [new OpenTargetsProvider(), new GwasProvider(), new ClinicalTrialsProvider(), new EuropePmcProvider(), new DataCiteProvider(), new OpenAlexProvider(), new CrossrefProvider(), new TrialPublicationsProvider()];
}

export type SourceUse = "discovery" | "metadata" | "reviewed_ingestion";

export interface SourceEntry {
  name: string;
  data_types: string[];
  mode: "live" | "offline" | "not_integrated";
  /** discovery = machine-assembled preview; metadata = verification/reconciliation; reviewed_ingestion = feeds the reviewed bundle after analyst review. */
  uses: SourceUse[];
  homepage: string;
  note: string;
}

/** Offline sources used by scripts/fetch-sources.ts to build the reviewed CDD bundle, plus investigated-but-not-integrated sources. */
const OFFLINE: SourceEntry[] = [
  { name: "PubMed / PubMed Central (NCBI E-utilities)", data_types: ["Abstracts", "PMC full-text excerpts", "Author & affiliation lines"], mode: "offline", uses: ["reviewed_ingestion"], homepage: "https://pubmed.ncbi.nlm.nih.gov", note: "Retrieved offline, stored verbatim, analyst-reviewed into the CDD journey." },
  { name: "ClinicalTrials.gov (registry records)", data_types: ["Full study records for reviewed studies"], mode: "offline", uses: ["reviewed_ingestion"], homepage: "https://clinicaltrials.gov", note: "The two reviewed CDD studies were retrieved offline; live search uses the same API for discovery." },
  { name: "WHO ICTRP", data_types: ["International trial registrations"], mode: "not_integrated", uses: [], homepage: "https://trialsearch.who.int", note: "Programmatic access requires a WHO web-service subscription; the search portal is not scraped. Trial records already carry EudraCT/CTIS/UTN secondary ids so ICTRP records can be deduplicated when access is granted." },
  { name: "EMA CTIS", data_types: ["EU/EEA trials"], mode: "not_integrated", uses: [], homepage: "https://euclinicaltrials.eu", note: "No documented, versioned public API with reuse terms was found; the portal's internal endpoints are not scraped. EudraCT/CTIS numbers from ClinicalTrials.gov records are kept for future reconciliation." },
  { name: "MONDO / HPO (EBI OLS4) and HGNC", data_types: ["Disease, phenotype and gene identity"], mode: "offline", uses: ["reviewed_ingestion"], homepage: "https://www.ebi.ac.uk/ols4", note: "Identity verification for reviewed nodes." },
  { name: "NIH RePORTER", data_types: ["Funded projects"], mode: "offline", uses: ["reviewed_ingestion"], homepage: "https://reporter.nih.gov", note: "Funding record for the shared natural-history infrastructure." },
  { name: "Patient-organization websites", data_types: ["Mission statements (title/description only)"], mode: "offline", uses: ["reviewed_ingestion"], homepage: "https://rarepathatlas.netlify.app/atlas", note: "Homepage title and description only; no crawling." },
];

export function researchSources(): SourceEntry[] {
  const live = liveProviders().map(
    (p): SourceEntry => ({
      name: p.meta.name,
      data_types: p.meta.data_types,
      mode: "live",
      uses: [p.meta.role],
      homepage: p.meta.homepage,
      note:
        p.meta.role === "metadata"
          ? "Verifies and reconciles identifiers found by other sources; creates no biomedical claims."
          : "Queried at search time for diseases outside the reviewed slice. Results are machine-assembled and can contribute reviewed evidence only after analyst review.",
    }),
  );
  return [...live, ...OFFLINE];
}
