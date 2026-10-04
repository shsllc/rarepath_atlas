import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { FACTOR_WEIGHTS, rankResearchConnections, researchHubs } from "@/lib/analytics";
import { isUnreviewedAiEdge } from "@/lib/graph-view";
import { BENCHMARK, ratio } from "@/lib/benchmark";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const search = new GraphSearchService(g, new CuratedReusableAssetFinder(g));
const ranked = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const reviewedEdge = (id: string) => {
  const e = g.getEdge(id);
  return !!e && !isUnreviewedAiEdge(e);
};

describe("graph analytics: research connection strength", () => {
  it("ranks Rett first, with FOXG1 and MECP2 duplication behind", () => {
    expect(ranked.map((r) => r.disease_id)).toEqual(["disease:rett", "disease:foxg1", "disease:mdd"]);
    expect(ranked[0].band).toBe("Strongest");
  });

  it("ignores analyst-unreviewed OpenAI-only edges", () => {
    const withoutAi = rankResearchConnections(b.nodes, b.edges.filter((e) => !isUnreviewedAiEdge(e)), "disease:cdd");
    expect(ranked).toEqual(withoutAi);
    // An AI-only edge says the RTT scale was applied to MECP2 duplication; it must not create a shared-asset factor.
    expect(b.edges.some((e) => isUnreviewedAiEdge(e) && e.subject_id === "asset:rtt-css" && e.object_id === "disease:mdd")).toBe(true);
    expect(ranked.find((r) => r.disease_id === "disease:mdd")!.factors.some((f) => f.kind === "shared_asset")).toBe(false);
  });

  it("exposes contributing evidence for every factor and lists counterweights", () => {
    for (const r of ranked) {
      expect(r.score).toBe(r.factors.reduce((n, f) => n + f.points, 0));
      for (const f of r.factors) {
        expect(f.evidence_edge_ids.length).toBeGreaterThan(0);
        for (const id of f.evidence_edge_ids) expect(reviewedEdge(id), id).toBe(true);
      }
      expect(r.cautions.length).toBeGreaterThan(0);
    }
    const rett = ranked[0];
    expect(rett.cautions.map((c) => c.kind)).toEqual(expect.arrayContaining(["contradicted_classification", "clinical_differences"]));
  });

  it("does not present itself as biological or clinical similarity", () => {
    for (const w of Object.values(FACTOR_WEIGHTS)) expect(w.label).not.toMatch(/similar/i);
    expect(src("src/components/ResearchSections.tsx")).toMatch(/not a measure of biological, clinical or treatment similarity/i);
    expect(src("src/components/ResultsView.tsx")).toMatch(/Not a measure of biological or clinical similarity/);
  });

  it("detects the natural-history study as a research hub", () => {
    const hub = researchHubs(b.nodes, b.edges)[0];
    expect(hub.node_id).toBe("study:nhs");
    expect(hub.disease_ids).toHaveLength(4);
  });
});

describe("collaborator layer", () => {
  it("every collaborator has public provenance through reviewed edges", () => {
    expect(b.collaborators.length).toBeGreaterThanOrEqual(3);
    for (const c of b.collaborators) {
      expect(g.getNode(c.node_id), c.node_id).toBeDefined();
      expect(c.evidence_edge_ids.length).toBeGreaterThan(0);
      for (const id of c.evidence_edge_ids) expect(reviewedEdge(id), `${c.node_id} → ${id}`).toBe(true);
      expect(c.collaboration_question).toMatch(/\?$/);
    }
  });

  it("registry investigators are linked to papers only where name AND institution match", () => {
    for (const key of ["edge:percy-authored-sa", "edge:neul-authored-sa"]) {
      const e = g.getEdge(key)!;
      expect(e.evidence.some((x) => x.source_record_id === "pubmed:31147226" && x.quoted_or_structured_evidence.startsWith("Author: "))).toBe(true);
      expect(e.evidence.some((x) => x.source_record_id === "ctgov:NCT02738281")).toBe(true);
    }
    // PMID 32472944's PubMed affiliations differ from the registry: no investigator link to it.
    expect(b.edges.some((e) => e.predicate === "authored" && e.object_id === "paper:32472944")).toBe(false);
  });

  it("stores no contact details", () => {
    const text = JSON.stringify([b.collaborators, b.nodes, b.sources.map((s) => s.text)]);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(text).not.toMatch(/\b(phone|tel:|mailto:)/i);
  });

  it("never implies willingness to collaborate", () => {
    const ui = src("src/components/ResearchSections.tsx");
    expect(ui).toMatch(/does not indicate availability or willingness/);
    expect(JSON.stringify(b.collaborators)).not.toMatch(/contact (this|them)|join your study|reach out/i);
  });
});

describe("Research Action Brief", () => {
  const brief = b.action_brief!;
  const lines = [brief.opportunity, ...brief.why_surfaced, ...brief.existing_assets, brief.question, ...brief.must_validate, ...brief.does_not_mean];

  it("sources every claim through reviewed evidence edges", () => {
    for (const l of lines) for (const id of l.evidence_edge_ids) expect(reviewedEdge(id), `${l.text.slice(0, 40)} → ${id}`).toBe(true);
    for (const s of brief.bring_sources) for (const id of s.evidence_edge_ids) expect(reviewedEdge(id)).toBe(true);
    const urls = brief.bring_sources.map((s) => s.url).join(" ");
    for (const anchor of ["NCT02738281", "32472944", "31147226"]) expect(urls).toContain(anchor);
    for (const id of brief.who_is_relevant) expect(b.collaborators.some((c) => c.node_id === id)).toBe(true);
  });

  it("states explicit limitations", () => {
    const not = brief.does_not_mean.map((l) => l.text).join(" ");
    expect(not).toMatch(/not equivalent/i);
    expect(not).toMatch(/treatment/i);
    expect(not).toMatch(/mechanism/i);
    expect(brief.must_validate.length).toBeGreaterThanOrEqual(2);
    expect(brief.question.text).toMatch(/\?$/);
  });

  it("is delivered in the canonical search result", async () => {
    const r = await search.search("CDKL5");
    if (!r.found) throw new Error("expected result");
    expect(r.action_brief?.question.text).toBe(brief.question.text);
    expect(r.collaborators.length).toBe(b.collaborators.length);
  });
});

describe("alternate entry modes resolve into the same evidence network", () => {
  it.each([
    ["CDKL5", "gene:cdkl5", "label"],
    ["STK9", "gene:cdkl5", "alias"],
    ["MONDO:0100039", "disease:cdd", "identifier"],
    ["cdkl5 deficiency DISORDER", "disease:cdd", "label"],
  ])("%s → CDD page", async (q, matchedNode, via) => {
    const r = await search.search(q);
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.disease.node_id).toBe("disease:cdd");
    expect(r.matched.node_id).toBe(matchedNode);
    expect(r.matched.via).toBe(via);
  });
});

describe("benchmark honesty", () => {
  it("reports the measured result without a 10× claim", () => {
    expect(ratio(BENCHMARK.manual.seconds, BENCHMARK.rarepath.seconds)).toBeLessThan(10);
    expect(JSON.stringify(BENCHMARK)).not.toMatch(/10×\s*faster|10x\s*faster|achiev\w* 10/i);
    expect(BENCHMARK.caveats.join(" ")).toMatch(/Below 10×/);
  });

  it("is scoped to discovery and evidence assembly only", () => {
    expect(BENCHMARK.scope).toMatch(/Discovery and evidence assembly only/);
    const doc = src("docs/benchmark.md");
    expect(doc).toMatch(/discovery and evidence assembly only/i);
    expect(doc).toMatch(/does \*\*not\*\* measure treatment development/);
  });
});

describe("evidence statuses are accessible without color", () => {
  it("each status has a unique icon, unique label and unique border style", () => {
    const badge = src("src/components/StatusBadge.tsx");
    const block = badge.slice(badge.indexOf("STATUS_META"), badge.indexOf("export function StatusBadge"));
    const icons = [...block.matchAll(/icon: "([^"]+)"/g)].map((m) => m[1]);
    const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    const styles = [...block.matchAll(/badge: "[^"]*border-(solid|dashed|double|dotted)[^"]*"/g)].map((m) => m[1]);
    expect(new Set(icons).size).toBe(4);
    expect(new Set(labels).size).toBe(4);
    expect(new Set(styles).size).toBe(4);
  });
});
