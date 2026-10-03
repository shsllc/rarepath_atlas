import { describe, expect, it } from "vitest";
import { deriveEvidenceStatus } from "@/lib/schemas";
import { REAL_BUNDLE, JsonGraphService } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";

const graph = JsonGraphService.fromFile(REAL_BUNDLE); // Zod-validated
const b = graph.bundle();
const finder = new CuratedReusableAssetFinder(graph);
const search = new GraphSearchService(graph, finder);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const sourceText = new Map(b.sources.map((s) => [s.id, norm(s.text)]));
const allItems = b.edges.flatMap((e) => e.evidence.map((ev) => ({ edge: e, ev })));

describe("real CDD dataset — evidence integrity", () => {
  it("is marked real", () => {
    expect(b.is_fixture).toBe(false);
    expect(b.sources.length).toBeGreaterThan(10);
  });

  it("1. every edge and evidence item has a source URL", () => {
    for (const e of b.edges) {
      expect(e.source_url, e.id).toMatch(/^https:\/\//);
      expect(e.evidence.length, e.id).toBeGreaterThan(0);
      for (const ev of e.evidence) expect(ev.source_url, ev.id).toMatch(/^https:\/\//);
    }
  });

  it("2. every cited quote exists verbatim in its stored source text", () => {
    for (const { ev } of allItems) {
      expect(ev.source_record_id, ev.id).toBeTruthy();
      const text = sourceText.get(ev.source_record_id!);
      expect(text, `${ev.id} → ${ev.source_record_id}`).toBeDefined();
      expect(text!.includes(norm(ev.quoted_or_structured_evidence)), `${ev.id}: "${ev.quoted_or_structured_evidence}"`).toBe(true);
    }
  });

  it("3. no fixture records appear in the real dataset or its search result", async () => {
    expect(allItems.every(({ ev }) => ev.source_type !== "demo_fixture" && ev.method !== "fixture")).toBe(true);
    expect(b.nodes.every((n) => n.verification !== "unverified_fixture")).toBe(true);
    const r = await search.search("CDKL5");
    if (!r.found) throw new Error("expected result");
    expect(r.is_fixture).toBe(false);
    expect(r.edges.every((e) => e.source_type !== "demo_fixture")).toBe(true);
  });

  it("4. AI-inferred edges can never render as Known", () => {
    for (const e of b.edges) if (e.inferred || e.evidence_type === "llm_inference" || e.source_type === "model_inference") expect(deriveEvidenceStatus(e)).not.toBe("supported");
  });

  it("5. contradictory evidence stays visible (superseded 'Rett variant' classification)", async () => {
    const variant = b.edges.find((e) => e.predicate === "classified_as_variant_of");
    expect(variant).toBeDefined();
    expect(deriveEvidenceStatus(variant!)).toBe("contradictory");
    expect(variant!.evidence.some((ev) => ev.stance === "contradicts")).toBe(true);
    const r = await search.search("CDD");
    if (!r.found) throw new Error("expected result");
    expect(r.connections.some((c) => c.status === "contradictory")).toBe(true);
    expect(r.gaps.some((g) => g.kind === "contradictory_evidence")).toBe(true);
  });

  it("6. no reuse card is ever Known, and none claims direct reusability", async () => {
    const r = await search.search("CDKL5");
    if (!r.found) throw new Error("expected result");
    expect(r.opportunities.length).toBeGreaterThan(0);
    for (const o of r.opportunities) {
      expect(o.status).not.toBe("supported");
      expect(o.reuse_classification).not.toBe("directly_reusable");
    }
  });

  it("7. every action recommendation references existing evidence edges", () => {
    for (const o of b.opportunities)
      for (const a of o.next_actions) {
        expect(a.evidence_edge_ids.length, a.id).toBeGreaterThan(0);
        for (const id of a.evidence_edge_ids) expect(graph.getEdge(id), `${a.id} → ${id}`).toBeDefined();
      }
  });

  it("8. contains no placeholder fixture phrases", () => {
    const s = JSON.stringify(b);
    for (const marker of ["[FIXTURE", "NOT RETRIEVED EVIDENCE", "demo_fixture", "unverified_fixture", "Expected:", "pending NIH RePORTER"]) expect(s.includes(marker), marker).toBe(false);
  });

  it("9. ontology and registry identifiers are verified and grounded in a retrieved record", () => {
    for (const n of b.nodes) {
      expect(n.verification, n.id).toBe("verified");
      for (const x of n.external_ids) expect(x.verification, `${n.id} ${x.id}`).toBe("verified");
    }
    const cdd = graph.getNode("disease:cdd")!;
    expect(cdd.external_ids.map((x) => x.id)).toContain("MONDO:0100039");
    expect(graph.getNode("disease:rett")!.external_ids.map((x) => x.id)).toContain("MONDO:0010726");
  });

  it("10. every source and evidence item has a retrieval date", () => {
    for (const s of b.sources) expect(s.retrieval_date, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const { ev } of allItems) expect(ev.retrieval_date, ev.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("real CDD dataset — scientific guardrails", () => {
  it("CDD is linked to the NHS registry record that lists CDKL5 as a condition", () => {
    const e = graph.getEdge("edge:cdd-in-nhs")!;
    expect(e.evidence.some((ev) => ev.citation?.nct === "NCT02738281")).toBe(true);
  });

  it("differences are preserved, not only similarities", () => {
    const differs = b.edges.filter((e) => e.predicate === "clinically_differs_from" && e.subject_id === "disease:cdd");
    expect(differs.map((e) => e.object_id).sort()).toEqual(["disease:foxg1", "disease:mdd", "disease:rett"]);
  });

  it("relationship types are not collapsed into one generic edge", () => {
    const cddRett = new Set(b.edges.filter((e) => e.subject_id === "disease:cdd" && e.object_id === "disease:rett").map((e) => e.predicate));
    for (const p of ["historically_classified_with", "classified_as_variant_of", "co_studied_with", "phenotypically_overlaps", "clinically_differs_from"] as const) expect(cddRett.has(p), p).toBe(true);
  });

  it("no treatment-transfer language in curated text", () => {
    const text = JSON.stringify([b.connections, b.opportunities]).toLowerCase();
    for (const bad of ["will work for cdd", "use the rett protocol", "treatment transfers", "equivalent to rett"]) expect(text.includes(bad), bad).toBe(false);
  });

  it("preprints are flagged", () => {
    const p = graph.getNode("paper:39867409")!;
    expect(p.type === "Paper" && p.publication_status).toBe("preprint");
  });

  it("OpenAI extractor evidence, when present, carries model + run metadata", () => {
    for (const { ev } of allItems.filter(({ ev }) => ev.method === "openai_extractor")) {
      expect(ev.extraction?.model, ev.id).toBeTruthy();
      expect(ev.extraction?.run_id, ev.id).toBeTruthy();
    }
  });

  it("OpenAI Evidence Extractor contributed, and extractor-only edges are labelled as such", () => {
    expect(b.build_info?.openai_runs.length).toBeGreaterThan(0);
    expect(allItems.some(({ ev }) => ev.method === "openai_extractor")).toBe(true);
    for (const e of b.edges.filter((e) => e.id.startsWith("edge:ai:"))) {
      expect(e.evidence_type, e.id).toBe("llm_extraction");
      expect(e.evidence.every((ev) => ev.method === "openai_extractor"), e.id).toBe(true);
      expect(["moderate", "low"]).toContain(e.confidence);
    }
  });

  it("extractor-only edges never feed reuse cards or actions", () => {
    const cited = new Set([...b.opportunities.flatMap((o) => [...o.evidence_edge_ids, ...o.next_actions.flatMap((a) => a.evidence_edge_ids)]), ...b.connections.flatMap((c) => c.evidence_edge_ids)]);
    for (const id of cited) expect(id.startsWith("edge:ai:"), id).toBe(false);
  });

  it("CDKL5 search lands on the CDD page; unknown terms return no supported route", async () => {
    const r = await search.search("CDKL5");
    expect(r.found && r.disease.node_id).toBe("disease:cdd");
    expect((await search.search("ketogenic diet")).found).toBe(false);
  });
});
