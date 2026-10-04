import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService, toCandidateEdge, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { reconcile } from "@/lib/research/reconcile";
import type { ResearchRecord } from "@/lib/research/types";
import { rankResearchConnections } from "@/lib/analytics";
import { diseaseCoverage } from "@/lib/coverage";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import { researchRouter, type Failures } from "./fixtures/research-http";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
afterEach(() => {
  setResearchFetch(null);
  clearClinGenCache();
});
async function preview(fail: Failures = {}): Promise<DiscoveryPreview> {
  setResearchFetch(researchRouter(fail));
  const o = await new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }).preview("Dravet syndrome");
  if (o.kind !== "preview") throw new Error(`expected preview, got ${o.kind}`);
  return o.preview;
}

describe("MONDO / ORPHA reconciliation", () => {
  it("ties ORPHA to MONDO only through a shared exact, validated identifier and merges into one disease", async () => {
    const p = await preview();
    const diseases = p.records.filter((r) => r.kind === "disease" && (r.ids.mondo === "MONDO:0100135" || r.ids.orphanet === "Orphanet:33069"));
    expect(diseases).toHaveLength(1);
    expect(diseases[0].ids).toMatchObject({ mondo: "MONDO:0100135", orphanet: "Orphanet:33069", omim: "OMIM:607208" });
    expect(new Set(diseases[0].provenance.map((x) => x.provider))).toEqual(expect.objectContaining(new Set(["opentargets", "monarch", "orphadata"])));
    expect(p.rare.mapping_basis).toBe("shared identifier GARD:10430 (Orphanet exact, validated mapping)");
    expect(p.rare.mappings.map((m) => m.id)).toEqual(expect.arrayContaining(["MONDO:0100135", "Orphanet:33069", "GARD:10430"]));
  });

  it("a name-only Orphanet match is kept separate, never merged on the label", async () => {
    // Without Monarch, no GARD/OMIM cross-reference is available to verify the Orphanet record.
    const p = await preview({ monarch: "down" });
    const orpha = p.records.find((r) => r.kind === "disease" && r.ids.orphanet === "Orphanet:33069");
    expect(orpha?.key).toBe("disease:orpha:33069");
    expect(orpha && orpha.kind === "disease" && orpha.mapping_basis).toMatch(/name match only/);
    expect(p.records.find((r) => r.key === "disease:MONDO_0100135")!.ids.orphanet).toBeUndefined();
  });

  it("labels alone never merge diseases or genes", () => {
    const at = "t";
    const d = (key: string, ids: ResearchRecord["ids"]): ResearchRecord => ({ kind: "disease", key, label: "Dravet syndrome", ids, synonyms: [], provenance: [{ provider: "orphadata", source_id: key, url: "https://x.org", retrieved_at: at, native_type: "d" }], review_status: "machine_assembled" });
    expect(reconcile([d("disease:a", { mondo: "MONDO:1" }), d("disease:b", { orphanet: "Orphanet:2" })], []).records).toHaveLength(2);
    expect(reconcile([d("disease:a", { mondo: "MONDO:1" }), d("disease:b", { mondo: "MONDO:1", orphanet: "Orphanet:2" })], []).records).toHaveLength(1);
    const gene = (key: string, ids: ResearchRecord["ids"]): ResearchRecord => ({ kind: "gene", key, label: "SCN1A", ids, provenance: [{ provider: "orphadata", source_id: key, url: "https://x.org", retrieved_at: at, native_type: "g" }], review_status: "machine_assembled" });
    // Ensembl and HGNC both identify the gene; a bare label match does not.
    expect(reconcile([gene("gene:ensembl:ENSG00000144285", { ensembl: "ENSG00000144285" }), gene("gene:hgnc:HGNC:10585", { hgnc: "HGNC:10585", ensembl: "ENSG00000144285" })], []).records).toHaveLength(1);
  });
});

describe("phenotypes keep their qualifiers", () => {
  it("HPO frequency and onset are preserved verbatim, with sources", async () => {
    const p = await preview();
    const myo = p.phenotypes.annotated.find((x) => x.hpo === "HP:0032794")!;
    expect(myo).toMatchObject({ frequency: "Frequent (79–30%)", onset: "Childhood onset", references: "PMID:17347258" });
    const seizure = p.phenotypes.annotated.find((x) => x.hpo === "HP:0001250")!;
    expect(seizure.frequency).toBe("Obligate (100%)");
    expect(seizure.diagnostic_criteria).toBe("Diagnostic criterion");
    const regression = p.phenotypes.annotated.find((x) => x.hpo === "HP:0002376")!;
    expect(regression.sources).toEqual(expect.arrayContaining(["Orphadata", "HPO"]));
  });

  it("NOT / excluded annotations are preserved separately and never counted as present", async () => {
    const p = await preview();
    expect(p.phenotypes.excluded.map((x) => x.hpo)).toEqual(["HP:0000256"]);
    expect(p.phenotypes.annotated.map((x) => x.hpo)).not.toContain("HP:0000256");
    const l = p.links.find((x) => x.to === "phenotype:HP:0000256")!;
    expect(l.relation).toBe("phenotype_excluded");
    expect(l.statement).toMatch(/EXCLUDED \(absent\)/);
  });
});

describe("genetics stay source-native", () => {
  it("ClinGen validity is a distinct relation from a generic association", async () => {
    const p = await preview();
    expect(p.rare.validity).toEqual([expect.objectContaining({ gene: "SCN1A", classification: "Definitive", expert_panel: "Epilepsy Gene Curation Expert Panel", mode_of_inheritance: "AD" })]);
    const v = p.links.find((l) => l.relation === "clingen_validity")!;
    expect(v.statement).toMatch(/not a RarePath score/);
    // The generic Open Targets association for SCN1A is a different relation with its own source score.
    expect(p.links.some((l) => l.relation === "associated_with" && l.provenance[0].provider === "opentargets")).toBe(true);
    expect(v.source_score).toBeUndefined();
    // Only curations for this exact MONDO id are used (the GEFS+ curation is not).
    expect(p.links.filter((l) => l.relation === "clingen_validity")).toHaveLength(1);
    const ui = fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8");
    expect(ui).toMatch(/EXPERT-CURATED VALIDITY/);
    expect(ui).toMatch(/Gene mentions and associations \(Open Targets\): not validity classifications/);
  });

  it("Orphanet modifier genes are associations, not causal genes", async () => {
    const p = await preview();
    expect(p.rare.causal_genes.map((c) => c.gene)).toContain("SCN1A");
    expect(p.rare.causal_genes.map((c) => c.gene)).not.toContain("SCN9A");
    expect(p.rare.other_gene_associations.map((x) => x.gene)).toEqual(["SCN9A"]);
  });

  it("ClinVar review status and stars are preserved, with no personal-genomics interpretation", async () => {
    const p = await preview();
    const cv = p.rare.clinvar.find((x) => x.source === "ClinVar")!;
    // The same variant from ClinVar directly and via Open Targets is ONE variant entity, while each source
    // record's classification (VCV aggregate vs condition-specific RCV) stays its own statement.
    expect(p.records.filter((r) => r.kind === "variant" && r.ids.rsid === "rs796053029")).toHaveLength(1);
    expect(p.rare.clinvar.find((x) => x.source === "Open Targets")!.review_status).toBe("reviewed by expert panel");
    expect(cv).toMatchObject({ classification: "Pathogenic", review_status: "criteria provided, multiple submitters, no conflicts", stars: 2 });
    const ep = p.rare.clinvar.find((x) => x.source === "ClinGen")!;
    expect(ep.review_status).toBe("reviewed by ClinGen expert panel");
    expect(p.rare.clinvar_total).toBe(1506);
    for (const l of p.links.filter((x) => x.relation === "variant_classified_for")) expect(l.statement).toMatch(/not a personal interpretation|Not a personal interpretation/);
    const text = JSON.stringify(p).replace(/biolink:\w+/g, "") + fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8");
    expect(text).not.toMatch(/\b(you have|your variant|you carry|your diagnosis|you are affected|your risk)\b/i);
  });

  it("model-organism evidence is labelled preclinical and never human clinical relevance", async () => {
    const p = await preview();
    expect(p.rare.models.map((m) => m.species)).toEqual(expect.arrayContaining(["Danio rerio", "Mus musculus"]));
    // The zebrafish genotype from Monarch and Alliance is one model with both provenances.
    const fish = p.records.filter((r) => r.kind === "model" && r.ids.model === "ZFIN:ZDB-FISH-161012-5");
    expect(fish).toHaveLength(1);
    expect(new Set(fish[0].provenance.map((x) => x.provider))).toEqual(new Set(["monarch", "alliance"]));
    for (const l of p.links.filter((x) => x.relation === "model_of")) expect(l.statement).toMatch(/does not establish human clinical relevance|Preclinical/);
    const ui = fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8");
    expect(ui).toMatch(/Models \(preclinical \/ model-organism discovery\)/);
    expect(ui).toMatch(/PRECLINICAL/);
  });

  it("Orphanet natural history and epidemiology are shown verbatim", async () => {
    const p = await preview();
    expect(p.rare.natural_history).toEqual({ onset: ["Infancy", "Neonatal"], inheritance: ["Autosomal dominant"] });
    expect(p.rare.epidemiology[0]).toMatchObject({ type: "Prevalence at birth", class: "1-9 / 100 000", geographic: "Europe" });
    expect(p.rare.licence_notes.join(" ")).toMatch(/CC BY 4\.0/);
  });
});

describe("review boundary and isolation", () => {
  it("one rare-disease source failing leaves the others intact", async () => {
    const p = await preview({ clingen: "http500", alliance: "timeout" });
    const run = Object.fromEntries(p.sources.map((s) => [s.id, s.status]));
    expect(run).toMatchObject({ clingen: "failed", alliance: "failed", orphadata: "ok", hpo: "ok", monarch: "ok", clinvar: "ok" });
    expect(p.rare.validity).toEqual([]);
    expect(p.phenotypes.annotated.length).toBeGreaterThan(0);
  });

  it("machine-assembled rare-disease edges are excluded from ranking and actions", async () => {
    const p = await preview();
    const edges = p.links.map(toCandidateEdge).filter((e): e is NonNullable<typeof e> => !!e);
    for (const l of p.links) expect(l).toMatchObject({ eligible_for_ranking: false, eligible_for_action: false, review_status: "machine_assembled" });
    for (const e of edges) expect(isReviewedEvidenceEdge(e)).toBe(false);
    // Forged: a "shared phenotype" edge for FOXG1 that would add +1 if trusted.
    const forged = { ...b.edges.find((e) => e.id === "edge:rett-regression")!, id: "edge:disc:pheno-forged", subject_id: "disease:foxg1", review_status: "machine_assembled" as const, eligible_for_ranking: false as const, eligible_for_action: false as const };
    expect(rankResearchConnections(b.nodes, [...b.edges, ...edges, forged], "disease:cdd")).toEqual(rankResearchConnections(b.nodes, b.edges, "disease:cdd"));
    expect(diseaseCoverage({ ...b, edges: [...b.edges, forged] }).map((d) => d.tier)).toEqual(diseaseCoverage(b).map((d) => d.tier));
  });

  it("CDD reviewed path unchanged", async () => {
    setResearchFetch(researchRouter());
    const r = await new GraphSearchService(g, new CuratedReusableAssetFinder(g), new MultiProviderDiscoveryService()).search("CDKL5");
    if (!r.found) throw new Error("expected full journey");
    expect(r.disease.node_id).toBe("disease:cdd");
    expect(r.action_brief).toBeDefined();
    expect(r.edges).toHaveLength(b.edges.length);
  });
});
