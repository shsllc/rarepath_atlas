import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { OpenDataDiscoveryService, type DiscoveryOutcome, type DiscoveryPreview, type DiscoveryService } from "@/lib/discovery";
import { OpenTargetsClient, OPEN_TARGETS_API } from "@/lib/providers/opentargets";
import { GwasCatalogClient } from "@/lib/providers/gwas";
import { rankResearchConnections, opportunityDetails } from "@/lib/analytics";
import { diseaseCoverage } from "@/lib/coverage";
import { isMachineAssembledEdge, isReviewedEvidenceEdge } from "@/lib/graph-view";
import { deriveEvidenceStatus, type EvidenceEdge, type SearchResponse } from "@/lib/schemas";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const finder = new CuratedReusableAssetFinder(g);

// ---- Recorded-shape fixtures (structure of Open Targets v26.9 and GWAS Catalog v2 responses) ----
const OT_SEARCH = { data: { search: { total: 2, hits: [{ id: "MONDO_0100135", name: "Dravet syndrome", description: "x" }, { id: "MONDO_0018214", name: "generalized epilepsy with febrile seizures plus", description: null }] } } };
const OT_DISEASE = {
  data: {
    meta: { apiVersion: { x: "26", y: "9", z: "0" }, dataVersion: { year: "26", month: "09" } },
    disease: {
      id: "MONDO_0100135",
      name: "Dravet syndrome",
      description: "A channelopathy with epilepsy.",
      dbXRefs: ["OMIM:607208", "GARD:0010430", "UMLS:C0751122", "ICD9:345.10"],
      synonyms: [{ relation: "hasExactSynonym", terms: ["Dravet", "severe myoclonic epilepsy of infancy"] }],
      therapeuticAreas: [{ id: "MONDO_0005071", name: "nervous system disorder" }],
      parents: [{ id: "MONDO_0100062", name: "genetic developmental and epileptic encephalopathy" }],
      children: [],
      associatedTargets: {
        count: 1182,
        rows: [
          { score: 0.88, target: { id: "ENSG00000144285", approvedSymbol: "SCN1A", approvedName: "sodium voltage-gated channel alpha subunit 1" }, datatypeScores: [{ id: "genetic_association", score: 0.96 }, { id: "literature", score: 0.97 }] },
          { score: 0.58, target: { id: "ENSG00000147955", approvedSymbol: "SIGMAR1", approvedName: "sigma non-opioid intracellular receptor 1" }, datatypeScores: [{ id: "clinical", score: 0.93 }] },
        ],
      },
      phenotypes: { count: 0, rows: [] },
      drugAndClinicalCandidates: { count: 2, rows: [{ maxClinicalStage: "PHASE_3", drug: { id: "CHEMBL5095386", name: "ZOREVUNERSEN", drugType: "Oligonucleotide" } }, { maxClinicalStage: "APPROVAL", drug: { id: "CHEMBL1983350", name: "STIRIPENTOL", drugType: "Small molecule" } }] },
    },
  },
};
const OT_VARIANTS = {
  data: { disease: { evidences: { count: 1340, rows: [{ datasourceId: "eva", target: { id: "ENSG00000144285", approvedSymbol: "SCN1A" }, variant: { id: "2_165992359_C_G", rsIds: ["rs796053029"] }, variantRsId: "rs796053029", clinicalSignificances: ["pathogenic"], studyId: "RCV004577517", confidence: "reviewed by expert panel" }] } } },
};
const GWAS = { _embedded: { associations: [{ association_id: 111, p_value: 0, pvalue_mantissa: 2, pvalue_exponent: -9, accession_id: "GCST000001", pubmed_id: "123", first_author: "A", mapped_genes: ["SCN1A"], reported_trait: ["epilepsy"], snp_allele: [{ rs_id: "rs6732655" }] }] }, page: { totalElements: 1 } };

type Mode = { ot?: "ok" | "down" | "http500"; gwas?: "ok" | "down" };
function fakeFetch(mode: Mode = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === OPEN_TARGETS_API) {
      if (mode.ot === "down") throw new DOMException("timed out", "TimeoutError");
      if (mode.ot === "http500") return new Response("err", { status: 500 });
      const q = String(JSON.parse(String(init?.body)).query);
      const body = q.includes("search(") ? OT_SEARCH : q.includes("evidences(") ? OT_VARIANTS : OT_DISEASE;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.startsWith("https://www.ebi.ac.uk/gwas/rest/api/v2/")) {
      if (mode.gwas === "down") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(GWAS), { status: 200 });
    }
    throw new Error(`unexpected URL ${url}`);
  });
}
const discoveryWith = (mode: Mode = {}) => {
  const f = fakeFetch(mode);
  return { f, svc: new OpenDataDiscoveryService(new OpenTargetsClient(f), new GwasCatalogClient(f), () => new Date("2026-10-04T12:00:00Z")) };
};
const previewOf = async (r: SearchResponse): Promise<DiscoveryPreview> => {
  if (!("discovery" in r)) throw new Error("expected a discovery preview");
  return r.preview;
};

describe("search order: reviewed graph first, discovery second", () => {
  it.each(["CDKL5", "CDD", "MONDO:0100039", "Rett syndrome", "FOXG1"])("reviewed match for %s never consults the discovery layer", async (q) => {
    const spy: DiscoveryService = { preview: vi.fn(async (): Promise<DiscoveryOutcome> => ({ kind: "no_match" })) };
    const r = await new GraphSearchService(g, finder, spy).search(q);
    expect("discovery" in r).toBe(false);
    expect(spy.preview).not.toHaveBeenCalled();
  });

  it("CDD still returns the full reviewed journey with its brief when discovery is enabled", async () => {
    const r = await new GraphSearchService(g, finder, discoveryWith().svc).search("CDKL5");
    if (!r.found) throw new Error("expected full journey");
    expect(r.disease.node_id).toBe("disease:cdd");
    expect(r.action_brief).toBeDefined();
  });

  it("if the API resolves to a disease the reviewed graph holds, the reviewed view wins", async () => {
    const twin: DiscoveryService = { preview: async () => ({ kind: "preview", preview: { disease: { id: "MONDO:0010726" } } as unknown as DiscoveryPreview }) };
    const r = await new GraphSearchService(g, finder, twin).search("classic rett");
    expect("partial" in r && r.coverage.node_id).toBe("disease:rett");
  });

  it("a disease outside the reviewed slice gets a discovery preview, not a dead end", async () => {
    const p = await previewOf(await new GraphSearchService(g, finder, discoveryWith().svc).search("Dravet syndrome"));
    expect(p.disease.label).toBe("Dravet syndrome");
    expect(p.match.exact).toBe(true);
    expect(p.targets.map((t) => t.symbol)).toEqual(["SCN1A", "SIGMAR1"]);
    expect(p.variants[0].rs_id).toBe("rs796053029");
    expect(p.gwas[0].rs_id).toBe("rs6732655");
    expect(p.drugs.map((d) => d.stage)).toEqual(["Approved (per source)", "Phase 3"]);
    expect(p.counts).toMatchObject({ genes: 1182, variants: 1340, gwas_associations: 1, drug_candidates: 2, related_diseases: 1 });
  });
});

describe("machine-assembled tier", () => {
  it("every Open Targets / GWAS relationship is machine-assembled and ineligible", async () => {
    const { svc } = discoveryWith();
    const o = await svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    const p = o.preview;
    expect(p).toMatchObject({ tier: "machine_assembled", eligible_for_ranking: false, eligible_for_action: false });
    expect(p.edges.length).toBeGreaterThan(0);
    for (const e of p.edges) {
      expect(e.review_status, e.id).toBe("machine_assembled");
      expect(e.eligible_for_ranking).toBe(false);
      expect(e.eligible_for_action).toBe(false);
      expect(e.source_type).toBe("research_platform");
      expect(isMachineAssembledEdge(e)).toBe(true);
      expect(isReviewedEvidenceEdge(e)).toBe(false);
      expect(deriveEvidenceStatus(e), e.id).not.toBe("supported");
    }
    expect(p.edges.some((e) => e.source === "Open Targets Platform")).toBe(true);
    expect(p.edges.some((e) => e.source === "GWAS Catalog")).toBe(true);
  });

  it("source associations are never mapped to a causal predicate", async () => {
    const o = await discoveryWith().svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    expect(o.preview.edges.some((e) => e.predicate === "caused_by_variant_in")).toBe(false);
    expect(o.preview.targets.find((t) => t.symbol === "SIGMAR1")!.evidence_types).toContain("Drug-trial target (not a genetic cause)");
  });

  it("external source identifiers and provenance are retained", async () => {
    const o = await discoveryWith().svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    const p = o.preview;
    expect(p.disease.identifiers.map((x) => x.id)).toEqual(expect.arrayContaining(["MONDO:0100135", "OMIM:607208", "GARD:0010430"]));
    const scn1a = p.edges.find((e) => e.object_id === "disc:gene:ENSG00000144285")!;
    expect(scn1a.source_url).toBe("https://platform.opentargets.org/evidence/ENSG00000144285/MONDO_0100135");
    expect(scn1a.evidence[0]).toMatchObject({ method: "structured_api", retrieval_date: "2026-10-04", source: "Open Targets Platform" });
    expect(p.edges.find((e) => e.source === "ClinVar via Open Targets")!.source_url).toContain("RCV004577517");
    expect(p.edges.find((e) => e.source === "GWAS Catalog")!.source_url).toContain("GCST000001");
    expect(p.sources[0].version).toBe("API 26.9.0, data 26.09");
  });
});

describe("ranking and action isolation", () => {
  // A forged machine-assembled edge that WOULD add a shared-asset factor (+3) for FOXG1 if it were trusted.
  const forged: EvidenceEdge = {
    ...b.edges.find((e) => e.id === "edge:css-rett")!,
    id: "edge:disc:ot:forged",
    object_id: "disease:foxg1",
    confidence: "high",
    source_type: "research_platform",
    evidence_type: "machine_assembled",
    review_status: "machine_assembled",
    eligible_for_ranking: false,
    eligible_for_action: false,
  };

  it("discovery edges cannot enter Research Connection Strength", async () => {
    const o = await discoveryWith().svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    const base = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
    const mixed = rankResearchConnections([...b.nodes, ...o.preview.nodes], [...b.edges, ...o.preview.edges, forged], "disease:cdd");
    expect(mixed).toEqual(base);
    expect(mixed.find((r) => r.disease_id === "disease:foxg1")!.factors.some((f) => f.kind === "shared_asset")).toBe(false);
  });

  it("discovery edges cannot change reviewed coverage tiers or opportunity details", () => {
    const withForged = { ...b, edges: [...b.edges, forged] };
    expect(diseaseCoverage(withForged).map((d) => [d.node_id, d.tier])).toEqual(diseaseCoverage(b).map((d) => [d.node_id, d.tier]));
    const ranked = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
    expect(opportunityDetails(b.nodes, [...b.edges, forged], "disease:cdd", ranked)).toEqual(opportunityDetails(b.nodes, b.edges, "disease:cdd", ranked));
  });

  it("discovery results carry no action brief, ranking or reuse opportunities", async () => {
    const r = (await new GraphSearchService(g, finder, discoveryWith().svc).search("Dravet syndrome")) as unknown as Record<string, unknown>;
    for (const key of ["action_brief", "opportunities", "connections", "asset_catalog", "collaborators", "disease"]) expect(r).not.toHaveProperty(key);
    // Every action anchor in the reviewed brief is eligible; no discovery edge could satisfy that gate.
    const brief = b.action_brief!;
    const ids = [...brief.bring_sources.flatMap((s) => s.evidence_edge_ids), ...brief.existing_assets.flatMap((a) => a.evidence_edge_ids)];
    for (const id of ids) expect(isReviewedEvidenceEdge(g.getEdge(id)!), id).toBe(true);
    expect(isReviewedEvidenceEdge(forged)).toBe(false);
  });
});

describe("safety language and graceful failure", () => {
  it("no unsupported treatment, equivalence or pathogenicity language", async () => {
    const o = await discoveryWith().svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    const text = JSON.stringify(o.preview) + fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8") + fs.readFileSync(path.join(process.cwd(), "src/lib/discovery.ts"), "utf8");
    for (const re of [/\btreats\b/i, /\bcures?\b/i, /effective (for|in|against)/i, /recommended (for|treatment)/i, /will work/i, /\bsame disease\b/i, /\bequivalent to\b/i, /\bcauses\b/i]) expect(text, String(re)).not.toMatch(re);
  });

  it.each([["down"], ["http500"]] as const)("Open Targets %s → graceful not-found, reviewed search unaffected", async (ot) => {
    const search = new GraphSearchService(g, finder, discoveryWith({ ot }).svc);
    const r = await search.search("Dravet syndrome");
    expect(r.found).toBe(false);
    expect("message" in r && r.message).toMatch(/could not be reached right now/);
    const cdd = await search.search("CDKL5");
    expect(cdd.found).toBe(true);
  });

  it("GWAS Catalog outage degrades to a preview with a warning", async () => {
    const o = await discoveryWith({ gwas: "down" }).svc.preview("Dravet syndrome");
    if (o.kind !== "preview") throw new Error("expected preview");
    expect(o.preview.gwas).toEqual([]);
    expect(o.preview.sources.find((s) => s.name.startsWith("GWAS"))!.ok).toBe(false);
    expect(o.preview.warnings.join(" ")).toMatch(/GWAS Catalog could not be reached/);
  });

  it("failures are not cached, so the next search retries", async () => {
    let down = true;
    const f = vi.fn(async (url: string, init?: RequestInit) => (down ? Promise.reject(new TypeError("fetch failed")) : fakeFetch()(url, init)));
    const svc = new OpenDataDiscoveryService(new OpenTargetsClient(f), new GwasCatalogClient(f));
    expect((await svc.preview("Dravet syndrome")).kind).toBe("unavailable");
    down = false;
    expect((await svc.preview("Dravet syndrome")).kind).toBe("preview");
  });
});
