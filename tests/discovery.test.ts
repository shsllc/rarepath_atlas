import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { opportunityDetails, rankResearchConnections } from "@/lib/analytics";
import { isUnreviewedAiEdge } from "@/lib/graph-view";
import { briefAsText } from "@/lib/brief-text";
import { HYPOTHESIS } from "@/lib/tenx";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const b = g.bundle();
const search = new GraphSearchService(g, new CuratedReusableAssetFinder(g));
const ranked = rankResearchConnections(b.nodes, b.edges, "disease:cdd");
const details = opportunityDetails(b.nodes, b.edges, "disease:cdd", ranked);
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const reviewed = (id: string) => !!g.getEdge(id) && !isUnreviewedAiEdge(g.getEdge(id)!);
const label = (id: string) => g.getNode(id)?.label ?? id;

describe("entry routes converge on the same evidence network", () => {
  it.each([
    ["CDKL5 deficiency disorder", "disease:cdd", "label"],
    ["CDKL5", "gene:cdkl5", "label"],
    ["STK9", "gene:cdkl5", "alias"],
    ["MONDO:0100039", "disease:cdd", "identifier"],
    ["cdd", "disease:cdd", "alias"],
  ])("%s → %s via %s → CDD", async (q, node, via) => {
    const r = await search.search(q);
    if (!r.found) throw new Error(`no result for ${q}`);
    expect(r.matched.node_id).toBe(node);
    expect(r.matched.via).toBe(via);
    expect(r.disease.node_id).toBe("disease:cdd");
  });

  it("only supported examples are offered as 'Try another entry'", async () => {
    const ui = src("src/components/DiscoverySections.tsx");
    const block = ui.slice(ui.indexOf("ENTRY_EXAMPLES"), ui.indexOf("] as const", ui.indexOf("ENTRY_EXAMPLES")));
    const qs = [...block.matchAll(/q: "([^"]+)"/g)].map((m) => m[1]);
    expect(qs.length).toBeGreaterThanOrEqual(4);
    for (const q of qs) {
      const r = await search.search(q);
      expect(r.found && r.disease.node_id, q).toBe("disease:cdd");
    }
  });
});

describe("opportunity navigator", () => {
  it("uses reviewed edges only", () => {
    const reviewedOnly = b.edges.filter((e) => !isUnreviewedAiEdge(e));
    expect(opportunityDetails(b.nodes, reviewedOnly, "disease:cdd", rankResearchConnections(b.nodes, reviewedOnly, "disease:cdd"))).toEqual(details);
  });

  it("weaker candidates do not inherit Rett's assets", () => {
    const rett = details.find((d) => d.disease_id === "disease:rett")!;
    expect(rett.shared_asset_ids).toEqual(["asset:rtt-css"]);
    for (const id of ["disease:foxg1", "disease:mdd"]) {
      const d = details.find((x) => x.disease_id === id)!;
      expect(d.shared_asset_ids).toEqual([]);
      expect(d.asset_note).toBe("Shared study infrastructure identified; no stronger reusable-asset path is currently verified.");
    }
  });

  it("study-team counts come from reviewed 'investigates' edges on a shared study", () => {
    for (const d of details)
      for (const r of d.study_team_ids) {
        const e = b.edges.find((x) => x.subject_id === r && x.predicate === "investigates" && d.shared_study_ids.includes(x.object_id));
        expect(e && reviewed(e.id), `${d.disease_id} ${r}`).toBe(true);
      }
  });

  it("next questions are questions, not claims", () => {
    for (const d of details) expect(d.next_question).toMatch(/\?$/);
  });
});

describe("action workflow", () => {
  const brief = b.action_brief!;
  const tw = brief.this_week!;

  it("presents Review → Verify → Ask, then Before acting", () => {
    const ui = src("src/components/ImpactSections.tsx");
    for (const s of ["Step 1 · Review", "Step 2 · Verify", "Step 3 · Ask", "Before acting"]) expect(ui).toContain(s);
  });

  it("sources every workflow claim through reviewed edges", () => {
    const ids = [
      ...tw.next_step.evidence_edge_ids,
      ...tw.destinations.flatMap((d) => d.evidence_edge_ids),
      ...brief.bring_sources.flatMap((s) => s.evidence_edge_ids),
      ...brief.question.evidence_edge_ids,
      ...brief.must_validate.flatMap((l) => l.evidence_edge_ids),
      ...brief.does_not_mean.flatMap((l) => l.evidence_edge_ids),
    ];
    for (const id of ids) expect(reviewed(id), id).toBe(true);
  });

  it("the copied brief carries the limitations, verification needs and sources", () => {
    const text = briefAsText(brief, b.collaborators, label);
    expect(text).toContain("WHAT THIS DOES NOT MEAN");
    expect(text).toContain("WHAT MUST BE VERIFIED");
    for (const l of brief.does_not_mean) expect(text).toContain(l.text);
    for (const anchor of ["NCT02738281", "32472944", "31147226"]) expect(text).toContain(anchor);
    expect(text).toMatch(/does not indicate willingness/);
    expect(text).toMatch(/not medical advice/);
  });
});

describe("reusable-asset catalogue", () => {
  it("every status is evidence-backed by reviewed edges", () => {
    expect(b.asset_catalog.length).toBeGreaterThanOrEqual(4);
    for (const a of b.asset_catalog) {
      expect(g.getNode(a.asset_id)?.type, a.asset_id).toBe("ResearchAsset");
      for (const id of [...a.supported.evidence_edge_ids, ...a.must_validate.evidence_edge_ids]) expect(reviewed(id), `${a.asset_id} → ${id}`).toBe(true);
    }
  });

  it("does not overstate reuse", () => {
    const by = Object.fromEntries(b.asset_catalog.map((a) => [a.asset_id, a]));
    expect(b.asset_catalog.filter((a) => a.strongest).map((a) => a.asset_id)).toEqual(["asset:nhs-infrastructure"]);
    expect(by["asset:rtt-css"].status).toBe("potentially_adaptable");
    expect(by["asset:rtt-css"].must_validate.text).toMatch(/Not established: validity in CDD/);
    expect(by["asset:biobank"].status).toBe("discovery_lead");
    expect(by["asset:cds"].status).toBe("discovery_lead"); // preprint-only evidence
    expect(src("src/components/DiscoverySections.tsx")).toMatch(/Status reflects the evidence for reuse, not the asset&apos;s validity/);
  });
});

describe("impact pathway and language", () => {
  it("labels 10× as a hypothesis on the pathway", () => {
    expect(src("src/components/ImpactSections.tsx")).toContain("10× hypothesis · not yet measured");
    expect(HYPOTHESIS.question).toMatch(/^Could RarePath/);
  });

  it("introduces no similarity language", () => {
    for (const f of ["src/components/DiscoverySections.tsx", "src/components/ImpactSections.tsx", "src/lib/analytics.ts"])
      for (const line of src(f).split(/\r?\n/).filter((l) => !/\bnot\b/i.test(l))) expect(line, f).not.toMatch(/similarity|% similar|disease similarity/i);
  });
});
