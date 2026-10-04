import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { rankResearchConnections } from "@/lib/analytics";
import { isUnreviewedAiEdge } from "@/lib/graph-view";
import { BENCHMARK, ratio } from "@/lib/benchmark";
import { HYPOTHESIS, TENX } from "@/lib/tenx";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const tw = b.action_brief!.this_week!;
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const reviewed = (id: string) => {
  const e = g.getEdge(id);
  return !!e && !isUnreviewedAiEdge(e);
};

describe("What can this patient group do this week?", () => {
  it("every destination is a graph entity with reviewed provenance", () => {
    expect(tw.destinations.length).toBeGreaterThan(0);
    for (const d of tw.destinations) {
      expect(g.getNode(d.node_id), d.node_id).toBeDefined();
      expect(d.evidence_edge_ids.length).toBeGreaterThan(0);
      for (const id of d.evidence_edge_ids) expect(reviewed(id), `${d.node_id} → ${id}`).toBe(true);
      expect(d.why).toMatch(/^Relevant destination to verify/);
    }
  });

  it("evidence anchors resolve to the expected sources and reviewed edges", () => {
    const urls = b.action_brief!.bring_sources.map((s) => s.url);
    for (const anchor of ["NCT02738281", "32472944", "31147226", "35483386"]) expect(urls.join(" ")).toContain(anchor);
    for (const s of b.action_brief!.bring_sources) for (const id of s.evidence_edge_ids) expect(reviewed(id)).toBe(true);
  });

  it("no action claim depends on an analyst-unreviewed AI-only edge", () => {
    const ids = [...tw.next_step.evidence_edge_ids, ...tw.destinations.flatMap((d) => d.evidence_edge_ids), ...tw.community_evidence_edge_ids];
    for (const id of ids) expect(reviewed(id), id).toBe(true);
  });

  it("the patient organization shown is provenance-backed", () => {
    for (const id of tw.community_ids) {
      expect(g.getNode(id)?.type).toBe("PatientOrganization");
      const support = tw.community_evidence_edge_ids.map((e) => g.getEdge(e)!).find((e) => e.subject_id === id && e.predicate === "supports_community" && e.object_id === "disease:cdd");
      expect(support, id).toBeDefined();
    }
  });

  it("never implies willingness and stores no contact details", () => {
    const text = JSON.stringify(tw);
    expect(text).not.toMatch(/will collaborate|contact them|reach out|@/i);
    expect(src("src/components/ImpactSections.tsx")).toMatch(/does not indicate availability or willingness/);
  });

  it("keeps the safety boundaries, including investigator role status", () => {
    const must = b.action_brief!.must_validate.map((l) => l.text).join(" ");
    expect(must).toMatch(/still hold these roles/);
    expect(must).toMatch(/Access terms|access/i);
    const not = b.action_brief!.does_not_mean.map((l) => l.text).join(" ");
    for (const re of [/not equivalent/i, /mechanism/i, /treatment/i]) expect(not).toMatch(re);
  });
});

describe("two-layer impact story", () => {
  const ui = src("src/components/ImpactSections.tsx");

  it("labels ~4.2× as measured evidence discovery only", () => {
    expect(ratio(BENCHMARK.manual.seconds, BENCHMARK.rarepath.seconds)).toBe(4.2);
    expect(ui).toMatch(/Measured in this prototype/);
    expect(ui).toMatch(/evidence discovery and assembly/);
    expect(ui).toMatch(/not treatment-development speed/);
  });

  it("always labels 10× as an unmeasured hypothesis", () => {
    expect(HYPOTHESIS.badge).toMatch(/Hypothesis — not yet measured/);
    expect(HYPOTHESIS.statement).toMatch(/could contribute toward a 10× reduction in the discovery and planning portion/);
    expect(ui).toMatch(/The 10× hypothesis to validate/);
    expect(HYPOTHESIS.assumptions.length).toBeGreaterThanOrEqual(4);
    expect(HYPOTHESIS.validation.length).toBeGreaterThanOrEqual(4);
    // no week/month estimates without a sourced baseline
    expect(JSON.stringify(HYPOTHESIS)).not.toMatch(/\b\d+\s*(days?|weeks?|months?|years?)\b/i);
  });

  it("makes no treatment-development acceleration claim", () => {
    const corpus = [JSON.stringify(TENX), JSON.stringify(HYPOTHESIS), JSON.stringify(BENCHMARK), ui, src("README.md"), src("docs/submission-copy.md")].join("\n");
    expect(corpus).not.toMatch(/(faster|accelerat\w*)\s+(treatment|drug|therap)/i);
    expect(corpus).not.toMatch(/treatments?\s+(\w+\s+){0,3}(10|ten)\s*(×|x|times)\s+faster/i);
    expect(corpus).not.toMatch(/10\s*(×|x)\s+faster/i);
  });
});

describe("ranking presentation", () => {
  it("never uses 'disease similarity' or similarity-score language", () => {
    for (const f of ["src/components/ResearchSections.tsx", "src/components/ResultsView.tsx", "src/components/ImpactSections.tsx", "src/lib/analytics.ts", "README.md", "docs/submission-copy.md"])
      // Negated statements ("not a similarity score") are allowed; affirmative similarity framing is not.
      for (const line of src(f).split(/\r?\n/).filter((l) => !/\bnot\b/i.test(l))) expect(line, f).not.toMatch(/disease similarity|similarity score|% similar/i);
    expect(src("src/components/ResearchSections.tsx")).toMatch(/RarePath ranks opportunities to investigate, not biological equivalence/);
  });

  it("keeps counterweights visible on the #1 connection, including no treatment-transfer evidence", () => {
    const top = rankResearchConnections(b.nodes, b.edges, "disease:cdd")[0];
    expect(top.disease_id).toBe("disease:rett");
    expect(top.score).toBe(9);
    expect(top.cautions.map((c) => c.kind)).toEqual(
      expect.arrayContaining(["contradicted_classification", "clinical_differences", "no_mechanism_evidence", "no_treatment_transfer_evidence"]),
    );
    expect(src("src/components/ResearchSections.tsx")).toMatch(/Why this does not mean the diseases are the same/);
  });

  it("AI-only edge exclusion still holds", () => {
    const all = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
    const reviewedOnly = rankResearchConnections(b.nodes, b.edges.filter((e) => !isUnreviewedAiEdge(e)), "disease:cdd");
    expect(all).toEqual(reviewedOnly);
  });
});
