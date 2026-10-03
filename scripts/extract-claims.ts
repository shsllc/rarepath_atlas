/**
 * Stage 2 (OpenAI). Runs the Evidence Extractor over every retrieved text source
 * and the Entity Reconciler over entity mentions that don't match a known alias.
 * Writes data/real/extractions.json. Never prints the API key.
 *
 *   npx tsx scripts/extract-claims.ts            # requires OPENAI_API_KEY in .env.local
 *   npx tsx scripts/extract-claims.ts --allow-env-key
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { SourceRecord, type GraphNode } from "../src/lib/schemas";
import { OpenAIEvidenceExtractorImpl } from "../src/lib/services/openai/evidence-extractor";
import { OpenAIEntityReconcilerImpl } from "../src/lib/services/openai/entity-reconciler";
import { getOpenAI, openAIKeySource, openAIModel } from "../src/lib/services/openai/client";
import { NODES } from "./curation/cdd";

const ROOT = process.cwd();
const SOURCES = path.join(ROOT, "data", "real", "sources.json");
const OUT = path.join(ROOT, "data", "real", "extractions.json");
const TEXT_KINDS = new Set(["pubmed_abstract", "pmc_excerpt", "ctgov_record", "funding_record"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  process.env.OPENAI_TIMEOUT_MS ??= "120000"; // long abstracts; set before the client is created
  if (!getOpenAI()) throw new Error("No OPENAI_API_KEY configured.");
  const src = openAIKeySource();
  if (src !== ".env.local" && !process.argv.includes("--allow-env-key")) {
    throw new Error(`Refusing to run: key source is ${src}. Put the dedicated key in .env.local (or pass --allow-env-key).`);
  }
  const model = openAIModel();
  const runId = `extract-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`key source: ${src} | model: ${model} | run: ${runId}`);

  const sources = (JSON.parse(fs.readFileSync(SOURCES, "utf8")) as unknown[]).map((s) => SourceRecord.parse(s)).filter((s) => TEXT_KINDS.has(s.kind));
  // Candidate list for the reconciler: curated nodes with their (to-be-verified) ids.
  const nodes = NODES.map(({ ids = [], ...n }) => ({ ...n, aliases: n.aliases ?? [], external_ids: ids.map(([system, id]) => ({ system, id, verification: "verified" })) })) as unknown as GraphNode[];
  // Type-aware: "CDKL5" as a Disease mention must not resolve to the CDKL5 Gene node.
  const alias = new Map<string, string>();
  for (const n of nodes) for (const a of [n.label, ...(n.aliases ?? [])]) alias.set(`${n.type}|${norm(a)}`, n.id);

  const extractor = new OpenAIEvidenceExtractorImpl();
  const reconciler = new OpenAIEntityReconcilerImpl();
  const reconCache = new Map<string, { id: string | null; how: string }>();
  let reconcilerCalls = 0;

  async function resolve(text: string, type: string) {
    const exact = alias.get(`${type}|${norm(text)}`);
    if (exact) return { id: exact, how: "alias" };
    const key = `${type}|${norm(text)}`;
    if (reconCache.has(key)) return reconCache.get(key)!;
    const candidates = nodes.filter((n) => n.type === type);
    if (candidates.length === 0) return { id: null, how: "no_candidates" };
    reconcilerCalls++;
    const r = await reconciler.reconcile(text, candidates);
    const out = { id: r.matched_node_id, how: `openai_reconciler:${r.match_type}:${r.confidence}` };
    reconCache.set(key, out);
    return out;
  }

  const perSource = [];
  for (const s of sources) {
    const r = await extractor.extractDetailed({ source: s.title, source_url: s.url, source_type: "literature", retrieval_date: s.retrieval_date, text: s.text, citation: s.citation });
    const claims = [];
    for (const c of r.claims) {
      const subj = await resolve(c.subject.text, c.subject.type);
      const obj = await resolve(c.object.text, c.object.type);
      claims.push({ ...c, subject_id: subj.id, subject_match: subj.how, object_id: obj.id, object_match: obj.how });
    }
    const mapped = claims.filter((c) => c.subject_id && c.object_id).length;
    console.log(`  ${s.id.padEnd(22)} returned ${r.returned}, kept ${r.claims.length} (dropped ${r.dropped_unverified_quote} unverified quotes), mapped ${mapped}`);
    perSource.push({ source_id: s.id, response_id: r.response_id, returned: r.returned, kept: r.claims.length, dropped_unverified_quote: r.dropped_unverified_quote, claims });
  }

  const out = {
    run_id: runId,
    role: "OpenAI Evidence Extractor + Entity Reconciler",
    model,
    key_source: src,
    created_at: new Date().toISOString(),
    reconciler_calls: reconcilerCalls,
    sources: perSource,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${path.relative(ROOT, OUT)} (reconciler calls: ${reconcilerCalls})`);
}

main().catch((e) => {
  // OpenAI auth errors can echo a masked key fragment: print status/code only for API errors.
  console.error(e?.status ? `FAILED: OpenAI API ${e.status} ${e.code ?? e.type ?? ""}` : `FAILED: ${e?.message ?? e}`);
  process.exit(1);
});
