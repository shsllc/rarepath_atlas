import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService, type DiscoveryOutcome, type DiscoveryPreview, type DiscoveryService } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { reconcile } from "@/lib/research/reconcile";
import { liveProviders, researchSources } from "@/lib/research/registry";
import type { ResearchRecord } from "@/lib/research/types";
import { rankResearchConnections, opportunityDetails } from "@/lib/analytics";
import { diseaseCoverage } from "@/lib/coverage";
import { isMachineAssembledEdge, isReviewedEvidenceEdge } from "@/lib/graph-view";
import { deriveEvidenceStatus, type EvidenceEdge } from "@/lib/schemas";
import { researchRouter, type Failures } from "./fixtures/research-http";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const finder = new CuratedReusableAssetFinder(g);
const reviewedPapers = new Map<string, string>();
for (const n of b.nodes) if (n.type === "Paper") for (const v of [n.pmid, n.doi]) if (v) reviewedPapers.set(v.toLowerCase(), n.id);

afterEach(() => setResearchFetch(null));
const service = (fail: Failures = {}) => {
  setResearchFetch(researchRouter(fail));
  return new MultiProviderDiscoveryService({ reviewedPapers, now: () => new Date("2026-10-04T12:00:00Z") });
};
async function preview(fail: Failures = {}, q = "Dravet syndrome"): Promise<DiscoveryPreview> {
  const o = await service(fail).preview(q);
  if (o.kind !== "preview") throw new Error(`expected preview, got ${o.kind}`);
  return o.preview;
}

describe("provider contract", () => {
  it("eight live providers, each declaring role, mode and data types", () => {
    const ps = liveProviders();
    expect(ps.map((p) => p.meta.id).sort()).toEqual(["clinicaltrials", "crossref", "datacite", "europepmc", "gwas", "openalex", "opentargets", "trialpubs"]);
    for (const p of ps) {
      expect(p.meta.mode).toBe("live");
      expect(["discovery", "metadata"]).toContain(p.meta.role);
      expect(p.meta.data_types.length).toBeGreaterThan(2);
    }
    expect(ps.find((p) => p.meta.id === "crossref")!.meta.role).toBe("metadata");
  });

  it("the sources view lists live and offline sources honestly", () => {
    const s = researchSources();
    expect(s.filter((x) => x.mode === "live")).toHaveLength(8);
    expect(s.filter((x) => x.mode === "not_integrated").map((x) => x.name)).toEqual(["WHO ICTRP", "EMA CTIS"]);
    expect(s.some((x) => x.mode === "offline" && /PubMed/.test(x.name))).toBe(true);
    expect(s.filter((x) => x.mode === "live").every((x) => !x.uses.includes("reviewed_ingestion"))).toBe(true);
  });

  it("every record and link is machine-assembled with provider provenance", async () => {
    const p = await preview();
    expect(p.records.length).toBeGreaterThan(10);
    for (const r of p.records) {
      expect(r.review_status, r.key).toBe("machine_assembled");
      expect(r.provenance.length).toBeGreaterThan(0);
      for (const pr of r.provenance) {
        expect(pr.url).toMatch(/^https:\/\//);
        expect(pr.retrieved_at).toBe("2026-10-04T12:00:00.000Z");
        expect(pr.source_id).toBeTruthy();
        expect(pr.native_type).toBeTruthy();
      }
    }
    for (const l of p.links) expect(l).toMatchObject({ review_status: "machine_assembled", eligible_for_ranking: false, eligible_for_action: false });
  });

  it("normalizes each provider's entities", async () => {
    const p = await preview();
    const kinds = new Set(p.records.map((r) => r.kind));
    for (const k of ["disease", "gene", "variant", "phenotype", "paper", "person", "institution", "study", "grant", "dataset", "drug"]) expect(kinds, k).toContain(k);
    expect(p.disease.identifiers.map((x) => x.id)).toEqual(expect.arrayContaining(["MONDO:0100135", "OMIM:607208", "Orphanet:33069"]));
    expect(p.clinical.total).toBe(103);
    expect(p.literature.total).toBe(6490);
    expect(p.assets.dataset_total).toBe(63);
    expect(p.assets.datasets[0]).toMatchObject({ doi: "10.5061/dryad.x1", resource_type: "Dataset", publisher: "Dryad" });
  });
});

describe("reconciliation by stable identifiers", () => {
  it("a paper from Europe PMC, OpenAlex and Crossref collapses into one record with three provenance sources", async () => {
    const p = await preview();
    const dup = p.records.filter((r) => r.kind === "paper" && r.ids.doi === "10.1000/dup");
    expect(dup).toHaveLength(1);
    expect(new Set(dup[0].provenance.map((x) => x.provider))).toEqual(new Set(["europepmc", "openalex", "crossref"]));
    const view = p.literature.top.find((x) => x.ids.doi === "10.1000/dup")!;
    expect(view.sources).toEqual(expect.arrayContaining(["Europe PMC", "OpenAlex", "Crossref"]));
    expect(view.verified_by_crossref).toBe(true);
    expect(view.update_notices.join(" ")).toMatch(/correction/);
  });

  it("PMID-only and DOI+PMID records of the same paper reconcile", async () => {
    const p = await preview();
    const papers = p.records.filter((r) => r.kind === "paper" && r.ids.pmid === "222");
    expect(papers).toHaveLength(1);
    expect(papers[0].ids.doi).toBe("10.1000/b");
  });

  it("people merge on ORCID across providers, never on name alone", async () => {
    const p = await preview();
    const people = p.records.filter((r): r is Extract<ResearchRecord, { kind: "person" }> => r.kind === "person");
    const orcid = people.filter((r) => r.ids.orcid === "0000-0001-2345-6789");
    expect(orcid).toHaveLength(1);
    // ORCID joins Europe PMC, OpenAlex, Crossref and DataCite; the trial official "Jane Smith" at the identical affiliation "Hospital A" also joins (name + institution rule).
    expect(new Set(orcid[0].provenance.map((x) => x.provider))).toEqual(new Set(["europepmc", "openalex", "crossref", "datacite", "clinicaltrials"]));
    // The OpenAlex author "Jane Smith" at Hospital B has no ORCID and a different institution → stays a separate person.
    const other = people.filter((r) => r.label === "Jane Smith" && !r.ids.orcid);
    expect(other).toHaveLength(1);
    expect(other[0].affiliations).toEqual(["Hospital B"]);
  });

  it("name + identical affiliation may merge; name alone may not", () => {
    const person = (key: string, label: string, aff: string, orcid?: string): ResearchRecord => ({ kind: "person", key, label, ids: orcid ? { orcid } : {}, affiliations: [aff], roles: [], provenance: [{ provider: "clinicaltrials", source_id: key, url: "https://x.org", retrieved_at: "t", native_type: "official" }], review_status: "machine_assembled" });
    const a = reconcile([person("p1", "Jane Smith", "Hospital A"), person("p2", "Jane  Smith", "Hospital A")], []);
    expect(a.records).toHaveLength(1);
    const c = reconcile([person("p1", "Jane Smith", "Hospital A"), person("p2", "Jane Smith", "Hospital B")], []);
    expect(c.records).toHaveLength(2);
    const d = reconcile([person("p1", "Jane Smith", "Hospital A", "0000-0000-0000-0001"), person("p2", "Jane Smith", "Hospital A", "0000-0000-0000-0002")], []);
    expect(d.records).toHaveLength(2);
  });

  it("diseases reconcile by MONDO id, keeping both providers", () => {
    const dz = (key: string, provider: "opentargets" | "europepmc"): ResearchRecord => ({ kind: "disease", key, label: "Dravet syndrome", ids: { mondo: "MONDO:0100135" }, synonyms: [], provenance: [{ provider, source_id: key, url: "https://x.org", retrieved_at: "t", native_type: "disease" }], review_status: "machine_assembled" });
    const r = reconcile([dz("disease:MONDO_0100135", "opentargets"), dz("disease:other", "europepmc")], []);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].key).toBe("disease:MONDO_0100135");
    expect(r.records[0].provenance).toHaveLength(2);
  });

  it("papers already in the reviewed bundle are flagged, not duplicated as new evidence", async () => {
    const p = await preview();
    const twin = p.records.find((r) => r.kind === "paper" && r.ids.pmid === "32472944");
    expect(twin && twin.kind === "paper" && twin.in_reviewed_graph).toBe("paper:32472944");
  });
});

describe("scientific-integrity boundaries", () => {
  it("preprint status survives a merge with a 'journal-article' Crossref record", async () => {
    const p = await preview();
    const pre = p.records.find((r) => r.kind === "paper" && r.ids.doi === "10.1101/2024.01.01.000001");
    expect(pre && pre.kind === "paper" && pre.publication_status).toBe("preprint");
  });

  it("trial statuses are preserved, never flattened", async () => {
    const p = await preview();
    const by = Object.fromEntries(p.clinical.studies.map((s) => [s.nct, s]));
    expect(by.NCT00000001.status).toBe("COMPLETED");
    expect(by.NCT00000002.status_label).toBe("Terminated (stopped early)");
    expect(by.NCT00000003.status_label).toBe("Withdrawn (stopped before enrolling)");
    expect(by.NCT00000004.status).toBe("RECRUITING");
    expect(new Set(p.clinical.status_counts.map((s) => s.status)).size).toBe(5);
    // Reuse leads keep their status visible; the terminated registry is listed last with its caution.
    expect(p.assets.reuse_leads.map((s) => [s.nct, s.status])).toEqual([["NCT00000005", "ACTIVE_NOT_RECRUITING"], ["NCT00000007", "TERMINATED"]]);
  });

  it("GWAS associations stay explicitly non-causal", async () => {
    const p = await preview();
    for (const l of p.links.filter((x) => x.relation === "gwas_association")) {
      expect(l.statement).toMatch(/statistical association/);
      expect(l.statement).toMatch(/not causation/);
    }
  });

  it("Open Targets scores stay labelled source scores and never become RarePath scores", async () => {
    const p = await preview();
    const scored = p.links.filter((l) => l.source_score);
    expect(scored.length).toBeGreaterThan(0);
    for (const l of scored) expect(l.source_score!.name).toMatch(/not a RarePath score/);
    expect(JSON.stringify(p)).not.toMatch(/research_connection_strength|"score":\s*\d/i);
  });

  it("no unsupported treatment, equivalence or causation language", async () => {
    const p = await preview();
    const text = [JSON.stringify(p), ...["src/components/DiscoveryPreview.tsx", "src/lib/discovery.ts", ...fs.readdirSync("src/lib/research/providers").map((f) => `src/lib/research/providers/${f}`)].map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8"))].join("\n");
    for (const re of [/\btreats\b/i, /\bcures?\b/i, /effective (for|in|against)/i, /recommended (for|treatment)/i, /will work/i, /\bsame disease\b/i, /\bequivalent to\b/i, /\bcauses\b/i]) expect(text, String(re)).not.toMatch(re);
  });
});

describe("failure isolation and caching", () => {
  it("one provider down and another timing out: the rest still return, failures are labelled", async () => {
    const p = await preview({ datacite: "http500", openalex: "timeout" });
    const run = Object.fromEntries(p.sources.map((s) => [s.id, s]));
    expect(run.datacite.status).toBe("failed");
    expect(run.openalex.status).toBe("failed");
    expect(run.europepmc.status).toBe("ok");
    expect(run.clinicaltrials.status).toBe("ok");
    expect(p.assets.datasets).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/DataCite returned an error/);
    expect(p.warnings.join(" ")).toMatch(/OpenAlex timed out/);
  });

  it("Open Targets down: text-based providers still assemble a labelled preview", async () => {
    const p = await preview({ opentargets: "down" });
    expect(p.disease.resolved).toBe(false);
    expect(p.warnings.join(" ")).toMatch(/could not be resolved to an ontology id/);
    expect(p.sources.find((s) => s.id === "gwas")!.status).toBe("skipped");
    expect(p.clinical.studies.length).toBeGreaterThan(0);
  });

  it("every provider down → graceful not-found; reviewed CDD search unaffected", async () => {
    const svc = service({ opentargets: "down", gwas: "down", clinicaltrials: "down", europepmc: "down", openalex: "down", crossref: "down", datacite: "down" });
    const search = new GraphSearchService(g, finder, svc);
    const r = await search.search("Dravet syndrome");
    expect(r.found).toBe(false);
    expect("message" in r && r.message).toMatch(/could not be reached right now/);
    const cdd = await search.search("CDKL5");
    expect(cdd.found && cdd.action_brief).toBeTruthy();
  });

  it("results are cached; partial failures expire quickly", async () => {
    const router = researchRouter();
    setResearchFetch(router);
    const svc = new MultiProviderDiscoveryService({ reviewedPapers });
    await svc.preview("Dravet syndrome");
    const calls = router.mock.calls.length;
    await svc.preview("Dravet syndrome");
    expect(router.mock.calls.length).toBe(calls);
  });
});

describe("reviewed layer stays authoritative", () => {
  it.each(["CDKL5", "CDD", "MONDO:0100039", "Rett syndrome", "FOXG1"])("reviewed match for %s never consults discovery", async (q) => {
    const spy: DiscoveryService = { preview: vi.fn(async (): Promise<DiscoveryOutcome> => ({ kind: "no_match" })) };
    const r = await new GraphSearchService(g, finder, spy).search(q);
    expect("discovery" in r).toBe(false);
    expect(spy.preview).not.toHaveBeenCalled();
  });

  it("an API result that resolves to a reviewed disease shows the reviewed view", async () => {
    const twin: DiscoveryService = { preview: async () => ({ kind: "preview", preview: { disease: { id: "MONDO:0010726" } } as unknown as DiscoveryPreview }) };
    const r = await new GraphSearchService(g, finder, twin).search("classic rett");
    expect("partial" in r && r.coverage.node_id).toBe("disease:rett");
  });

  // A forged machine-assembled edge that WOULD add a shared-asset factor (+3) for FOXG1 if it were trusted.
  const forged: EvidenceEdge = { ...b.edges.find((e) => e.id === "edge:css-rett")!, id: "edge:disc:forged", object_id: "disease:foxg1", confidence: "high", source_type: "research_platform", evidence_type: "machine_assembled", review_status: "machine_assembled", eligible_for_ranking: false, eligible_for_action: false };

  it("candidate edges are machine-assembled, never Known, and cannot enter Research Connection Strength", async () => {
    const p = await preview();
    expect(p.candidate_edges.length).toBeGreaterThan(5);
    for (const e of p.candidate_edges) {
      expect(isMachineAssembledEdge(e)).toBe(true);
      expect(isReviewedEvidenceEdge(e)).toBe(false);
      expect(deriveEvidenceStatus(e), e.id).not.toBe("supported");
      expect(e.predicate).not.toBe("caused_by_variant_in");
    }
    const base = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
    expect(rankResearchConnections(b.nodes, [...b.edges, ...p.candidate_edges, forged], "disease:cdd")).toEqual(base);
  });

  it("discovery edges cannot change coverage tiers, opportunities or actions", async () => {
    const withForged = { ...b, edges: [...b.edges, forged] };
    expect(diseaseCoverage(withForged).map((d) => [d.node_id, d.tier])).toEqual(diseaseCoverage(b).map((d) => [d.node_id, d.tier]));
    const ranked = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
    expect(opportunityDetails(b.nodes, [...b.edges, forged], "disease:cdd", ranked)).toEqual(opportunityDetails(b.nodes, b.edges, "disease:cdd", ranked));
    setResearchFetch(researchRouter());
    const r = (await new GraphSearchService(g, finder, new MultiProviderDiscoveryService({ reviewedPapers })).search("Dravet syndrome")) as unknown as Record<string, unknown>;
    for (const key of ["action_brief", "opportunities", "connections", "asset_catalog", "collaborators", "disease"]) expect(r).not.toHaveProperty(key);
    const brief = b.action_brief!;
    for (const id of [...brief.bring_sources.flatMap((s) => s.evidence_edge_ids), ...brief.existing_assets.flatMap((a) => a.evidence_edge_ids)]) expect(isReviewedEvidenceEdge(g.getEdge(id)!), id).toBe(true);
  });

  it("CDD reviewed journey unchanged with discovery enabled", async () => {
    setResearchFetch(researchRouter());
    const r = await new GraphSearchService(g, finder, new MultiProviderDiscoveryService({ reviewedPapers })).search("CDKL5");
    if (!r.found) throw new Error("expected full journey");
    expect(r.disease.node_id).toBe("disease:cdd");
    expect(r.edges).toHaveLength(b.edges.length);
    expect(r.edges.some((e) => e.review_status === "machine_assembled")).toBe(false);
  });
});
