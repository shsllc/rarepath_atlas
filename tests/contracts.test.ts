import { describe, expect, it } from "vitest";
import { combineStatuses, deriveEvidenceStatus, type EvidenceEdge } from "@/lib/schemas";
import { DEFAULT_FIXTURE, JsonGraphService } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";

const graph = JsonGraphService.fromFile(DEFAULT_FIXTURE); // throws if the bundle violates the Zod schema
const bundle = graph.bundle();
const finder = new CuratedReusableAssetFinder(graph);
const search = new GraphSearchService(graph, finder);

describe("fixture bundle integrity", () => {
  it("is flagged as a fixture with a warning", () => {
    expect(bundle.is_fixture).toBe(true);
    expect(bundle.fixture_warning).toBeTruthy();
  });

  it("every edge references existing nodes", () => {
    for (const e of bundle.edges) {
      expect(graph.getNode(e.subject_id), e.id).toBeDefined();
      expect(graph.getNode(e.object_id), e.id).toBeDefined();
    }
  });

  it("every curated item cites existing edges", () => {
    const ids = [
      ...bundle.connections.flatMap((c) => c.evidence_edge_ids),
      ...bundle.opportunities.flatMap((o) => [...o.evidence_edge_ids, ...o.next_actions.flatMap((a) => a.evidence_edge_ids)]),
      ...bundle.gaps.flatMap((g) => g.related_edge_ids),
    ];
    for (const id of ids) expect(graph.getEdge(id), id).toBeDefined();
  });

  it("fixture evidence is visibly labelled and never claims to be retrieved", () => {
    for (const e of bundle.edges) {
      expect(["demo_fixture", "model_inference"]).toContain(e.source_type);
      expect(e.quoted_or_structured_evidence.startsWith("[FIXTURE")).toBe(true);
    }
  });

  it("no fabricated literature or trial identifiers", () => {
    for (const n of bundle.nodes) for (const x of n.external_ids) if (["PMID", "NCT"].includes(x.system)) expect(x.id).toBe("pending");
  });
});

describe("evidence status rules", () => {
  const base = { inferred: false, contradiction_status: "none", confidence: "high", source_type: "literature", evidence_type: "direct_statement" } as const;

  it("an inferred edge can never be 'supported'", () => {
    expect(deriveEvidenceStatus({ ...base, inferred: true })).toBe("inferred");
    expect(deriveEvidenceStatus({ ...base, source_type: "model_inference" })).toBe("inferred");
    expect(deriveEvidenceStatus({ ...base, evidence_type: "llm_inference" })).toBe("inferred");
  });

  it("contradiction outranks everything", () => {
    expect(deriveEvidenceStatus({ ...base, inferred: true, contradiction_status: "contested" })).toBe("contradictory");
  });

  it("insufficient confidence is unknown", () => {
    expect(deriveEvidenceStatus({ ...base, confidence: "insufficient" })).toBe("unknown");
  });

  it("combined status is the most cautious", () => {
    expect(combineStatuses(["supported", "inferred"])).toBe("inferred");
    expect(combineStatuses(["supported", "contradictory", "inferred"])).toBe("contradictory");
    expect(combineStatuses([])).toBe("unknown");
  });

  it("fixture contains all four statuses so the UI treatment is exercised", () => {
    const seen = new Set(bundle.edges.map((e: EvidenceEdge) => deriveEvidenceStatus(e)));
    expect([...seen].sort()).toEqual(["contradictory", "inferred", "supported", "unknown"]);
  });
});

describe("search journey", () => {
  it.each(["CDKL5 deficiency disorder", "cdd", "CDKL5", "DEE2"])("resolves %s to the CDD page", async (q) => {
    const r = await search.search(q);
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.disease.node_id).toBe("disease:cdd");
      expect(r.opportunities.length).toBeGreaterThan(0);
    }
  });

  it("reuse opportunities are never shown as supported", async () => {
    const r = await search.search("CDD");
    if (!r.found) throw new Error("expected result");
    for (const o of r.opportunities) expect(o.status).not.toBe("supported");
  });

  it("unknown query returns an honest not-found", async () => {
    const r = await search.search("totally made up syndrome");
    expect(r.found).toBe(false);
  });

  it("symptom query explains instead of guessing a disease", async () => {
    const r = await search.search("seizure");
    expect(r.found).toBe(false);
    if (!r.found && !("partial" in r)) expect(r.suggestions).toContain("Rett syndrome");
  });
});
