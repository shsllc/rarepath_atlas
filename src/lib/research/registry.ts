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
import { MonarchProvider } from "./providers/monarch";
import { OrphadataProvider } from "./providers/orphadata";
import { HpoProvider } from "./providers/hpo";
import { ClinGenProvider } from "./providers/clingen";
import { ClinVarProvider } from "./providers/clinvar";
import { AllianceProvider } from "./providers/alliance";
import { IsrctnProvider } from "./providers/isrctn";
import { EuCtrProvider } from "./providers/euctr";
import type { ResearchProvider } from "./types";

export function liveProviders(): ResearchProvider[] {
  return [new OpenTargetsProvider(), new GwasProvider(), new ClinicalTrialsProvider(), new EuropePmcProvider(), new DataCiteProvider(), new OpenAlexProvider(), new CrossrefProvider(), new TrialPublicationsProvider(),
    new MonarchProvider(), new OrphadataProvider(), new HpoProvider(), new ClinGenProvider(), new ClinVarProvider(), new AllianceProvider(),
    new IsrctnProvider(), new EuCtrProvider()];
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
  { name: "WHO ICTRP", data_types: ["International trial registrations from all WHO primary registries"], mode: "not_integrated", uses: [], homepage: "https://trialsearch.who.int", note: "Available with approval, not immediately: the XML Web Service is for research use with cost 'provided upon request', the crawling service is currently unavailable, the new-records SharePoint feed is by request, and commercial use is prohibited. The portal is not scraped. Trial records keep EudraCT / EU CT / UTN / registry ids so ICTRP records can be deduplicated if access is granted." },
  { name: "EMA CTIS", data_types: ["EU/EEA trials under the Clinical Trials Regulation"], mode: "not_integrated", uses: [], homepage: "https://euclinicaltrials.eu", note: "The public portal's JSON endpoints are undocumented and not endorsed by EMA, so they are not used. Legacy EU trials come from the EU Clinical Trials Register instead; EU CT numbers on ClinicalTrials.gov records are kept for reconciliation." },
  { name: "DDrare (NIBN, Japan)", data_types: ["Drug development for rare diseases, trials via ICTRP, drug targets and pathways"], mode: "not_integrated", uses: [], homepage: "https://ddrare.nibn.go.jp/index_e.html", note: "Active and highly relevant, but has no API and its terms require prior permission to use the information. Linked to, not ingested." },
  { name: "ANZCTR, jRCT, ChiCTR, CTRI, PACTR, ReBEC, CRiS, IRCT, RPCEC, DRKS", data_types: ["National / regional trial registries"], mode: "not_integrated", uses: [], homepage: "https://www.who.int/tools/clinical-trials-registry-platform/network/primary-registries", note: "No free documented API usable today: jRCT prohibits automated download, ANZCTR blocks automated clients and its XML export is unavailable, DRKS's download interface is still planned, and the others offer web pages only. Reachable legitimately via WHO ICTRP once approved." },
  { name: "DisGeNET", data_types: ["Gene-disease associations"], mode: "not_integrated", uses: [], homepage: "https://www.disgenet.com", note: "Requires a registered account and licence tier; not used." },
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
