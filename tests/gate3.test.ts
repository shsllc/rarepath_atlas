import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveEvidenceStatus } from "@/lib/schemas";
import { buildGraphView, DEFAULT_FILTERS, drawerTargetFor, EDGE_STATUS_CLASS, isUnreviewedAiEdge } from "@/lib/graph-view";
import { checkExplanation, WORD_LIMITS, type ExplanationBody } from "@/lib/explanation";
import { TENX } from "@/lib/tenx";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const view = buildGraphView(b.nodes, b.edges, b.focus_disease_id, DEFAULT_FILTERS);
const full = buildGraphView(b.nodes, b.edges, b.focus_disease_id, { ...DEFAULT_FILTERS, showAll: true, includeUnreviewedAi: true, categories: { ...DEFAULT_FILTERS.categories, other: true } });
const graphSrc = fs.readFileSync(path.join(process.cwd(), "src/components/EvidenceGraph.tsx"), "utf8");
const label = (id: string) => g.getNode(id)?.label ?? id;

describe("evidence graph", () => {
  it("1. every edge carries the visual class for its derived evidence status", () => {
    for (const v of [...view.edges, ...full.edges]) {
      const e = g.getEdge(v.id)!;
      expect(v.classes.split(" ")).toContain(EDGE_STATUS_CLASS[deriveEvidenceStatus(e)]);
    }
    // and each class maps to a distinct line style in the Cytoscape stylesheet
    const styleFor = (cls: string) => graphSrc.slice(graphSrc.indexOf(`edge.${cls}`), graphSrc.indexOf(`edge.${cls}`) + 260);
    expect(styleFor("status-supported")).toMatch(/"line-style": "solid"/);
    expect(styleFor("status-inferred")).toMatch(/"line-style": "dashed"/);
    expect(styleFor("status-unknown")).toMatch(/"line-style": "dotted"/);
    expect(styleFor("status-contradictory")).toMatch(/"line-outline-width": 2/); // rendered as a double line
  });

  it("2. default graph never shows analyst-unreviewed OpenAI-only edges", () => {
    expect(view.edges.some((v) => isUnreviewedAiEdge(g.getEdge(v.id)!))).toBe(false);
    const ai = full.edges.filter((v) => isUnreviewedAiEdge(g.getEdge(v.id)!));
    expect(ai.length).toBeGreaterThan(0);
    for (const v of ai) {
      expect(v.classes).toContain("unreviewed-ai");
      expect(v.label.startsWith("AI-extracted")).toBe(true);
    }
  });

  it("3. tapping a graph edge opens the evidence drawer for exactly that edge; tapping a node opens the node view", () => {
    const e = view.edges[0];
    expect(drawerTargetFor("edge", e.id, b.edges, label)).toEqual({ kind: "edges", title: expect.any(String), edgeIds: [e.id] });
    expect(drawerTargetFor("node", "study:nhs", b.edges, label)).toEqual({ kind: "node", nodeId: "study:nhs" });
    expect(graphSrc).toMatch(/cy\.on\("tap", "edge"[\s\S]*drawerTargetFor\("edge"/);
    expect(graphSrc).toMatch(/cy\.on\("tap", "node"[\s\S]*drawerTargetFor\("node"/);
  });

  it("8. the contradicted 'Rett variant' classification stays visible in the default graph", () => {
    const c = view.edges.find((v) => v.id === "edge:variant-claim");
    expect(c?.status).toBe("contradictory");
    expect(c?.classes).toContain("status-contradictory");
  });

  it("default view is readable (curated neighbourhood, not the whole graph)", () => {
    expect(view.nodes.length).toBeLessThanOrEqual(12);
    expect(view.edges.length).toBeLessThanOrEqual(16);
    expect(full.edges.length).toBe(b.edges.length);
  });
});

describe("10× section", () => {
  it("4. contains no unsupported numeric time-saving claim", () => {
    const docs = fs.readFileSync(path.join(process.cwd(), "docs/10x-impact.md"), "utf8");
    for (const text of [JSON.stringify(TENX), docs]) {
      expect(text).not.toMatch(/\b\d+(\.\d+)?\s*(-|–|to)?\s*\d*\s*(minutes?|hours?|days?|weeks?|months?|years?)\b/i);
      expect(text).not.toMatch(/months?\s*(→|->|to)\s*(days?|hours?|minutes?)/i);
      expect(text).not.toMatch(/\d+\s*(x|×)\s*faster/i);
    }
    expect(TENX.measures.length).toBeGreaterThan(2);
  });
});

describe("Path Explainer output rules", () => {
  const good: ExplanationBody = {
    why_it_matters: "People with CDD were studied in the same natural-history study as people with Rett syndrome, so patient groups can learn from that shared work.",
    evidence_shows:
      "The registry lists CDKL5 Disorder as a studied condition, and a 2020 paper compared 793 participants across four disorders. A CDD-specific severity assessment was built partly from this study's experience.",
    does_not_show: "This does not show shared biology or that any treatment would carry over, and the Rett scale is not validated for CDD.",
    next_question: "How do the Rett severity scale and the CDD-specific assessment compare in people with CDD?",
    cited_edge_ids: ["edge:cdd-in-nhs"],
  };

  it("5. accepts output within the intended length and rejects overly long output", () => {
    const r = checkExplanation(good);
    expect(r.ok).toBe(true);
    expect(r.words).toBeGreaterThanOrEqual(WORD_LIMITS.min);
    expect(r.words).toBeLessThanOrEqual(WORD_LIMITS.max);
    const long = { ...good, evidence_shows: good.evidence_shows.repeat(6) };
    expect(checkExplanation(long).issues.join()).toMatch(/too long/);
  });

  it("6. requires limitations", () => {
    expect(checkExplanation({ ...good, does_not_show: "" }).issues.join()).toMatch(/missing limitations/);
  });

  it("7. requires an actionable next question", () => {
    expect(checkExplanation({ ...good, next_question: "" }).issues.join()).toMatch(/missing next question/);
    expect(checkExplanation({ ...good, next_question: "The study is interesting and could matter a lot." }).ok).toBe(false);
  });

  it("rejects treatment-transfer phrasing and internal jargon", () => {
    expect(checkExplanation({ ...good, evidence_shows: good.evidence_shows + " Rett treatments will work for CDD." }).ok).toBe(false);
    expect(checkExplanation({ ...good, does_not_show: good.does_not_show + ' No evidence has stance "qualifies".' }).ok).toBe(false);
  });

  it("the explainer prompt enforces the four-part structure and word cap", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/openai/path-explainer.ts"), "utf8");
    for (const k of ["why_it_matters", "evidence_shows", "does_not_show", "next_question", "WORD_LIMITS.max", "checkExplanation"]) expect(src).toContain(k);
  });
});

describe("provenance presentation", () => {
  it("9. preprint sources remain marked as preprints, including in graph labels", () => {
    const p = g.getNode("paper:39867409")!;
    expect(p.type === "Paper" && p.publication_status).toBe("preprint");
    expect(full.nodes.find((n) => n.id === "paper:39867409")?.label).toMatch(/preprint/i);
  });

  it("10. external identifiers link to the expected official sources", () => {
    const host: Record<string, RegExp> = {
      MONDO: /^https:\/\/monarchinitiative\.org\/MONDO:\d{7}$/,
      OMIM: /^https:\/\/omim\.org\/entry\/\d+$/,
      ORPHA: /^https:\/\/www\.orpha\.net\/en\/disease\/detail\/\d+$/,
      HGNC: /^https:\/\/www\.genenames\.org\/.*HGNC:\d+$/,
      HPO: /^https:\/\/hpo\.jax\.org\/browse\/term\/HP:\d{7}$/,
      NCT: /^https:\/\/clinicaltrials\.gov\/study\/NCT\d{8}$/,
      PMID: /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/,
    };
    let checked = 0;
    for (const n of b.nodes)
      for (const x of n.external_ids) {
        if (x.system === "GARD") continue; // no stable public URL pattern; shown as text only
        expect(x.url, `${n.id} ${x.id}`).toMatch(host[x.system]);
        checked++;
      }
    expect(checked).toBeGreaterThan(15);
  });

  it("featured story lines all cite existing reviewed (non-AI-only) edges", () => {
    const featured = b.opportunities.find((o) => o.story.length > 0)!;
    expect(featured.story.map((s) => s.label)).toEqual(["What happened", "Why it matters", "Potentially adaptable asset", "Important limitation", "Next research question"]);
    for (const s of featured.story)
      for (const id of s.evidence_edge_ids) {
        expect(g.getEdge(id), id).toBeDefined();
        expect(isUnreviewedAiEdge(g.getEdge(id)!)).toBe(false);
      }
  });
});
