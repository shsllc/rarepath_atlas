import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { MultiProviderDiscoveryService, toCandidateEdge, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { createSession, readSession, reviewEnabled, verifyAccessKey } from "@/lib/review/auth";
import { decide, getItem, listAudit, listItems, propose, recordToNode, reviewedOverlay, revoke, ReviewError } from "@/lib/review/queue";
import { sameOrigin } from "@/lib/review/http";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import { MemoryStore, setStore } from "@/lib/store";
import { clearReviewedGraphCache, reviewedGraph } from "@/lib/review/graph";
import { GraphSearchService } from "@/lib/services/search-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { buildJourney } from "@/lib/journey";
import { researchRouter } from "./fixtures/research-http";

const KEY = "test-access-key-not-a-secret";
const hash = crypto.createHash("sha256").update(KEY).digest("hex");
const env = { REVIEWERS: process.env.REVIEWERS, SESSION_SECRET: process.env.SESSION_SECRET };
const ada = { id: "ada", name: "Ada Reviewer" };
const bundleNodes = JsonGraphService.fromFile(REAL_BUNDLE).bundle().nodes;

beforeAll(() => {
  process.env.REVIEWERS = `ada:Ada Reviewer:${hash};bob:Bob:${"0".repeat(64)}`;
  process.env.SESSION_SECRET = "x".repeat(40);
});
afterAll(() => {
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});
beforeEach(() => {
  setStore(new MemoryStore());
  clearReviewedGraphCache();
});
afterEach(() => {
  setStore(null);
  setResearchFetch(null);
  clearClinGenCache();
});

async function preview(): Promise<DiscoveryPreview> {
  setResearchFetch(researchRouter({}));
  const o = await new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }).preview("Dravet syndrome");
  if (o.kind !== "preview") throw new Error(`expected preview, got ${o.kind}`);
  return o.preview;
}
/** A link that is promotable and whose two ends map to graph nodes. */
function promotable(p: DiscoveryPreview) {
  const rec = (k: string) => p.records.find((r) => r.key === k);
  const l = p.links.find((x) => {
    const a = rec(x.from), b = rec(x.to);
    return toCandidateEdge(x) && a && b && recordToNode(a) && recordToNode(b);
  });
  if (!l) throw new Error("fixture has no promotable link");
  return l;
}

describe("reviewer auth", () => {
  it("accepts the right key only, in constant time, and never for unknown ids", () => {
    expect(reviewEnabled()).toBe(true);
    expect(verifyAccessKey("ada", KEY)).toEqual(ada);
    expect(verifyAccessKey("ada", KEY + "x")).toBeNull();
    expect(verifyAccessKey("nobody", KEY)).toBeNull();
    expect(verifyAccessKey("ada", "")).toBeNull();
  });
  it("sessions are signed, expire, and are revoked when the reviewer is removed", () => {
    const now = Date.now();
    const t = createSession(ada, now);
    expect(readSession(t, now)).toEqual(ada);
    expect(readSession(t, now + 13 * 3_600_000)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "bob", exp: now + 1e6 })).toString("base64url");
    expect(readSession(`${forged}.${sig}`, now)).toBeNull();
    expect(readSession(`${payload}.${sig.slice(0, -2)}AA`, now)).toBeNull();
    const saved = process.env.REVIEWERS;
    process.env.REVIEWERS = `bob:Bob:${"0".repeat(64)}`;
    expect(readSession(t, now)).toBeNull();
    process.env.REVIEWERS = saved;
  });
  it("is disabled without a long enough session secret", () => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    expect(reviewEnabled()).toBe(false);
    expect(verifyAccessKey("ada", KEY)).toBeNull();
    process.env.SESSION_SECRET = saved;
  });
  it("refuses cross-site requests", () => {
    const req = (h: Record<string, string>) => new Request("https://rarepath.test/api/review/decide", { method: "POST", headers: h });
    expect(sameOrigin(req({ host: "rarepath.test", origin: "https://rarepath.test" }))).toBe(true);
    expect(sameOrigin(req({ host: "rarepath.test", origin: "https://evil.test" }))).toBe(false);
    expect(sameOrigin(req({ host: "rarepath.test" }))).toBe(false);
  });
});

describe("review queue", () => {
  it("only links present in the server-side preview can be proposed, and proposing is idempotent", async () => {
    const p = await preview();
    await expect(propose(p, "made-up-link", ada)).rejects.toBeInstanceOf(ReviewError);
    const l = promotable(p);
    const a = await propose(p, l.key, ada);
    const b = await propose(p, l.key, ada);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.item.id).toBe(a.item.id);
    expect((await listItems("pending")).map((i) => i.id)).toEqual([a.item.id]);
    expect((await listAudit()).map((e) => e.action)).toEqual(["proposed"]);
  });

  it("nothing reaches the reviewed graph without a checked source, a confidence and (when needed) a note", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p).key, ada);
    await expect(decide(item.id, ada, { outcome: "supports", confidence: "high", note: "", source_checked: false })).rejects.toThrow(/source/i);
    await expect(decide(item.id, ada, { outcome: "supports", note: "", source_checked: true })).rejects.toThrow(/confidence/i);
    await expect(decide(item.id, ada, { outcome: "qualifies", confidence: "low", note: "", source_checked: true })).rejects.toThrow(/note/i);
    await expect(decide(item.id, ada, { outcome: "rejected", note: "", source_checked: false })).rejects.toThrow(/note/i);
    expect((await reviewedOverlay()).edges).toHaveLength(0);
    expect((await getItem(item.id))!.status).toBe("pending");
  });

  it("an accepted claim becomes a reviewed edge that passes the evidence gate; revoking removes it", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p).key, ada);
    const done = await decide(item.id, ada, { outcome: "supports", confidence: "moderate", note: "Checked the record.", source_checked: true }, bundleNodes);
    expect(done.status).toBe("accepted");
    await expect(decide(item.id, ada, { outcome: "rejected", note: "again", source_checked: false })).rejects.toThrow(/already/);

    const { edges, nodes } = await reviewedOverlay();
    expect(edges).toHaveLength(1);
    const e = edges[0];
    expect(e.id).toBe(`edge:rev:${item.id}`);
    expect(e.review).toMatchObject({ by: "ada", outcome: "supports", source_checked: true });
    expect(isReviewedEvidenceEdge(e)).toBe(true);
    const ids = new Set([...bundleNodes, ...nodes].map((n) => n.id));
    expect(ids.has(e.subject_id) && ids.has(e.object_id)).toBe(true);

    await expect(revoke(item.id, ada, "")).rejects.toThrow(/note/i);
    await revoke(item.id, ada, "Source was retracted.");
    expect((await reviewedOverlay()).edges).toHaveLength(0);
    expect((await getItem(item.id))!.status).toBe("revoked");
    expect((await listAudit()).map((e) => e.action)).toEqual(["revoked", "accepted", "proposed"]);
  });

  it("a rejected claim writes no edge", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p).key, ada);
    await decide(item.id, ada, { outcome: "rejected", note: "Co-occurrence only.", source_checked: false });
    expect((await reviewedOverlay()).edges).toHaveLength(0);
    expect((await listItems("rejected"))).toHaveLength(1);
  });

  it("the gate refuses edges that merely claim to be reviewed", async () => {
    const p = await preview();
    const c = toCandidateEdge(promotable(p))!;
    const forged = { ...c, id: "edge:rev:forged", review_status: "reviewed" as const, eligible_for_ranking: true as const, eligible_for_action: true as const };
    expect(isReviewedEvidenceEdge(forged as never)).toBe(false);
    expect(isReviewedEvidenceEdge({ ...forged, id: "edge:x:1" } as never)).toBe(false);
  });
});

describe("reviewed journeys", () => {
  it("an accepted claim gives its disease a reviewed journey, with discovery kept separate", async () => {
    const p = await preview();
    const l = promotable(p);
    const { item } = await propose(p, l.key, ada);
    const base = JsonGraphService.fromFile(REAL_BUNDLE);
    await decide(item.id, ada, { outcome: "supports", confidence: "high", note: "Checked.", source_checked: true }, base.bundle().nodes);

    setResearchFetch(researchRouter({}));
    const discovery = new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") });
    const search = new GraphSearchService(base, new CuratedReusableAssetFinder(base), discovery, () => reviewedGraph(base));
    const r = await search.search("Dravet syndrome");
    if (!("partial" in r)) throw new Error(`expected a reviewed journey, got ${JSON.stringify(Object.keys(r))}`);
    expect(r.journey.facts.map((f) => f.edge_id)).toContain(`edge:rev:${item.id}`);
    expect(r.journey.facts[0].review?.by_name).toBe("Ada Reviewer");
    expect(r.preview?.disease.label).toBeTruthy();
    for (const e of r.edges) expect(isReviewedEvidenceEdge(e), e.id).toBe(true);

    await revoke(item.id, ada, "Withdrawn for test.");
    const after = await search.search("Dravet syndrome");
    expect("partial" in after).toBe(false);
  });

  it("the generated brief cites only reviewed edges and never claims a shared mechanism or treatment", () => {
    const b = JsonGraphService.fromFile(REAL_BUNDLE).bundle();
    const rett = b.nodes.find((n) => n.type === "Disease" && /rett/i.test(n.label) && n.id !== b.focus_disease_id)!;
    const j = buildJourney(b, rett.id);
    const edges = new Map(b.edges.map((e) => [e.id, e]));
    for (const x of j.ranked) for (const f of x.factors) for (const id of f.evidence_edge_ids) expect(isReviewedEvidenceEdge(edges.get(id)!)).toBe(true);
    if (j.brief) {
      expect(j.brief.does_not_mean.join(" ")).toMatch(/not shown to be the same disease/);
      expect(j.brief.does_not_mean.join(" ")).toMatch(/No treatment/);
      expect(j.brief.bring_sources.length).toBeGreaterThan(0);
      for (const id of j.brief.edge_ids) expect(isReviewedEvidenceEdge(edges.get(id)!)).toBe(true);
    } else expect(j.brief_blocker).toBeTruthy();
  });
});
