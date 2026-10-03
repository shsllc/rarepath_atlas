/**
 * Stage 1 of the real-data pipeline (no OpenAI). Retrieves every source the
 * featured CDD journey cites and stores it verbatim in data/real/sources.json.
 *
 *   npx tsx scripts/fetch-sources.ts
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { SourceRecord } from "../src/lib/schemas";
import { PubMedProvider } from "../src/lib/providers/pubmed";
import { ClinicalTrialsGovProvider } from "../src/lib/providers/clinicaltrials";
import { OlsOntologyProvider } from "../src/lib/providers/ontology";
import { NihReporterProvider } from "../src/lib/providers/reporter";
import { HomepageOrgProvider } from "../src/lib/providers/orgs";

const OUT = path.join(process.cwd(), "data", "real", "sources.json");

const ANCHOR_PMIDS = ["32472944", "35483386", "39867409"];
const NCTS = ["NCT02738281", "NCT02705677"];
const MONDO = ["MONDO:0100039", "MONDO:0010726", "MONDO:0100040", "MONDO:0010283"];
const HPO = ["HP:0001250", "HP:0011097", "HP:0100704", "HP:0002376"];
const ORGS: [string, string][] = [
  ["ifcr", "https://cdkl5.com/"],
  ["loulou", "https://www.louloufoundation.org/"],
  ["irsf", "https://www.rettsyndrome.org/"],
  ["foxg1rf", "https://www.foxg1research.org/"],
];

/** Full-text sentences we need from PMC8882337 (license: text mining permitted). */
const PMC_KEY_PHRASES = [
  /NCT02738281/,
  /RTT Clinical Severity Scale/,
  /performed on all of the participants/,
  /Scores on the Clinical Severity Scale/,
  /imprecisely named/,
  /disease-specific severity scales/,
  /increased frequency of seizures in CDD/,
  /Ideally, a scale/,
  /support classifying these DEs as distinct/,
  /should not be used/,
  /trained on the CSS/,
  /previously published by Schanen/,
];

async function main() {
  const pubmed = new PubMedProvider();
  const ctgov = new ClinicalTrialsGovProvider();
  const ols = new OlsOntologyProvider();
  const reporter = new NihReporterProvider();
  const orgs = new HomepageOrgProvider();
  const out: SourceRecord[] = [];
  const log = (r: SourceRecord) => console.log(`  ✓ ${r.id.padEnd(22)} ${r.title.slice(0, 80)}`);

  console.log("PubMed abstracts");
  for (const r of await pubmed.fetchAbstracts(ANCHOR_PMIDS)) out.push(r), log(r);

  console.log("PMC full-text excerpts (license-checked)");
  const comparison = out.find((r) => r.id === "pubmed:32472944")!;
  const pmc = await pubmed.fetchPmcExcerpt(comparison.citation.pmcid!, "32472944", (s) => s.length < 700 && PMC_KEY_PHRASES.some((re) => re.test(s)));
  if (pmc) out.push(pmc), log(pmc);
  else console.log("  ! PMC excerpt skipped (license does not permit text mining)");

  console.log("ClinicalTrials.gov");
  for (const nct of NCTS) {
    const r = await ctgov.getStudy(nct);
    out.push(r), log(r);
  }

  console.log("NIH RePORTER");
  const grant = await reporter.getProjectsByCoreNumber("U54HD061222");
  if (grant) out.push(grant), log(grant);

  console.log("MONDO / HPO / HGNC");
  for (const id of MONDO) out.push(await ols.getTerm("mondo", id)), log(out.at(-1)!);
  for (const id of HPO) out.push(await ols.getTerm("hp", id)), log(out.at(-1)!);
  for (const g of ["CDKL5", "FOXG1"]) out.push(await ols.getGene(g)), log(out.at(-1)!);

  console.log("Organization homepages");
  for (const [id, url] of ORGS) out.push(await orgs.fetchHomepage(id, url)), log(out.at(-1)!);

  const validated = out.map((r) => SourceRecord.parse(r));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(validated, null, 2) + "\n");
  console.log(`\nWrote ${validated.length} source records → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
