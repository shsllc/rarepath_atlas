import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore, getStore, setStore } from "@/lib/store";
import { addWatch, newWatchKey, type Snapshot } from "@/lib/watch";
import { confirmSent, DIGEST_INTERVAL_MS, getDigest, prepareDigests, renderDigest, setDigest, unsubscribe } from "@/lib/watch/digest";
import { cronAuthorized, refreshTargets, SEED_DISEASES } from "@/lib/cron";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import type { SearchResponse } from "@/lib/schemas";

const NOW = new Date("2026-10-21T10:00:00Z");
const snap = (papers: string[]): Snapshot => ({ reviewed: [], papers: papers.map((k) => ({ key: k, label: `Paper ${k}`, url: `https://example.org/${k}` })), preprints: [], studies: [], grants: [] });
const account = { sub: "u1", email: "parent@example.org", emailVerified: true };
const env = process.env.CRON_SECRET;

beforeEach(() => setStore(new MemoryStore()));
afterEach(() => {
  setStore(null);
  if (env === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = env;
});

// A fake search that returns a discovery-shaped result whose snapshot holds the given papers.
const searchWith = (papers: string[]) => async (q: string): Promise<SearchResponse> =>
  ({
    query: q,
    found: false,
    discovery: true,
    full_journey: { label: "x", query: "x" },
    preview: { disease: { label: q }, literature: { top: papers.map((k) => ({ key: k, label: `Paper ${k}`, url: `https://example.org/${k}`, authors: [], ids: {} })), most_cited: [], recent: [], preprints: [] }, clinical: { studies: [] }, funding: { projects: [] } },
  }) as unknown as SearchResponse;

describe("weekly digests", () => {
  it("are opt-in, need a verified email, and start from what the watchlist has already seen", async () => {
    const key = newWatchKey();
    const w = await addWatch(key, "Dravet syndrome", { label: "Dravet syndrome", snapshot: snap(["p1"]) }, NOW);
    await expect(setDigest(key, { ...account, emailVerified: false }, true, [w], NOW)).rejects.toThrow(/Confirm/);
    expect(await getDigest(key)).toBeNull();
    await setDigest(key, account, true, [w], NOW);
    const emails = await prepareDigests(searchWith(["p1", "p2"]), "https://site.test", NOW);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("parent@example.org");
    expect(emails[0].text).toContain("Paper p2");
    expect(emails[0].text).not.toContain("Paper p1");
    expect(emails[0].subject).toBe("New research: Dravet syndrome");
    expect(emails[0].html).toContain("/api/watch/unsubscribe?t=");
  });

  it("only confirmed sends advance; nothing new means no email; and they wait a week", async () => {
    const key = newWatchKey();
    const w = await addWatch(key, "Dravet syndrome", { label: "Dravet syndrome", snapshot: snap([]) }, NOW);
    await setDigest(key, account, true, [w], NOW);
    const first = await prepareDigests(searchWith(["p1"]), "https://site.test", NOW);
    expect(first).toHaveLength(1);
    // Not confirmed: the same item is prepared again on the next run.
    expect(await prepareDigests(searchWith(["p1"]), "https://site.test", NOW)).toHaveLength(1);
    expect(await confirmSent([first[0].id], NOW)).toBe(1);
    // Confirmed: nothing more until a week has passed, then only genuinely new items.
    expect(await prepareDigests(searchWith(["p1", "p2"]), "https://site.test", new Date(NOW.getTime() + 86_400_000))).toHaveLength(0);
    const later = new Date(NOW.getTime() + DIGEST_INTERVAL_MS + 1);
    const next = await prepareDigests(searchWith(["p1", "p2"]), "https://site.test", later);
    expect(next[0].text).toContain("Paper p2");
    expect(next[0].text).not.toContain("Paper p1");
    await confirmSent([next[0].id], later);
    const quiet = new Date(later.getTime() + DIGEST_INTERVAL_MS + 1);
    expect(await prepareDigests(searchWith(["p1", "p2"]), "https://site.test", quiet)).toHaveLength(0);
  });

  it("one-click unsubscribe stops digests; a bad token does nothing", async () => {
    const key = newWatchKey();
    const w = await addWatch(key, "Dravet syndrome", { label: "x", snapshot: snap([]) }, NOW);
    const rec = await setDigest(key, account, true, [w], NOW);
    expect(await unsubscribe("A".repeat(32))).toBe(false);
    expect(await unsubscribe(rec.token)).toBe(true);
    expect((await getDigest(key))!.enabled).toBe(false);
    expect(await prepareDigests(searchWith(["p9"]), "https://site.test", NOW)).toHaveLength(0);
  });

  it("emails label discovery items as not reviewed and escape what they show", () => {
    const r = renderDigest([{ label: "<b>X</b>", query: "x", items: { papers: [{ key: "k", label: 'A "quoted" <title>', url: "https://example.org/a" }] } }], "https://site.test", "https://site.test/u");
    expect(r.total).toBe(1);
    expect(r.html).not.toContain("<b>X</b>");
    expect(r.html).toContain("&lt;title&gt;");
    expect(r.text).toContain("gathered automatically, not reviewed");
    expect(r.text).toContain("not medical advice");
  });
});

describe("nightly job endpoints", () => {
  const req = (secret?: string) => new Request("https://site.test/api/cron/targets", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
  it("refuse without a long, matching secret", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(req("anything"))).toBe(false);
    process.env.CRON_SECRET = "short";
    expect(cronAuthorized(req("short"))).toBe(false);
    process.env.CRON_SECRET = "s".repeat(48);
    expect(cronAuthorized(req())).toBe(false);
    expect(cronAuthorized(req("t".repeat(48)))).toBe(false);
    expect(cronAuthorized(req("s".repeat(48)))).toBe(true);
  });

  it("targets combine seed diseases, bundle diseases (not the focus) and watched searches", async () => {
    const b = JsonGraphService.fromFile(REAL_BUNDLE).bundle();
    await addWatch(newWatchKey(), "Alport syndrome", { label: "Alport syndrome", snapshot: snap([]) }, NOW);
    const t = await refreshTargets(b);
    expect(t).toEqual(expect.arrayContaining([SEED_DISEASES[0], "Rett syndrome", "Alport syndrome"]));
    expect(t).not.toContain(b.nodes.find((n) => n.id === b.focus_disease_id)!.label);
    expect(await getStore().list("digest/")).toEqual([]);
  });
});
