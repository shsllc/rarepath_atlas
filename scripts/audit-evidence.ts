/**
 * Final evidence-integrity audit of the shipped dataset. Writes docs/final-evidence-audit.md
 * and exits non-zero if any check fails.
 *   npx tsx scripts/audit-evidence.ts
 */
import fs from "node:fs";
import path from "node:path";
import { deriveEvidenceStatus } from "../src/lib/schemas";
import { JsonGraphService, REAL_BUNDLE, bundlePath } from "../src/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "../src/lib/services/reusable-asset-finder";
import { GraphSearchService } from "../src/lib/services/search-service";
import { buildGraphView, DEFAULT_FILTERS, isUnreviewedAiEdge, EDGE_STATUS_CLASS } from "../src/lib/graph-view";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function main() {
  const g = JsonGraphService.fromFile(REAL_BUNDLE);
  const b = g.bundle();
  const search = new GraphSearchService(g, new CuratedReusableAssetFinder(g));
  const r = await search.search("CDKL5");
  if (!r.found) throw new Error("Canonical search CDKL5 returned no result");
  const src = new Map(b.sources.map((s) => [s.id, norm(s.text)]));
  const items = b.edges.flatMap((e) => e.evidence.map((ev) => ({ e, ev })));
  const featured = b.opportunities.find((o) => o.story.length)!;
  const featuredEdges = [...new Set([...featured.evidence_edge_ids, ...featured.story.flatMap((s) => s.evidence_edge_ids), ...featured.next_actions.flatMap((a) => a.evidence_edge_ids)])];
  const graph = buildGraphView(b.nodes, b.edges, b.focus_disease_id, DEFAULT_FILTERS);
  const urlRe: Record<string, RegExp> = {
    MONDO: /^https:\/\/monarchinitiative\.org\/MONDO:\d{7}$/,
    OMIM: /^https:\/\/omim\.org\/entry\/\d+$/,
    ORPHA: /^https:\/\/www\.orpha\.net\/en\/disease\/detail\/\d+$/,
    HGNC: /^https:\/\/www\.genenames\.org\/.*HGNC:\d+$/,
    HPO: /^https:\/\/hpo\.jax\.org\/browse\/term\/HP:\d{7}$/,
    NCT: /^https:\/\/clinicaltrials\.gov\/study\/NCT\d{8}$/,
    PMID: /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/,
  };
  const ids = b.nodes.flatMap((n) => n.external_ids.filter((x) => x.system !== "GARD").map((x) => ({ n, x })));
  const curatedText = JSON.stringify([b.connections, b.opportunities, b.gaps, b.nodes.map((n) => [n.lay_summary, n.description])]).toLowerCase();
  // Disclaimers ("…neither implies that a Rett treatment would work…") are excluded; only affirmative sentences are scanned.
  const affirmative = curatedText.split(/(?<=[.!?])\s+/).filter((sent) => !/\b(not|neither|no|never|nor)\b/.test(sent));
  const transfer = [/will work for/, /treatments? (will|would|should) (transfer|work)/, /use the rett (protocol|treatment)/, /equivalent to rett/, /same disease/, /\bcure\b/];

  const checks: [string, boolean, string][] = [
    ["1. Default result contains no fixture data", bundlePath().endsWith("cdd-real.json") && !r.is_fixture && r.edges.every((e) => e.source_type !== "demo_fixture" && !e.quoted_or_structured_evidence.startsWith("[FIXTURE")), `default bundle ${path.basename(bundlePath())}; ${r.edges.length} edges checked`],
    ["2. No fixture warning on the real CDD demo", !r.fixture_warning, "fixture_warning absent"],
    ["3. Every featured relationship has provenance", featuredEdges.every((id) => { const e = g.getEdge(id)!; return e.evidence.length > 0 && e.evidence.every((ev) => ev.source_url.startsWith("https://") && ev.retrieval_date && ev.source_record_id); }), `${featuredEdges.length} featured edges`],
    ["4. Every quote exists verbatim in its stored retrieved text", items.every(({ ev }) => src.get(ev.source_record_id ?? "")?.includes(norm(ev.quoted_or_structured_evidence))), `${items.length} quotes across ${b.sources.length} sources`],
    ["5. External identifiers point to official destinations", ids.every(({ x }) => urlRe[x.system]?.test(x.url ?? "")), `${ids.length} identifiers (GARD shown as text, no link)`],
    ["6. Preprint explicitly marked", b.nodes.some((n) => n.type === "Paper" && n.pmid === "39867409" && n.publication_status === "preprint"), "PMID 39867409 = preprint"],
    ["7. Analyst-unreviewed OpenAI extractions off by default", !DEFAULT_FILTERS.includeUnreviewedAi && graph.edges.every((v) => !isUnreviewedAiEdge(g.getEdge(v.id)!)) && b.connections.concat().every((c) => c.evidence_edge_ids.every((id) => !id.startsWith("edge:ai:"))), `${b.edges.filter(isUnreviewedAiEdge).length} unreviewed edges hidden from default graph and cards`],
    ["8. Inferred relationships visibly distinct", new Set(Object.values(EDGE_STATUS_CLASS)).size === 4 && b.opportunities.every((o) => o.status !== "supported"), "4 distinct line styles; all reuse cards shown as AI-inferred, never Known"],
    ["9. Contradictions remain visible", b.edges.some((e) => deriveEvidenceStatus(e) === "contradictory") && graph.edges.some((v) => v.status === "contradictory") && r.connections.some((c) => c.status === "contradictory"), "contradicted 'Rett variant' classification in cards, spotlight and default graph"],
    ["10. No treatment-transfer claim", affirmative.every((sent) => transfer.every((re) => !re.test(sent))) && !b.edges.some((e) => /treat/i.test(e.predicate)), `${affirmative.length} affirmative curated sentences scanned (disclaimers excluded); no treatment predicates exist`],
  ];

  const failed = checks.filter((c) => !c[1]);
  const md = `# Final evidence audit

Generated by \`npx tsx scripts/audit-evidence.ts\` on ${new Date().toISOString().slice(0, 10)} against \`data/real/cdd-real.json\` (${b.nodes.length} entities, ${b.edges.length} relationships, ${b.sources.length} retrieved sources, ${items.length} verbatim quotes).

**Result: ${failed.length === 0 ? "ALL 10 CHECKS PASS" : `${failed.length} CHECK(S) FAILED`}**

| Check | Result | Detail |
|---|---|---|
${checks.map(([name, ok, detail]) => `| ${name} | ${ok ? "PASS" : "**FAIL**"} | ${detail} |`).join("\n")}

## Known limitations (by design, not failures)

- MONDO's CDKL5 definition preserves the historical "Atypical Rett Syndrome" naming. It is shown as the *historical* side of a contradiction, not as an error.
- Registry vs. paper counts differ (1,044 enrolled vs. 793 analysed; 14 listed locations vs. 15 sites). Both are shown as a gap.
- ${b.edges.filter(isUnreviewedAiEdge).length} OpenAI-extracted relationships are quote-verified but not analyst-reviewed. They are visible only behind an opt-in graph filter, labelled "AI-extracted".
- One featured journey only (CDKL5 deficiency disorder). No treatment, mechanism or clinical-equivalence claims are made.

## Claim freeze

**Status: ${failed.length === 0 ? "FROZEN (evidence set frozen on 2026-10-03)" : "NOT FROZEN — fix failing checks first"}.** No further source retrieval unless a factual error is found.

- Severity-scale statement → PMID 31147226 (methods sentence quoted verbatim)
- Shared-infrastructure anchor → NCT02738281 (conditions + eligibility list CDKL5)
- CDD and Rett distinct → contradicted "Rett variant" claim; PMIDs 35483386 and 32472944
- Featured story and actions cite analyst-reviewed edges only (no OpenAI-only edges)
- Preprint (PMID 39867409) flagged; no fixture data in the default journey; no treatment-transfer claims
`;
  fs.writeFileSync(path.join(process.cwd(), "docs", "final-evidence-audit.md"), md);
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
