/**
 * Discovery → OpenAI Evidence Extractor bridge (offline, on demand).
 *
 *   npx tsx scripts/discover-candidates.ts "Dravet syndrome"
 *
 * 1. Assembles the machine-assembled discovery graph for a disease (live providers).
 * 2. Picks the first open-access paper with Europe PMC full text.
 * 3. Runs the OpenAI Evidence Extractor over that text (quotes verified verbatim, as for the reviewed bundle).
 * 4. Writes data/candidates/<slug>.json. Every claim is review_status = "machine_assembled",
 *    eligible_for_ranking = false, eligible_for_action = false.
 *
 * Nothing is written into data/real/cdd-real.json. Promoting a candidate to the reviewed graph
 * is a separate analyst step (the review boundary); this script never crosses it.
 */
import "./load-env";
// Extraction is offline; allow a longer OpenAI timeout than the 25s runtime default (read when the client is created).
process.env.OPENAI_TIMEOUT_MS ||= "180000";
import fs from "node:fs";
import path from "node:path";
import { MultiProviderDiscoveryService } from "../src/lib/discovery";
import { EuropePmcProvider } from "../src/lib/research/providers/europepmc";
import { OpenAIEvidenceExtractorImpl } from "../src/lib/services/openai/evidence-extractor";
import { getOpenAI, openAIModel } from "../src/lib/services/openai/client";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) throw new Error('Usage: npx tsx scripts/discover-candidates.ts "<disease>"');
  if (!getOpenAI()) throw new Error("OPENAI_API_KEY is not configured");
  const out = await new MultiProviderDiscoveryService().preview(query);
  if (out.kind !== "preview") throw new Error(`No discovery preview for "${query}" (${out.kind})`);
  const p = out.preview;
  const oa = p.records.find((r) => r.kind === "paper" && r.full_text_available && r.ids.pmcid && r.publication_status !== "preprint");
  if (!oa || oa.kind !== "paper") throw new Error("No peer-reviewed open-access full text among the discovered papers");

  const source = await new EuropePmcProvider().fetchFullText(oa.ids.pmcid!);
  const text = source.text.slice(0, 8_000); // bounded excerpt keeps the extraction call small
  const r = await new OpenAIEvidenceExtractorImpl().extractDetailed({ source: `Europe PMC ${oa.ids.pmcid}`, source_url: source.url, source_type: "literature", retrieval_date: source.retrieval_date, text, citation: { pmcid: oa.ids.pmcid, pmid: oa.ids.pmid, doi: oa.ids.doi } });

  const slug = p.disease.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const file = path.join(process.cwd(), "data", "candidates", `${slug}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        disease: p.disease,
        paper: { label: oa.label, ids: oa.ids, provenance: oa.provenance },
        extractor: { model: openAIModel(), returned: r.returned, kept: r.claims.length, run_at: new Date().toISOString() },
        review_status: "machine_assembled",
        eligible_for_ranking: false,
        eligible_for_action: false,
        claims: r.claims.map((c) => ({ ...c, review_status: "machine_assembled", eligible_for_ranking: false, eligible_for_action: false })),
      },
      null,
      1,
    ),
  );
  console.log(`${p.disease.label}: ${r.claims.length}/${r.returned} quote-verified candidate claims from ${oa.ids.pmcid} → ${path.relative(process.cwd(), file)} (machine-assembled, not reviewed)`);
}

main().catch((e) => {
  console.error(`FAILED: ${e?.message ?? e}`);
  process.exit(1);
});
