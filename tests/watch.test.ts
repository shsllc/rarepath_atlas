import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { MemoryStore, getStore, setStore } from "@/lib/store";
import { addWatch, diff, feedToken, forgetAll, listWatches, markSeen, MAX_WATCHES, newWatchKey, registerFeed, snapshotOf, validKey, watcherForFeed, watcherId, type Snapshot } from "@/lib/watch";
import { allow } from "@/lib/watch/limit";
import { researchRouter } from "./fixtures/research-http";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const search = () => {
  setResearchFetch(researchRouter({}));
  return new GraphSearchService(g, new CuratedReusableAssetFinder(g), new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }));
};

beforeEach(() => setStore(new MemoryStore()));
afterEach(() => {
  setStore(null);
  setResearchFetch(null);
  clearClinGenCache();
});

describe("watch snapshots", () => {
  it("a discovery result yields papers, preprints, studies and NIH projects, kept apart", async () => {
    const snap = snapshotOf(await search().search("Dravet syndrome"))!;
    expect(snap.label).toBe("Dravet syndrome");
    const s = snap.snapshot;
    expect(s.papers.length).toBeGreaterThan(0);
    expect(s.preprints.length).toBeGreaterThan(0);
    expect(s.studies.length).toBeGreaterThan(0);
    expect(s.grants.map((x) => x.key)).toEqual(["grant:R01NS000001", "grant:R21NS000002"]);
    const preprintKeys = new Set(s.preprints.map((x) => x.key));
    for (const p of s.papers) expect(preprintKeys.has(p.key), p.key).toBe(false);
    expect(s.reviewed).toHaveLength(0);
  });

  it("the reviewed CDKL5 journey yields only reviewed relationships, with readable labels", async () => {
    const snap = snapshotOf(await search().search("CDKL5"))!;
    expect(snap.snapshot.reviewed.length).toBeGreaterThan(10);
    expect(snap.snapshot.reviewed[0].label).not.toMatch(/^edge:/);
    expect(snap.snapshot.papers).toHaveLength(0);
  });
});

describe("watchlists", () => {
  const snap = (keys: Partial<Record<keyof Snapshot, string[]>>): Snapshot => ({
    reviewed: (keys.reviewed ?? []).map((k) => ({ key: k, label: k })),
    papers: (keys.papers ?? []).map((k) => ({ key: k, label: k })),
    preprints: (keys.preprints ?? []).map((k) => ({ key: k, label: k })),
    studies: (keys.studies ?? []).map((k) => ({ key: k, label: k })),
    grants: (keys.grants ?? []).map((k) => ({ key: k, label: k })),
  });

  it("keys are random and only their hash is stored", async () => {
    const key = newWatchKey();
    expect(validKey(key)).toBe(true);
    expect(validKey("short")).toBe(false);
    await addWatch(key, "Dravet syndrome", { label: "Dravet syndrome", snapshot: snap({ papers: ["p1"] }) });
    const stored = await getStore().list("watch/");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toContain(watcherId(key));
    expect(stored.join(" ")).not.toContain(key);
  });

  it("what's new is the difference from what was seen, and marking as seen clears it", async () => {
    const key = newWatchKey();
    const w = await addWatch(key, "Dravet syndrome", { label: "Dravet syndrome", snapshot: snap({ papers: ["p1"], studies: ["s1"] }) });
    const now = snap({ papers: ["p1", "p2"], studies: ["s1"], grants: ["g1"], reviewed: ["edge:rev:1"] });
    const d = diff(w, now);
    expect(d.total_new).toBe(3);
    expect(d.new_items.papers.map((x) => x.key)).toEqual(["p2"]);
    expect(d.new_items.reviewed.map((x) => x.key)).toEqual(["edge:rev:1"]);
    const seen = await markSeen(key, "Dravet syndrome", now);
    expect(diff(seen, now).total_new).toBe(0);
    // Items that later drop out of the results stay seen, so they never come back as "new".
    expect(diff(seen, snap({ papers: ["p1"] })).total_new).toBe(0);
  });

  it("adding the same search twice is idempotent, and the list is capped", async () => {
    const key = newWatchKey();
    const cur = { label: "x", snapshot: snap({}) };
    await addWatch(key, "Dravet  syndrome", cur);
    await addWatch(key, "dravet syndrome", cur);
    expect(await listWatches(key)).toHaveLength(1);
    for (let i = 1; i < MAX_WATCHES; i++) await addWatch(key, `disease ${i}`, cur);
    await expect(addWatch(key, "one too many", cur)).rejects.toThrow(/up to/);
  });

  it("watchlists are isolated per browser key", async () => {
    const a = newWatchKey();
    const b = newWatchKey();
    await addWatch(a, "Dravet syndrome", { label: "x", snapshot: snap({}) });
    expect(await listWatches(b)).toHaveLength(0);
  });

  it("the feed token is read-only: it resolves to the watcher but is not the browser key", async () => {
    const key = newWatchKey();
    await addWatch(key, "Dravet syndrome", { label: "x", snapshot: snap({}) });
    await registerFeed(key);
    const token = feedToken(key);
    expect(token).not.toBe(key);
    expect(await watcherForFeed(token)).toBe(watcherId(key));
    expect(await watcherForFeed(key)).toBeNull();
    await forgetAll(key);
    expect(await listWatches(key)).toHaveLength(0);
    expect(await watcherForFeed(token)).toBeNull();
  });

  it("the limiter allows a burst, then refuses until the minute passes", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allow("k", 3, t + i)).toBe(true);
    expect(allow("k", 3, t + 10)).toBe(false);
    expect(allow("k", 3, t + 61_000)).toBe(true);
  });
});
