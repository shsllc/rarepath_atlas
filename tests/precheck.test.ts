import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { MultiProviderDiscoveryService, toCandidateEdge, type DiscoveryPreview } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { getItem, propose, recordToNode, savePrecheck, decide } from "@/lib/review/queue";
import { precheckInput, sanitize, type PrecheckBody } from "@/lib/review/precheck";
import { MemoryStore, setStore } from "@/lib/store";
import { researchRouter } from "./fixtures/research-http";

const ada = { id: "ada", name: "Ada Reviewer" };
const env = { REVIEWERS: process.env.REVIEWERS, SESSION_SECRET: process.env.SESSION_SECRET };
beforeEach(() => {
  setStore(new MemoryStore());
  process.env.REVIEWERS = `ada:Ada:${crypto.createHash("sha256").update("k").digest("hex")}`;
  process.env.SESSION_SECRET = "x".repeat(40);
});
afterEach(() => {
  setStore(null);
  setResearchFetch(null);
  clearClinGenCache();
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});

async function preview(): Promise<DiscoveryPreview> {
  setResearchFetch(researchRouter({}));
  const o = await new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }).preview("Dravet syndrome");
  if (o.kind !== "preview") throw new Error(o.kind);
  return o.preview;
}
function promotable(p: DiscoveryPreview, lead: boolean) {
  const rec = (k: string) => p.records.find((r) => r.key === k);
  return p.links.find((x) => x.discovery_lead === lead && toCandidateEdge(x) && rec(x.from) && rec(x.to) && recordToNode(rec(x.from)!) && recordToNode(rec(x.to)!))!;
}
const body = (o: Partial<PrecheckBody> = {}): PrecheckBody => ({ suggested_outcome: "supports", confidence: "high", note: "The source states it.", checks: [{ check: "named", passed: true, detail: "" }], basis: "structured_record", ...o });

describe("AI pre-check", () => {
  it("sends only the source's own material: no reviewer identity", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p, false).key, ada);
    const input = JSON.stringify(precheckInput(item));
    expect(input).not.toContain("Ada");
    expect(input).not.toContain("ada");
    expect(input).toContain(item.link.statement.slice(0, 30));
  });

  it("never suggests 'supports' for a navigation lead, and keeps notes short", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p, true).key, ada);
    const s = sanitize(body({ note: Array.from({ length: 90 }, () => "word").join(" ") }), item, new Date());
    expect(s.suggested_outcome).toBe("qualifies");
    expect(s.note.split(/\s+/).length).toBeLessThanOrEqual(61);
    expect(s.note.endsWith("…")).toBe(true);
  });

  it("is stored on pending items only and never decides", async () => {
    const p = await preview();
    const { item } = await propose(p, promotable(p, false).key, ada);
    await savePrecheck(item.id, { precheck: sanitize(body(), item, new Date()) });
    const after = (await getItem(item.id))!;
    expect(after.status).toBe("pending");
    expect(after.precheck?.suggested_outcome).toBe("supports");
    await decide(item.id, ada, { outcome: "rejected", note: "Not what the source says.", source_checked: false });
    expect(await savePrecheck(item.id, { error: "late" })).toBeNull();
    expect((await getItem(item.id))!.precheck_error).toBeUndefined();
  });
});
