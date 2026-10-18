import { describe, expect, it } from "vitest";
import { route, LIMITS, type Claims, type Db, type Item } from "../infra/lambda/core";

class MemDb implements Db {
  m = new Map<string, Item>();
  k = (pk: string, sk: string) => `${pk}\u0000${sk}`;
  async get(pk: string, sk: string) {
    const v = this.m.get(this.k(pk, sk));
    return v ? { ...v } : null;
  }
  async put(item: Item, opts?: { ifNotExists?: boolean }) {
    if (opts?.ifNotExists && this.m.has(this.k(item.pk, item.sk))) return false;
    this.m.set(this.k(item.pk, item.sk), { ...item });
    return true;
  }
  async delete(pk: string, sk: string) {
    this.m.delete(this.k(pk, sk));
  }
  async query(pk: string, prefix = "") {
    return [...this.m.values()].filter((i) => i.pk === pk && i.sk.startsWith(prefix)).map((i) => ({ ...i }));
  }
  async increment(pk: string, sk: string, field: string, n: number, set: Record<string, unknown> = {}) {
    const cur = (await this.get(pk, sk)) ?? { pk, sk };
    const next = Number(cur[field] ?? 0) + n;
    await this.put({ ...cur, ...set, [field]: next });
    return next;
  }
}

const user = (sub: string, email: string, extra: Partial<Claims> = {}): Claims => ({ sub, email, email_verified: true, name: sub.toUpperCase(), groups: [], ...extra });
const ADA = user("ada", "ada@example.org");
const BOB = user("bob", "bob@example.org");
const CY = user("cy", "cy@example.org");
const NOW = new Date("2026-10-18T12:00:00Z");

function api(db: Db) {
  return (claims: Claims, method: string, path: string, body?: unknown, now = NOW) => route({ claims, method, path, body }, db, now);
}

describe("accounts API", () => {
  it("/me creates a profile with a private random watch key and reports usage", async () => {
    const call = api(new MemDb());
    const r = await call(ADA, "GET", "/me");
    expect(r.status).toBe(200);
    const me = r.body as { email: string; watch_key: string; orgs: unknown[]; usage_today: Record<string, number>; curator: boolean };
    expect(me.email).toBe("ada@example.org");
    expect(me.watch_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(me.orgs).toEqual([]);
    expect(me.usage_today).toEqual({ discovery_search: 0, explanation: 0 });
    expect(me.curator).toBe(false);
    // The key is stable across calls.
    expect(((await call(ADA, "GET", "/me")).body as { watch_key: string }).watch_key).toBe(me.watch_key);
    expect(((await call(user("z", "z@x.org", { groups: ["curators"] }), "GET", "/me")).body as { curator: boolean }).curator).toBe(true);
  });

  it("creating an organisation makes the creator its owner; unverified emails cannot", async () => {
    const call = api(new MemDb());
    expect((await call({ ...ADA, email_verified: false }, "POST", "/orgs", { name: "CDKL5 Alliance" })).status).toBe(403);
    expect((await call(ADA, "POST", "/orgs", { name: " " })).status).toBe(400);
    const r = await call(ADA, "POST", "/orgs", { name: "CDKL5 <b>Alliance</b>" });
    expect(r.status).toBe(201);
    const org = r.body as { id: string; name: string; role: string };
    expect(org.name).toBe("CDKL5 bAlliance/b");
    expect(org.role).toBe("owner");
    const me = (await call(ADA, "GET", "/me")).body as { orgs: { id: string; role: string }[] };
    expect(me.orgs).toEqual([{ id: org.id, name: org.name, role: "owner" }]);
  });

  it("non-members cannot see or change an organisation", async () => {
    const call = api(new MemDb());
    const { id } = (await call(ADA, "POST", "/orgs", { name: "Org" })).body as { id: string };
    expect((await call(BOB, "GET", `/orgs/${id}`)).status).toBe(404);
    expect((await call(BOB, "POST", `/orgs/${id}/invites`, { email: "bob@example.org" })).status).toBe(404);
  });

  it("invitations are bound to an email address and single-use", async () => {
    const call = api(new MemDb());
    const { id } = (await call(ADA, "POST", "/orgs", { name: "Org" })).body as { id: string };
    const inv = (await call(ADA, "POST", `/orgs/${id}/invites`, { email: "Bob@Example.org", role: "reviewer" })).body as { token: string };
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await call(CY, "POST", `/invites/${inv.token}/accept`)).status).toBe(403);
    expect((await call({ ...BOB, email_verified: false }, "POST", `/invites/${inv.token}/accept`)).status).toBe(403);
    const ok = await call(BOB, "POST", `/invites/${inv.token}/accept`);
    expect(ok.body).toMatchObject({ org_id: id, role: "reviewer" });
    expect((await call(BOB, "POST", `/invites/${inv.token}/accept`)).status).toBe(404);
    const org = (await call(BOB, "GET", `/orgs/${id}`)).body as { your_role: string; members: { sub: string; role: string }[] };
    expect(org.your_role).toBe("reviewer");
    expect(org.members.map((m) => m.sub).sort()).toEqual(["ada", "bob"]);
  });

  it("invitations expire", async () => {
    const call = api(new MemDb());
    const { id } = (await call(ADA, "POST", "/orgs", { name: "Org" })).body as { id: string };
    const { token } = (await call(ADA, "POST", `/orgs/${id}/invites`, { email: "bob@example.org" })).body as { token: string };
    const later = new Date(NOW.getTime() + (LIMITS.inviteDays + 1) * 86_400_000);
    expect((await call(BOB, "POST", `/invites/${token}/accept`, undefined, later)).status).toBe(404);
  });

  it("only owners manage owners and admins, and the last owner cannot leave", async () => {
    const db = new MemDb();
    const call = api(db);
    const { id } = (await call(ADA, "POST", "/orgs", { name: "Org" })).body as { id: string };
    const join = async (c: Claims, role: string) => {
      const { token } = (await call(ADA, "POST", `/orgs/${id}/invites`, { email: c.email, role })).body as { token: string };
      await call(c, "POST", `/invites/${token}/accept`);
    };
    await join(BOB, "admin");
    await join(CY, "member");
    // An admin cannot invite admins, promote to admin, or touch the owner.
    expect((await call(BOB, "POST", `/orgs/${id}/invites`, { email: "d@x.org", role: "admin" })).status).toBe(403);
    expect((await call(BOB, "PATCH", `/orgs/${id}/members/cy`, { role: "admin" })).status).toBe(403);
    expect((await call(BOB, "DELETE", `/orgs/${id}/members/ada`)).status).toBe(403);
    // An admin can make someone a reviewer; a member cannot change roles.
    expect((await call(BOB, "PATCH", `/orgs/${id}/members/cy`, { role: "reviewer" })).status).toBe(200);
    expect((await call(CY, "PATCH", `/orgs/${id}/members/bob`, { role: "member" })).status).toBe(403);
    // The only owner can neither leave nor demote themselves.
    expect((await call(ADA, "DELETE", `/orgs/${id}/members/ada`)).status).toBe(409);
    expect((await call(ADA, "PATCH", `/orgs/${id}/members/ada`, { role: "admin" })).status).toBe(409);
    // After promoting Bob to owner, Ada can leave.
    expect((await call(ADA, "PATCH", `/orgs/${id}/members/bob`, { role: "owner" })).status).toBe(200);
    expect((await call(ADA, "DELETE", `/orgs/${id}/members/ada`)).status).toBe(200);
    expect((await call(ADA, "GET", `/orgs/${id}`)).status).toBe(404);
    // Anyone may leave on their own.
    expect((await call(CY, "DELETE", `/orgs/${id}/members/cy`)).status).toBe(200);
  });

  it("caps organisations per user", async () => {
    const call = api(new MemDb());
    for (let i = 0; i < LIMITS.orgsPerUser; i++) expect((await call(ADA, "POST", "/orgs", { name: `Org ${i}` })).status).toBe(201);
    expect((await call(ADA, "POST", "/orgs", { name: "One more" })).status).toBe(409);
  });

  it("counts usage per user per day for known units only", async () => {
    const call = api(new MemDb());
    expect((await call(ADA, "POST", "/usage", { unit: "discovery_search" })).body).toMatchObject({ count: 1, day: "2026-10-18" });
    expect((await call(ADA, "POST", "/usage", { unit: "discovery_search" })).body).toMatchObject({ count: 2 });
    expect((await call(ADA, "POST", "/usage", { unit: "anything" })).status).toBe(400);
    expect(((await call(ADA, "GET", "/me")).body as { usage_today: Record<string, number> }).usage_today.discovery_search).toBe(2);
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(((await call(ADA, "GET", "/me", undefined, tomorrow)).body as { usage_today: Record<string, number> }).usage_today.discovery_search).toBe(0);
  });

  it("unknown routes and missing identity are refused", async () => {
    const call = api(new MemDb());
    expect((await call(ADA, "GET", "/admin")).status).toBe(404);
    expect((await call({ sub: "", groups: [] }, "GET", "/me")).status).toBe(401);
    expect((await call(ADA, "GET", "/orgs/../../etc")).status).toBe(404);
  });
});

describe("account deletion", () => {
  it("removes the profile, memberships and usage; a sole owner must hand over first", async () => {
    const db = new MemDb();
    const call = api(db);
    await call(ADA, "GET", "/me");
    const solo = (await call(ADA, "POST", "/orgs", { name: "Solo" })).body as { id: string };
    const shared = (await call(ADA, "POST", "/orgs", { name: "Shared" })).body as { id: string };
    const { token } = (await call(ADA, "POST", `/orgs/${shared.id}/invites`, { email: BOB.email })).body as { token: string };
    await call(BOB, "POST", `/invites/${token}/accept`);
    await call(ADA, "POST", "/usage", { unit: "explanation" });
    expect((await call(ADA, "DELETE", "/me")).status).toBe(409);
    await call(ADA, "PATCH", `/orgs/${shared.id}/members/bob`, { role: "owner" });
    expect((await call(ADA, "DELETE", "/me")).status).toBe(200);
    const left = [...db.m.values()].filter((i) => JSON.stringify(i).includes("ada"));
    expect(left).toEqual([]);
    expect(await db.get(`ORG#${solo.id}`, "META")).toBeNull();
    expect(((await call(BOB, "GET", `/orgs/${shared.id}`)).body as { members: unknown[] }).members).toHaveLength(1);
  });
});
