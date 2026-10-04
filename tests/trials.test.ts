import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { MultiProviderDiscoveryService, toCandidateEdge, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { reconcile } from "@/lib/research/reconcile";
import { CATEGORY_GUIDANCE, normalizeStudy, statusCategory, STUDY_STATUS_LABEL } from "@/lib/research/providers/clinicaltrials";
import type { ResearchRecord, StudyRecord } from "@/lib/research/types";
import { rankResearchConnections } from "@/lib/analytics";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import { researchRouter, study } from "./fixtures/research-http";

const b = JsonGraphService.fromFile(REAL_BUNDLE).bundle();
afterEach(() => {
  setResearchFetch(null);
  clearClinGenCache();
});
async function preview(): Promise<DiscoveryPreview> {
  setResearchFetch(researchRouter());
  const o = await new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }).preview("Dravet syndrome");
  if (o.kind !== "preview") throw new Error("expected preview");
  return o.preview;
}
const byNct = (p: DiscoveryPreview) => Object.fromEntries(p.clinical.studies.map((s) => [s.nct, s]));

describe("trial status", () => {
  it("every registry status keeps its own label and family", () => {
    for (const s of ["RECRUITING", "NOT_YET_RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED", "TERMINATED", "WITHDRAWN", "SUSPENDED", "UNKNOWN"]) expect(STUDY_STATUS_LABEL[s], s).toBeTruthy();
    expect(new Set(["COMPLETED", "TERMINATED", "WITHDRAWN", "RECRUITING"].map((s) => STUDY_STATUS_LABEL[s])).size).toBe(4);
    expect(statusCategory("RECRUITING")).toBe("active");
    expect(statusCategory("ACTIVE_NOT_RECRUITING")).toBe("active");
    expect(statusCategory("COMPLETED")).toBe("completed");
    expect(statusCategory("TERMINATED")).toBe("caution");
    expect(statusCategory("WITHDRAWN")).toBe("caution");
    expect(statusCategory("SUSPENDED")).toBe("caution");
    expect(statusCategory("UNKNOWN")).toBe("unknown");
  });

  it("studies are grouped by status family, never flattened into assets", async () => {
    const p = await preview();
    expect(p.clinical.groups.active.map((s) => s.nct).sort()).toEqual(["NCT00000004", "NCT00000005"]);
    expect(p.clinical.groups.completed.map((s) => s.nct).sort()).toEqual(["NCT00000001", "NCT00000006"]);
    expect(p.clinical.groups.caution.map((s) => s.nct).sort()).toEqual(["NCT00000002", "NCT00000003", "NCT00000007"]);
  });

  it("terminated / withdrawn studies always carry a caution and their stated reason", async () => {
    const p = await preview();
    for (const s of p.clinical.groups.caution) {
      expect(s.guidance).toBe(CATEGORY_GUIDANCE.caution);
      expect(s.guidance).toMatch(/Not a positive reuse lead/);
    }
    expect(byNct(p).NCT00000002.why_stopped).toBe("Sponsor decision");
    // A terminated registry appears among infrastructure leads only with its caution, and after non-caution leads.
    const lead = p.assets.reuse_leads.find((s) => s.nct === "NCT00000007")!;
    expect(lead.status_category).toBe("caution");
    expect(lead.guidance).toMatch(/Caution/);
    expect(p.assets.reuse_leads.at(-1)!.nct).toBe("NCT00000007");
  });

  it("active leads say to verify with the study team, never to enroll; completion never means success", async () => {
    const p = await preview();
    for (const s of p.clinical.groups.active) expect(s.guidance).toBe("Potential study/research lead — verify eligibility/status with the study team.");
    expect(CATEGORY_GUIDANCE.completed).toMatch(/does not indicate that the study succeeded/);
    const ui = fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8");
    expect(ui).toMatch(/results posted \(not an indication of success\)/);
    const text = JSON.stringify(p) + ui;
    expect(text).not.toMatch(/\b(you should enroll|enroll now|sign up for|join this trial|successful trial|proven effective)\b/i);
  });
});

describe("design, outcomes and infrastructure", () => {
  it("interventional vs observational design is preserved with source-native fields", async () => {
    const s = byNct(await preview());
    expect(s.NCT00000001).toMatchObject({ study_type: "INTERVENTIONAL", design: { allocation: "RANDOMIZED", intervention_model: "PARALLEL", masking: "QUADRUPLE", primary_purpose: "TREATMENT" } });
    expect(s.NCT00000005).toMatchObject({ study_type: "OBSERVATIONAL", design: { observational_model: "COHORT", time_perspective: "PROSPECTIVE" } });
    expect(s.NCT00000001.eligibility).toEqual({ sex: "ALL", minimum_age: "2 Years", maximum_age: "18 Years", age_groups: ["CHILD", "ADULT"] });
    expect(s.NCT00000001.intervention_details).toEqual([{ type: "DRUG", name: "Investigational product" }]);
    expect(s.NCT00000001.locations[0]).toEqual({ facility: "Hospital A", city: "Boston", state: "Massachusetts", country: "United States" });
    expect(s.NCT00000001).toMatchObject({ has_results: true, primary_completion_date: "2023-01", last_update: "2024-02-01", enrollment_type: "ACTUAL" });
    expect(s.NCT00000001.documents[0]).toMatchObject({ protocol: true, sap: true, url: "https://cdn.clinicaltrials.gov/large-docs/01/NCT00000001/Prot_SAP_000.pdf" });
  });

  it("natural-history and registry flags come only from registry fields, with their basis", async () => {
    const s = byNct(await preview());
    expect(s.NCT00000005.infrastructure.map((f) => f.flag)).toEqual(expect.arrayContaining(["natural_history", "observational_cohort", "longitudinal"]));
    expect(s.NCT00000007.infrastructure).toContainEqual({ flag: "registry", basis: "registered as a patient registry" });
    expect(s.NCT00000004.infrastructure).toEqual([]);
  });

  it("outcome measures stay source-backed and are not reclassified", async () => {
    const p = await preview();
    const outcomes = p.records.filter((r): r is Extract<ResearchRecord, { kind: "outcome_measure" }> => r.kind === "outcome_measure");
    expect(outcomes.length).toBeGreaterThan(0);
    for (const o of outcomes) {
      expect(o.provenance.every((x) => x.provider === "clinicaltrials" && /_outcome$/.test(x.native_type))).toBe(true);
      expect(Object.keys(o)).not.toContain("biomarker");
    }
    for (const l of p.links.filter((x) => x.relation === "uses_outcome_measure")) expect(l.statement).toMatch(/registers ".+" as a (primary|secondary|other) outcome measure/);
  });

  it("a shared endpoint across condition sets is a discovery lead that disclaims shared biology and transfer", async () => {
    const p = await preview();
    const e = p.clinical.shared_endpoints.find((x) => x.measure === "Change in convulsive seizure frequency")!;
    expect(e).toBeTruthy();
    expect(e.conditions).toEqual(expect.arrayContaining(["Dravet Syndrome", "Lennox-Gastaut Syndrome"]));
    const ui = fs.readFileSync(path.join(process.cwd(), "src/components/DiscoveryPreview.tsx"), "utf8");
    expect(ui).toMatch(/A shared endpoint is not shared biology and does not mean any intervention transfers/);
    // Same condition set only → not a cross-community lead.
    expect(p.clinical.shared_endpoints.find((x) => x.measure === "Vineland Adaptive Behavior Scales")).toBeUndefined();
  });
});

describe("deduplication and linking", () => {
  it("the same NCT from two searches appears once", async () => {
    const p = await preview();
    expect(p.clinical.studies.filter((s) => s.nct === "NCT00000005")).toHaveLength(1);
  });

  it("trial records from different registries collapse on NCT or secondary ids (EudraCT / CTIS / UTN)", () => {
    const at = "2026-10-04T00:00:00Z";
    const a = normalizeStudy(study("NCT00000001", "COMPLETED").protocolSection, {}, at).study;
    // A future ICTRP-style record with no NCT but the same EudraCT number.
    const other: StudyRecord = { ...a, key: "study:ictrp:EUCTR2019-000123-45", ids: { eudract: "2019-000123-45" }, provenance: [{ provider: "europepmc", source_id: "EUCTR2019-000123-45", url: "https://example.org", retrieved_at: at, native_type: "registry" }] };
    const r = reconcile([a, other], []);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].key).toBe("study:nct:NCT00000001");
    expect(r.records[0].provenance).toHaveLength(2);
  });

  it("trial → paper links require a stable identifier and keep the registry's reference type", async () => {
    const p = await preview();
    const s = byNct(p).NCT00000001;
    expect(s.secondary_ids).toEqual(["EudraCT 2019-000123-45"]);
    const result = s.publications.find((x) => x.pmid === "555")!;
    expect(result.relation).toBe("trial_publication");
    expect(s.publications.find((x) => x.pmid === "556")!.relation).toBe("trial_background_reference");
    // The citation without a PMID created no link.
    expect(p.links.filter((l) => l.from === "study:nct:NCT00000001" && /reference/.test(l.native_evidence_type))).toHaveLength(2);
    // PMID 555 from the registry and from Europe PMC's accession index is one paper with both provenances.
    const paper555 = p.records.filter((r) => r.kind === "paper" && r.ids.pmid === "555");
    expect(paper555).toHaveLength(1);
    expect(new Set(paper555[0].provenance.map((x) => x.provider))).toEqual(new Set(["clinicaltrials", "trialpubs"]));
    for (const l of p.links.filter((x) => x.relation === "trial_publication")) expect(l.statement).toMatch(/not proof of a positive result/);
  });

  it("sponsors and collaborators are organizations, never investigators", async () => {
    const p = await preview();
    const sponsorLinks = p.links.filter((l) => l.relation === "sponsored_by" || l.relation === "collaborator_on");
    expect(sponsorLinks.length).toBeGreaterThan(0);
    for (const l of sponsorLinks) expect(p.records.find((r) => r.key === l.to)!.kind).toBe("organization");
    for (const l of p.links.filter((x) => x.relation === "investigator_on")) expect(p.records.find((r) => r.key === l.from)!.kind).toBe("person");
  });

  it("investigator identity stays strict: a trial official merges only on name + identical affiliation", () => {
    const at = "t";
    const official = normalizeStudy(study("NCT00000009", "RECRUITING").protocolSection, {}, at).records.find((r) => r.kind === "person")!;
    const sameNameElsewhere: ResearchRecord = { kind: "person", key: "person:openalex:A9", label: "Jane Smith", ids: { openalex: "A9" }, affiliations: ["Another Hospital"], roles: [], provenance: [{ provider: "openalex", source_id: "A9", url: "https://openalex.org/A9", retrieved_at: at, native_type: "authorship" }], review_status: "machine_assembled" };
    expect(reconcile([official, sameNameElsewhere], []).records).toHaveLength(2);
  });
});

describe("review boundary", () => {
  it("discovery-only trial edges cannot drive Research Connection Strength", async () => {
    const p = await preview();
    const trialEdges = p.links.filter((l) => /studies_condition|uses_outcome_measure|investigator_on|trial_/.test(l.relation)).map(toCandidateEdge).filter((e): e is NonNullable<typeof e> => !!e);
    expect(trialEdges.length).toBeGreaterThan(0);
    for (const e of trialEdges) expect(isReviewedEvidenceEdge(e)).toBe(false);
    // Forge a trial edge that would add a shared-study factor for MECP2 duplication if trusted.
    const forged = { ...b.edges.find((e) => e.id === "edge:mdd-in-nhs")!, id: "edge:disc:trial-forged", subject_id: "disease:mdd", object_id: "study:biobank", review_status: "machine_assembled" as const, eligible_for_ranking: false as const, eligible_for_action: false as const, source_type: "research_platform" as const, evidence_type: "machine_assembled" as const };
    expect(rankResearchConnections(b.nodes, [...b.edges, ...trialEdges, forged], "disease:cdd")).toEqual(rankResearchConnections(b.nodes, b.edges, "disease:cdd"));
  });

  it("discovery-only trial edges cannot drive the Research Action Brief", async () => {
    const p = await preview();
    for (const l of p.links) expect(l.eligible_for_action).toBe(false);
    const brief = b.action_brief!;
    const ids = [...brief.bring_sources.flatMap((s) => s.evidence_edge_ids), ...brief.existing_assets.flatMap((a) => a.evidence_edge_ids)];
    expect(ids.some((id) => id.startsWith("edge:disc:"))).toBe(false);
  });
});
