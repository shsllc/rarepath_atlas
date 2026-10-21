import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { link, type ResearchLink, type ResearchRecord } from "@/lib/research/types";
import { applyRules, curatedEdgeId, ruleFor } from "@/lib/curation/rules";
import { curatedOverlay, listCurated, promoteFromPreview, withdrawCurated } from "@/lib/curation/store";
import { clearReviewedGraphCache, reviewedGraph } from "@/lib/review/graph";
import { listAudit } from "@/lib/review/queue";
import { isMachineAssembledEdge, isReviewedEvidenceEdge } from "@/lib/graph-view";
import { rankResearchConnections } from "@/lib/analytics";
import type { EvidenceEdge, GraphNode } from "@/lib/schemas";
import { MemoryStore, setStore } from "@/lib/store";
import { researchRouter } from "./fixtures/research-http";

const base = JsonGraphService.fromFile(REAL_BUNDLE);
const b = base.bundle();
const NOW = new Date("2026-10-21T12:00:00Z");
const curator = { id: "cur", name: "Curator", curator: true };

beforeEach(() => {
  setStore(new MemoryStore());
  clearReviewedGraphCache();
});
afterEach(() => {
  setStore(null);
  setResearchFetch(null);
  clearClinGenCache();
});

async function dravet(): Promise<DiscoveryPreview> {
  setResearchFetch(researchRouter({}));
  const o = await new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }).preview("Dravet syndrome");
  if (o.kind !== "preview") throw new Error(o.kind);
  return o.preview;
}

describe("source-curation rules", () => {
  const D = "disease:MONDO_X";
  const prov = (provider: string) => [{ provider: provider as never, source_id: "s", url: "https://example.org/s", retrieved_at: NOW.toISOString(), native_type: "t" }];
  const mk = (relation: ResearchLink["relation"], provider: string, qualifiers: Record<string, string> = {}, from = "gene:x", to = D) => link({ from, to, relation, native_evidence_type: "t", statement: "s", qualifiers, provenance: prov(provider) });
  const study = (conditions: string[]): ResearchRecord => ({ kind: "study", key: "study:nct:NCT1", label: "A study", ids: { nct: "NCT1" }, conditions } as unknown as ResearchRecord);
  const ctx = (records: ResearchRecord[] = []) => ({ diseaseKey: D, names: new Set(["dravet syndrome", "smei"]), byKey: new Map(records.map((r) => [r.key, r])) });

  it("ClinGen: Definitive/Strong/Moderate promote; Limited and animal-only do not; Disputed/Refuted become counter-evidence", () => {
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Definitive" }), ctx())).toMatchObject({ rule: "clingen_validity", confidence: "high" });
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Moderate" }), ctx())).toMatchObject({ confidence: "moderate" });
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Limited" }), ctx())).toBeNull();
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Strong", animal_model_only: "yes" }), ctx())).toBeNull();
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Refuted" }), ctx())).toMatchObject({ rule: "clingen_disputed", contradicted: true });
  });

  it("Orphanet causal genes need 'Disease-causing' and status Assessed; Monarch (often OMIM-derived) never promotes", () => {
    expect(ruleFor(mk("causal_gene", "orphadata", { association_type: "Disease-causing germline mutation(s) in", status: "Assessed" }), ctx())).toMatchObject({ rule: "orphanet_causal_gene" });
    expect(ruleFor(mk("causal_gene", "orphadata", { association_type: "Disease-causing germline mutation(s) in", status: "Not yet assessed" }), ctx())).toBeNull();
    expect(ruleFor(mk("causal_gene", "monarch", { knowledge_source: "omim" }), ctx())).toBeNull();
  });

  it("trials promote only when ClinicalTrials.gov lists the exact name or a synonym; search-only registries do not", () => {
    const s = study(["Dravet Syndrome", "Epilepsy"]);
    expect(ruleFor(mk("studies_condition", "clinicaltrials", {}, s.key), ctx([s]))).toMatchObject({ rule: "trial_condition_exact" });
    const other = study(["Epileptic encephalopathy"]);
    expect(ruleFor(mk("studies_condition", "clinicaltrials", {}, other.key), ctx([other]))).toBeNull();
    expect(ruleFor(mk("studies_condition", "isrctn", {}, s.key), ctx([s]))).toBeNull();
  });

  it("phenotypes need a stated frequency from Orphanet or an Orphanet-sourced HPO annotation; OMIM-sourced and excluded never promote", () => {
    const ph = (provider: string, q: Record<string, string>) => mk("has_phenotype", provider, q, D, "phenotype:HP:1");
    expect(ruleFor(ph("orphadata", { frequency: "Very frequent (99-80%)" }), ctx())).toMatchObject({ rule: "curated_phenotype" });
    expect(ruleFor(ph("orphadata", { frequency: "frequency not stated" }), ctx())).toBeNull();
    expect(ruleFor(ph("hpo", { source: "ORPHA:33069", frequency: "Frequent" }), ctx())).toMatchObject({ rule: "curated_phenotype" });
    expect(ruleFor(ph("hpo", { source: "OMIM:607208", frequency: "Frequent" }), ctx())).toBeNull();
    expect(ruleFor(ph("opentargets", { frequency: "Frequent" }), ctx())).toBeNull();
  });

  it("only links touching the searched disease qualify", () => {
    expect(ruleFor(mk("clingen_validity", "clingen", { classification: "Definitive" }, "gene:x", "disease:OTHER"), ctx())).toBeNull();
  });

  it("applied to a real preview: promoted edges pass the evidence gate, carry their rule, and are not machine-assembled", async () => {
    const p = await dravet();
    const r = applyRules(p, b.nodes, { now: NOW });
    expect(r.counts.trial_condition_exact).toBeGreaterThan(0);
    expect(r.counts.clingen_validity).toBe(1);
    for (const e of r.edges) {
      expect(isReviewedEvidenceEdge(e), e.id).toBe(true);
      expect(isMachineAssembledEdge(e)).toBe(false);
      expect(e.curation).toMatchObject({ rule_version: expect.any(String), promoted_at: NOW.toISOString() });
      expect(e.id).toMatch(/^edge:sc:[a-f0-9]{24}$/);
    }
    // Machine-assembled links that no rule covers stay out.
    expect(r.edges.length).toBeLessThan(p.links.length);
  });

  it("never touches the hand-curated focus journey, and skips withdrawn edges", async () => {
    const p = await dravet();
    const r = applyRules(p, b.nodes, { now: NOW });
    const diseaseNode = r.edges[0] && [r.edges[0].subject_id, r.edges[0].object_id].find((id) => id.includes("disease"));
    expect(applyRules(p, b.nodes, { now: NOW, focusDiseaseId: diseaseNode }).edges).toHaveLength(0);
    const skip = new Set([r.edges[0].id]);
    expect(applyRules(p, b.nodes, { now: NOW, withdrawn: skip }).edges.map((e) => e.id)).not.toContain(r.edges[0].id);
  });

  it("a forged 'source_curated' edge without a rule record is refused by the gate", async () => {
    const p = await dravet();
    const e = applyRules(p, b.nodes, { now: NOW }).edges[0];
    expect(isReviewedEvidenceEdge({ ...e, curation: undefined })).toBe(false);
    expect(isReviewedEvidenceEdge({ ...e, id: "edge:x:1" })).toBe(false);
  });
});

describe("ranking caps", () => {
  const disease = (id: string): GraphNode => ({ id, type: "Disease", label: id, aliases: [], external_ids: [], verification: "verified", inheritance: [] }) as unknown as GraphNode;
  const thing = (id: string, type: string): GraphNode => ({ id, type, label: id, aliases: [], external_ids: [], verification: "verified" }) as unknown as GraphNode;
  const edge = (id: string, s: string, p: EvidenceEdge["predicate"], o: string): EvidenceEdge =>
    ({ id, subject_id: s, predicate: p, object_id: o, source: "x", source_url: "https://x.org", source_type: "trial_registry", evidence_type: "curated_annotation", quoted_or_structured_evidence: "q", confidence: "high", inferred: false, contradiction_status: "none", evidence: [], created_at: NOW.toISOString() }) as unknown as EvidenceEdge;

  it("shared studies score at most three times and shared features at most two points", () => {
    const nodes = [disease("A"), disease("B"), disease("C"), ...[1, 2, 3, 4, 5].map((i) => thing(`s${i}`, "Study")), ...[1, 2, 3, 4, 5, 6].map((i) => thing(`p${i}`, "Phenotype"))];
    const edges: EvidenceEdge[] = [];
    for (let i = 1; i <= 5; i++) edges.push(edge(`ea${i}`, "A", "studied_in", `s${i}`), edge(`eb${i}`, "B", "studied_in", `s${i}`));
    for (let i = 1; i <= 6; i++) edges.push(edge(`pa${i}`, "A", "has_phenotype", `p${i}`), edge(`pb${i}`, "B", "has_phenotype", `p${i}`), edge(`pc${i}`, "C", "has_phenotype", `p${i}`));
    const ranked = rankResearchConnections(nodes, edges, "A");
    const bScore = ranked.find((r) => r.disease_id === "B")!;
    expect(bScore.score).toBe(3 * 3 + 2);
    expect(bScore.factors.filter((f) => f.kind === "shared_study")).toHaveLength(3);
    expect(bScore.factors.find((f) => f.kind === "shared_study" && /2 more, not scored/.test(f.detail))).toBeTruthy();
    const cScore = ranked.find((r) => r.disease_id === "C")!;
    expect(cScore.score).toBe(2);
    expect(cScore.band).toBe("Limited");
  });
});

describe("promotion store and search", () => {
  it("promotes once, is idempotent, is logged, and enters the live graph", async () => {
    const p = await dravet();
    expect(await promoteFromPreview(p, b.nodes, b.focus_disease_id, NOW)).toBe(true);
    expect(await promoteFromPreview(p, b.nodes, b.focus_disease_id, NOW)).toBe(false);
    const audit = await listAudit();
    expect(audit.map((a) => a.action)).toEqual(["auto_promoted"]);
    expect(audit[0].actor.id).toBe("rules");
    const g = await reviewedGraph(base);
    const overlay = await curatedOverlay();
    expect(overlay.edges.length).toBeGreaterThan(0);
    for (const e of overlay.edges) expect(g.getEdge(e.id), e.id).toBeTruthy();
  });

  it("a withdrawn claim leaves the graph and is never re-promoted", async () => {
    const p = await dravet();
    await promoteFromPreview(p, b.nodes, b.focus_disease_id, NOW);
    const victim = (await curatedOverlay()).edges[0];
    await expect(withdrawCurated(victim.id, curator, "")).rejects.toThrow(/note/);
    await withdrawCurated(victim.id, curator, "Wrong condition match.", NOW);
    expect((await curatedOverlay()).edges.map((e) => e.id)).not.toContain(victim.id);
    await promoteFromPreview(p, b.nodes, b.focus_disease_id, NOW);
    expect((await curatedOverlay()).edges.map((e) => e.id)).not.toContain(victim.id);
    expect((await listCurated())[0].edges.map((e) => e.id)).not.toContain(victim.id);
    expect((await listAudit()).map((a) => a.action)).toContain("withdrawn");
    // Ids are stable per rule and link, which is what makes withdrawal permanent.
    const link0 = p.links.find((l) => curatedEdgeId(victim.curation!.rule as never, l.key) === victim.id);
    expect(link0).toBeTruthy();
  });

  it("the first search for an unreviewed disease returns a journey built from source-curated evidence", async () => {
    setResearchFetch(researchRouter({}));
    const discovery = new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") });
    const search = new GraphSearchService(base, new CuratedReusableAssetFinder(base), discovery, () => reviewedGraph(base), (p) => promoteFromPreview(p, b.nodes, b.focus_disease_id, NOW));
    const r = await search.search("Dravet syndrome");
    if (!("partial" in r)) throw new Error(`expected a journey, got ${Object.keys(r).join(",")}`);
    expect(r.journey.facts.some((f) => f.curation?.rule_title)).toBe(true);
    expect(r.preview?.disease.label).toBe("Dravet syndrome");
    for (const e of r.edges) expect(isReviewedEvidenceEdge(e), e.id).toBe(true);
  });
});
