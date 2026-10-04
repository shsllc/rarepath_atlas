import { afterEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService, toCandidateEdge, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { euctrCategory, parseEuctrSummary } from "@/lib/research/providers/euctr";
import { isrctnStatus } from "@/lib/research/providers/isrctn";
import { reconcile } from "@/lib/research/reconcile";
import { researchSources } from "@/lib/research/registry";
import type { StudyRecord } from "@/lib/research/types";
import { rankResearchConnections } from "@/lib/analytics";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import { EUCTR_TXT, researchRouter, type Failures } from "./fixtures/research-http";

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
const find = (p: DiscoveryPreview, id: string) => p.clinical.studies.find((s) => s.registrations.some((r) => r.id === id));

describe("registry provenance", () => {
  it("every trial names its source registry, record id and URL", async () => {
    const p = await preview();
    for (const s of p.clinical.studies) {
      expect(s.registrations.length).toBeGreaterThan(0);
      for (const r of s.registrations) {
        expect(["ClinicalTrials.gov", "ISRCTN", "EU Clinical Trials Register"]).toContain(r.registry);
        expect(r.url).toMatch(/^https:\/\//);
      }
    }
    expect(p.clinical.registries.map((r) => r.registry)).toEqual(["ClinicalTrials.gov", "ISRCTN", "EU Clinical Trials Register"]);
  });

  it("the Sources view documents ICTRP as approval-required and lists skipped registries honestly", () => {
    const s = researchSources();
    expect(s.find((x) => x.name === "WHO ICTRP")!.note).toMatch(/Available with approval, not immediately/);
    expect(s.find((x) => x.name === "EMA CTIS")!.note).toMatch(/undocumented/);
    expect(s.find((x) => /DDrare/.test(x.name))!.note).toMatch(/permission/);
    expect(s.find((x) => /jRCT/.test(x.name))!.note).toMatch(/prohibits automated download/);
    expect(s.filter((x) => x.mode === "live").map((x) => x.name)).toEqual(expect.arrayContaining(["ISRCTN registry", "EU Clinical Trials Register (EudraCT)"]));
  });
});

describe("cross-registry identifiers and deduplication", () => {
  it("one trial registered in ClinicalTrials.gov, ISRCTN and EU CTR collapses into one entity with all three registrations", async () => {
    const p = await preview();
    const t = find(p, "NCT00000001")!;
    expect(new Set(t.registrations.map((r) => `${r.registry}:${r.id}`))).toEqual(new Set(["ClinicalTrials.gov:NCT00000001", "ISRCTN:ISRCTN11111111", "EU Clinical Trials Register:2019-000123-45"]));
    expect(t.secondary_ids).toEqual(expect.arrayContaining(["EudraCT 2019-000123-45", "ISRCTN11111111"]));
    expect(p.clinical.studies.filter((s) => s.registrations.some((r) => ["NCT00000001", "ISRCTN11111111", "2019-000123-45"].includes(r.id)))).toHaveLength(1);
  });

  it("never merges on title, sponsor or disease alone; look-alikes are flagged POSSIBLE DUPLICATE", async () => {
    const p = await preview();
    // ISRCTN33333333 has the same title as NCT00000004 but shares no identifier.
    const a = find(p, "NCT00000004")!;
    const z = find(p, "ISRCTN33333333")!;
    expect(a).not.toBe(z);
    expect(a.possible_duplicates).toContain("study:isrctn:ISRCTN33333333");
    expect(z.possible_duplicates).toContain("study:nct:NCT00000004");
  });

  it("a sponsor protocol number merges only together with the same sponsor, and conflicting registry ids never merge", () => {
    const at = "t";
    const st = (key: string, ids: StudyRecord["ids"], label = key): StudyRecord => ({ kind: "study", key, label, primary_registry: "X", ids, status: "UNKNOWN", status_label: "", status_category: "unknown", phases: [], design: {}, conditions: [], interventions: [], intervention_details: [], outcomes: [], collaborators: [], countries: [], locations: [], eligibility: { age_groups: [] }, has_results: false, documents: [], infrastructure: [], provenance: [{ provider: "isrctn", source_id: key, url: "https://x.org", retrieved_at: at, native_type: "t" }], review_status: "machine_assembled" });
    expect(reconcile([st("a", { sponsor_protocol: "acme|001" }), st("b", { sponsor_protocol: "acme|001" })], []).records).toHaveLength(1);
    expect(reconcile([st("a", { sponsor_protocol: "acme|001" }), st("b", { sponsor_protocol: "other|001" })], []).records).toHaveLength(2);
    // Same sponsor protocol but two different NCT ids: different trials (e.g. an extension study).
    expect(reconcile([st("a", { nct: "NCT00000001", sponsor_protocol: "acme|001" }), st("b", { nct: "NCT00000002", sponsor_protocol: "acme|001" })], []).records).toHaveLength(2);
    // UTN cross-reference merges.
    expect(reconcile([st("a", { nct: "NCT1", utn: "U1111-1234-5678" }), st("b", { anzctr: "ACTRN12600000000000", utn: "U1111-1234-5678" })], []).records).toHaveLength(1);
  });
});

describe("statuses across registries", () => {
  it("EU CTR per-country statuses are preserved and early stops are cautions", () => {
    const rows = parseEuctrSummary(EUCTR_TXT);
    expect(rows[1].countryStatuses).toEqual([
      { code: "IT", country: "Italy", status: "Prematurely Ended" },
      { code: "ES", country: "Spain", status: "Completed" },
    ]);
    expect(euctrCategory(["Completed", "Completed"])).toBe("completed");
    expect(euctrCategory(["Prematurely Ended", "Completed"])).toBe("caution");
    expect(euctrCategory(["Ongoing", "Completed"])).toBe("active");
  });

  it("ISRCTN overrides are kept verbatim; otherwise status is derived from dates and labelled as derived", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(isrctnStatus("Stopped", undefined, undefined, undefined, now)).toMatchObject({ status: "Stopped", category: "caution" });
    expect(isrctnStatus(undefined, "2026-01-01", "2029-01-01", "2031-01-01", now)).toMatchObject({ status: "RECRUITING", category: "active", label: expect.stringMatching(/derived/) });
    expect(isrctnStatus(undefined, "2020-01-01", "2022-01-01", "2023-01-01", now)).toMatchObject({ category: "completed", label: expect.stringMatching(/derived; not verified/) });
  });

  it("caution trials from other registries carry the caution guidance; active ones say verify with the study team", async () => {
    const p = await preview();
    expect(find(p, "ISRCTN33333333")!.status_category).toBe("caution");
    expect(find(p, "2016-000999-11")!).toMatchObject({ status_category: "caution", status_label: "IT: Prematurely Ended; ES: Completed" });
    for (const s of p.clinical.groups.caution) expect(s.guidance).toMatch(/Not a positive reuse lead/);
    expect(find(p, "ISRCTN22222222")!.guidance).toBe("Potential study/research lead — verify eligibility/status with the study team.");
  });
});

describe("international breadth and privacy", () => {
  it("adds trials and countries not in ClinicalTrials.gov, including natural-history infrastructure", async () => {
    const p = await preview();
    expect(p.clinical.not_on_ctgov).toBeGreaterThanOrEqual(3);
    expect(p.clinical.countries).toEqual(expect.arrayContaining(["Ireland", "Italy", "Spain"]));
    const nh = find(p, "ISRCTN22222222")!;
    expect(nh.infrastructure.map((f) => f.flag)).toEqual(expect.arrayContaining(["natural_history", "registry", "observational_cohort"]));
    expect(p.assets.reuse_leads.some((s) => s.nct === "ISRCTN22222222")).toBe(true);
  });

  it("registry contact e-mails / phones are never extracted; PIs appear only with an ORCID", async () => {
    const p = await preview();
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/ada@example\.org|noorcid@example\.org|\+44 0000/);
    expect(p.records.some((r) => r.kind === "person" && r.ids.orcid === "0000-0002-0000-0001")).toBe(true);
    expect(p.records.some((r) => r.kind === "person" && r.label === "No Orcid")).toBe(false);
  });

  it("one registry failing leaves the others intact", async () => {
    const p = await preview({ isrctn: "http500", euctr: "timeout" });
    const run = Object.fromEntries(p.sources.map((s) => [s.id, s.status]));
    expect(run).toMatchObject({ isrctn: "failed", euctr: "failed", clinicaltrials: "ok" });
    expect(p.clinical.registries.map((r) => r.registry)).toEqual(["ClinicalTrials.gov"]);
    expect(p.warnings.join(" ")).toMatch(/ISRCTN registry returned an error/);
  });
});

describe("review boundary", () => {
  it("machine-assembled trial edges from any registry cannot reach ranking or the Action Brief", async () => {
    const p = await preview();
    const edges = p.links.filter((l) => l.provenance.some((x) => x.provider === "isrctn" || x.provider === "euctr")).map(toCandidateEdge).filter((e): e is NonNullable<typeof e> => !!e);
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) expect(isReviewedEvidenceEdge(e)).toBe(false);
    for (const l of p.links) expect(l.eligible_for_action).toBe(false);
    expect(rankResearchConnections(b.nodes, [...b.edges, ...edges], "disease:cdd")).toEqual(rankResearchConnections(b.nodes, b.edges, "disease:cdd"));
    const brief = b.action_brief!;
    expect([...brief.bring_sources.flatMap((s) => s.evidence_edge_ids), ...brief.existing_assets.flatMap((a) => a.evidence_edge_ids)].some((id) => id.startsWith("edge:disc:"))).toBe(false);
  });

  it("CDD reviewed journey unchanged", async () => {
    setResearchFetch(researchRouter());
    const r = await new GraphSearchService(g, new CuratedReusableAssetFinder(g), new MultiProviderDiscoveryService()).search("CDKL5");
    if (!r.found) throw new Error("expected full journey");
    expect(r.action_brief).toBeDefined();
    expect(r.edges).toHaveLength(b.edges.length);
  });
});
