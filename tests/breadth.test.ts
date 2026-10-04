import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { coverageCounts, diseaseCoverage, PARTIAL_BANNER } from "@/lib/coverage";
import { isUnreviewedAiEdge } from "@/lib/graph-view";
import type { SearchResponse } from "@/lib/schemas";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const search = new GraphSearchService(g, new CuratedReusableAssetFinder(g));
const cov = diseaseCoverage(b);
const byId = Object.fromEntries(cov.map((d) => [d.node_id, d]));
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const isPartial = (r: SearchResponse) => !r.found && "partial" in r;

describe("multi-disease coverage", () => {
  it("exposes every verified disease in the committed graph, and nothing else", () => {
    const verified = b.nodes.filter((n) => n.type === "Disease" && n.verification === "verified").map((n) => n.id);
    expect(cov.map((d) => d.node_id).sort()).toEqual(verified.sort());
    expect(cov.length).toBeGreaterThan(1);
  });

  it("CDD remains the only full verified journey, listed first", () => {
    expect(cov[0].node_id).toBe("disease:cdd");
    expect(cov.filter((d) => d.tier === "full").map((d) => d.node_id)).toEqual(["disease:cdd"]);
    expect(cov.filter((d) => d.has_action_brief).map((d) => d.node_id)).toEqual(["disease:cdd"]);
  });

  it("other diseases are labelled at their real, lower depth", () => {
    expect(byId["disease:rett"].tier).toBe("partial");
    expect(byId["disease:foxg1"].tier).toBe("shared_study");
    expect(byId["disease:mdd"].tier).toBe("shared_study");
  });

  it("only reviewed edges feed coverage", () => {
    for (const d of cov) {
      for (const id of d.reviewed_edge_ids) expect(isUnreviewedAiEdge(g.getEdge(id)!), id).toBe(false);
    }
  });

  it("tiers would not change if every OpenAI-only edge were removed", () => {
    const reviewedOnly = diseaseCoverage({ ...b, edges: b.edges.filter((e) => !isUnreviewedAiEdge(e)) });
    expect(reviewedOnly.map((d) => [d.node_id, d.tier])).toEqual(cov.map((d) => [d.node_id, d.tier]));
  });

  it("does not credit a gene that is not in the reviewed graph (MECP2 duplication has none)", () => {
    expect(byId["disease:mdd"].genes).toEqual([]);
    expect(byId["disease:foxg1"].genes.map((x) => x.label)).toEqual(["FOXG1"]);
  });

  it("coverage counts are derived from real graph data", () => {
    const c = coverageCounts(b);
    const n = (t: string) => b.nodes.filter((x) => x.type === t).length;
    expect(c).toMatchObject({
      diseases: n("Disease"),
      genes: n("Gene"),
      studies: n("Study"),
      research_assets: n("ResearchAsset"),
      investigators: n("Researcher"),
      patient_organizations: n("PatientOrganization"),
      sources: b.sources.length,
      reviewed_relationships: b.edges.filter((e) => !isUnreviewedAiEdge(e)).length,
    });
    // No hard-coded numbers in the UI: counts are rendered from coverageCounts().
    const ui = src("src/components/CoverageSections.tsx");
    expect(ui).toMatch(/counts\.diseases/);
  });
});

describe("search for non-CDD diseases", () => {
  it.each([
    ["Rett syndrome", "disease:rett"],
    ["RTT", "disease:rett"],
    ["MONDO:0100040", "disease:foxg1"],
    ["FOXG1", "disease:foxg1"],
    ["MECP2 duplication disorder", "disease:mdd"],
  ])("%s resolves to a partial view of %s", async (q, id) => {
    const r = await search.search(q);
    if (!isPartial(r) || !("partial" in r)) throw new Error(`expected partial result for ${q}`);
    expect(r.coverage.node_id).toBe(id);
    expect(r.banner).toBe(PARTIAL_BANNER);
  });

  it("never inherits the CDD action brief, ranking, opportunities or asset catalog", async () => {
    for (const q of ["Rett syndrome", "FOXG1 disorder", "MECP2 duplication syndrome"]) {
      const r = (await search.search(q)) as Record<string, unknown>;
      expect(r.found).toBe(false);
      for (const key of ["action_brief", "opportunities", "connections", "asset_catalog", "collaborators", "disease"]) expect(r, `${q}.${key}`).not.toHaveProperty(key);
    }
  });

  it("returns only reviewed edges, all referenced by the coverage", async () => {
    for (const q of ["Rett syndrome", "FOXG1 disorder", "MECP2 duplication syndrome"]) {
      const r = await search.search(q);
      if (!("partial" in r)) throw new Error("expected partial");
      expect(r.edges.length).toBeGreaterThan(0);
      for (const e of r.edges) expect(isUnreviewedAiEdge(e), e.id).toBe(false);
      expect(r.edges.map((e) => e.id).sort()).toEqual([...r.coverage.reviewed_edge_ids].sort());
    }
  });

  it("partial entries carry no numeric score", async () => {
    const r = await search.search("Rett syndrome");
    const keys = JSON.stringify(r).match(/"[a-z_]*(score|strength|rank)[a-z_]*":/gi) ?? [];
    expect(keys).toEqual([]);
    const ui = src("src/components/CoverageSections.tsx");
    expect(ui).not.toMatch(/rankResearchConnections|opportunityDetails|Research Connection Strength/);
  });

  it("CDD searches still return the full journey with its brief", async () => {
    for (const q of ["CDKL5", "CDD", "MONDO:0100039"]) {
      const r = await search.search(q);
      if (!r.found) throw new Error(q);
      expect(r.disease.node_id).toBe("disease:cdd");
      expect(r.action_brief).toBeDefined();
    }
  });

  it("the partial banner and labels appear in the UI", () => {
    const ui = src("src/components/CoverageSections.tsx");
    expect(ui).toMatch(/result\.banner/);
    expect(PARTIAL_BANNER).toBe("Partial evidence graph — a full Research Action Brief has not yet been reviewed for this disease.");
    expect(src("src/app/results/page.tsx")).toMatch(/PartialDiseaseView/);
  });
});
