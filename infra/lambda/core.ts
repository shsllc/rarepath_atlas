/**
 * Accounts API core: profiles, organisations, memberships, invitations and usage counters.
 *
 * Pure logic over a small `Db` interface, so it is unit-tested without AWS. The Lambda adapter
 * (handler.ts) supplies DynamoDB and the caller's verified Cognito ID-token claims; API Gateway's JWT
 * authorizer has already checked the token's signature, issuer, audience and expiry.
 *
 * Single-table keys:
 *   USER#<sub>        PROFILE                  email, name, created_at, plan, watch_key
 *   USER#<sub>        ORG#<orgId>              role, org_name            (a user's organisations)
 *   ORG#<orgId>       META                     name, created_by, created_at, plan
 *   ORG#<orgId>       MEMBER#<sub>             role, email, name, joined_at
 *   INVITE#<token>    META                     org_id, org_name, email, role, invited_by, ttl
 *   USAGE#<sub>       DAY#<yyyy-mm-dd>#<unit>  count, ttl
 */
import crypto from "node:crypto";

export type Role = "owner" | "admin" | "reviewer" | "member";
export const ROLES: Role[] = ["owner", "admin", "reviewer", "member"];
const RANK: Record<Role, number> = { owner: 3, admin: 2, reviewer: 1, member: 0 };
export const USAGE_UNITS = ["discovery_search", "explanation"] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export const LIMITS = { orgsPerUser: 5, membersPerOrg: 50, inviteDays: 14, usageTtlDays: 40, nameMax: 80 };

export type Item = Record<string, unknown> & { pk: string; sk: string };

export interface Db {
  get(pk: string, sk: string): Promise<Item | null>;
  /** Returns false when `ifNotExists` is set and the item already exists. */
  put(item: Item, opts?: { ifNotExists?: boolean }): Promise<boolean>;
  delete(pk: string, sk: string): Promise<void>;
  query(pk: string, skPrefix?: string): Promise<Item[]>;
  /** Atomically add `n` to a numeric field (creating the item), returning the new value. */
  increment(pk: string, sk: string, field: string, n: number, set?: Record<string, unknown>): Promise<number>;
}

export interface Claims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  groups: string[];
}

export interface Req {
  method: string;
  path: string;
  claims: Claims;
  body: unknown;
}
export interface Res {
  status: number;
  body: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ok = (body: unknown, status = 200): Res => ({ status, body });
const verified = (c: Claims) => c.email_verified === true || c.email_verified === "true";
const day = (now: Date) => now.toISOString().slice(0, 10);
const ttlIn = (now: Date, days: number) => Math.floor(now.getTime() / 1000) + days * 86_400;
const cleanName = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, LIMITS.nameMax);
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {});
const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

async function profile(db: Db, c: Claims, now: Date) {
  const pk = `USER#${c.sub}`;
  const existing = await db.get(pk, "PROFILE");
  if (existing && existing.email === c.email && (existing.name ?? "") === (c.name ?? "")) return existing;
  const item: Item = {
    pk,
    sk: "PROFILE",
    email: c.email ?? "",
    name: c.name ?? "",
    created_at: (existing?.created_at as string) ?? now.toISOString(),
    plan: (existing?.plan as string) ?? "free",
    // Random per-user key for the watchlist and its private feed (never derived from the user id).
    watch_key: (existing?.watch_key as string) ?? crypto.randomBytes(32).toString("base64url"),
  };
  await db.put(item);
  return item;
}

async function membership(db: Db, orgId: string, sub: string): Promise<Role | null> {
  const m = await db.get(`ORG#${orgId}`, `MEMBER#${sub}`);
  return m && isRole(m.role) ? m.role : null;
}

async function requireRole(db: Db, orgId: string, c: Claims, min: Role): Promise<Role> {
  if (!/^[a-f0-9]{16}$/.test(orgId)) throw new ApiError(404, "Organisation not found.");
  const role = await membership(db, orgId, c.sub);
  if (!role) throw new ApiError(404, "Organisation not found.");
  if (RANK[role] < RANK[min]) throw new ApiError(403, "Your role in this organisation does not allow that.");
  return role;
}

async function me(db: Db, c: Claims, now: Date) {
  const p = await profile(db, c, now);
  const orgs = (await db.query(`USER#${c.sub}`, "ORG#")).map((m) => ({ id: String(m.sk).slice(4), name: m.org_name, role: m.role }));
  const usage = Object.fromEntries(
    await Promise.all(USAGE_UNITS.map(async (u) => [u, Number((await db.get(`USAGE#${c.sub}`, `DAY#${day(now)}#${u}`))?.count ?? 0)] as const)),
  );
  return { sub: c.sub, email: p.email, name: p.name, plan: p.plan, watch_key: p.watch_key, curator: c.groups.includes("curators"), orgs, usage_today: usage };
}

async function createOrg(db: Db, c: Claims, body: unknown, now: Date) {
  if (!verified(c)) throw new ApiError(403, "Verify your email address first.");
  const name = cleanName(obj(body).name);
  if (name.length < 2) throw new ApiError(400, "Give the organisation a name.");
  const mine = await db.query(`USER#${c.sub}`, "ORG#");
  if (mine.length >= LIMITS.orgsPerUser) throw new ApiError(409, `You can belong to at most ${LIMITS.orgsPerUser} organisations.`);
  const id = crypto.randomBytes(8).toString("hex");
  const at = now.toISOString();
  await db.put({ pk: `ORG#${id}`, sk: "META", name, created_by: c.sub, created_at: at, plan: "free" });
  await db.put({ pk: `ORG#${id}`, sk: `MEMBER#${c.sub}`, role: "owner", email: c.email ?? "", name: c.name ?? "", joined_at: at });
  await db.put({ pk: `USER#${c.sub}`, sk: `ORG#${id}`, role: "owner", org_name: name });
  return ok({ id, name, role: "owner" }, 201);
}

async function getOrg(db: Db, c: Claims, orgId: string) {
  const role = await requireRole(db, orgId, c, "member");
  const meta = await db.get(`ORG#${orgId}`, "META");
  const members = (await db.query(`ORG#${orgId}`, "MEMBER#")).map((m) => ({ sub: String(m.sk).slice(7), email: m.email, name: m.name, role: m.role, joined_at: m.joined_at }));
  return ok({ id: orgId, name: meta?.name, plan: meta?.plan ?? "free", your_role: role, members });
}

async function invite(db: Db, c: Claims, orgId: string, body: unknown, now: Date) {
  const myRole = await requireRole(db, orgId, c, "admin");
  const b = obj(body);
  const email = String(b.email ?? "").trim().toLowerCase();
  const role = b.role ?? "member";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ApiError(400, "Enter a valid email address.");
  if (!isRole(role) || role === "owner") throw new ApiError(400, "Choose admin, reviewer or member.");
  if (role === "admin" && myRole !== "owner") throw new ApiError(403, "Only an owner can invite admins.");
  if ((await db.query(`ORG#${orgId}`, "MEMBER#")).length >= LIMITS.membersPerOrg) throw new ApiError(409, `An organisation can have up to ${LIMITS.membersPerOrg} members.`);
  const meta = await db.get(`ORG#${orgId}`, "META");
  const token = crypto.randomBytes(24).toString("base64url");
  await db.put({ pk: `INVITE#${token}`, sk: "META", org_id: orgId, org_name: meta?.name ?? "", email, role, invited_by: c.sub, created_at: now.toISOString(), ttl: ttlIn(now, LIMITS.inviteDays) });
  return ok({ token, email, role, expires_in_days: LIMITS.inviteDays }, 201);
}

async function getInvite(db: Db, token: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new ApiError(404, "This invitation is not valid.");
  const inv = await db.get(`INVITE#${token}`, "META");
  if (!inv || Number(inv.ttl) < now.getTime() / 1000) throw new ApiError(404, "This invitation has expired or was already used.");
  return inv;
}

async function acceptInvite(db: Db, c: Claims, token: string, now: Date) {
  const inv = await getInvite(db, token, now);
  if (!verified(c) || (c.email ?? "").toLowerCase() !== inv.email) throw new ApiError(403, `This invitation was sent to ${String(inv.email)}. Sign in with that address to accept it.`);
  const orgId = String(inv.org_id);
  const role = isRole(inv.role) ? inv.role : "member";
  const existing = await membership(db, orgId, c.sub);
  if (!existing || RANK[role] > RANK[existing]) {
    if (!existing && (await db.query(`USER#${c.sub}`, "ORG#")).length >= LIMITS.orgsPerUser) throw new ApiError(409, `You can belong to at most ${LIMITS.orgsPerUser} organisations.`);
    await db.put({ pk: `ORG#${orgId}`, sk: `MEMBER#${c.sub}`, role, email: c.email ?? "", name: c.name ?? "", joined_at: now.toISOString() });
    await db.put({ pk: `USER#${c.sub}`, sk: `ORG#${orgId}`, role, org_name: inv.org_name });
  }
  await db.delete(`INVITE#${token}`, "META");
  return ok({ org_id: orgId, org_name: inv.org_name, role: existing && RANK[existing] >= RANK[role] ? existing : role });
}

async function owners(db: Db, orgId: string) {
  return (await db.query(`ORG#${orgId}`, "MEMBER#")).filter((m) => m.role === "owner").length;
}

async function setRole(db: Db, c: Claims, orgId: string, sub: string, body: unknown) {
  const myRole = await requireRole(db, orgId, c, "admin");
  const role = obj(body).role;
  if (!isRole(role)) throw new ApiError(400, "Unknown role.");
  const current = await membership(db, orgId, sub);
  if (!current) throw new ApiError(404, "That person is not a member.");
  if ((role === "owner" || current === "owner" || role === "admin") && myRole !== "owner") throw new ApiError(403, "Only an owner can change owners or admins.");
  if (current === "owner" && role !== "owner" && (await owners(db, orgId)) <= 1) throw new ApiError(409, "An organisation needs at least one owner.");
  const m = (await db.get(`ORG#${orgId}`, `MEMBER#${sub}`))!;
  const meta = await db.get(`ORG#${orgId}`, "META");
  await db.put({ ...m, role });
  await db.put({ pk: `USER#${sub}`, sk: `ORG#${orgId}`, role, org_name: meta?.name ?? "" });
  return ok({ sub, role });
}

async function removeMember(db: Db, c: Claims, orgId: string, sub: string) {
  const leaving = sub === c.sub;
  const myRole = await requireRole(db, orgId, c, leaving ? "member" : "admin");
  const current = await membership(db, orgId, sub);
  if (!current) throw new ApiError(404, "That person is not a member.");
  if (!leaving && current === "owner" && myRole !== "owner") throw new ApiError(403, "Only an owner can remove an owner.");
  if (current === "owner" && (await owners(db, orgId)) <= 1) throw new ApiError(409, "An organisation needs at least one owner. Make someone else an owner first.");
  await db.delete(`ORG#${orgId}`, `MEMBER#${sub}`);
  await db.delete(`USER#${sub}`, `ORG#${orgId}`);
  return ok({ removed: sub });
}

/** Delete the caller's data. A sole owner must hand over an organisation that has other members first. */
async function deleteMe(db: Db, c: Claims) {
  const mine = await db.query(`USER#${c.sub}`, "ORG#");
  for (const m of mine) {
    const orgId = String(m.sk).slice(4);
    const members = await db.query(`ORG#${orgId}`, "MEMBER#");
    const owners = members.filter((x) => x.role === "owner");
    if (m.role === "owner" && owners.length <= 1 && members.length > 1) throw new ApiError(409, `Make someone else an owner of ${String(m.org_name)} before deleting your account.`);
  }
  for (const m of mine) {
    const orgId = String(m.sk).slice(4);
    const members = await db.query(`ORG#${orgId}`, "MEMBER#");
    if (members.length <= 1) {
      // Last member: remove the organisation entirely.
      for (const x of await db.query(`ORG#${orgId}`)) await db.delete(x.pk, x.sk);
    } else {
      await db.delete(`ORG#${orgId}`, `MEMBER#${c.sub}`);
      const meta = await db.get(`ORG#${orgId}`, "META");
      if (meta?.created_by === c.sub) await db.put({ ...meta, created_by: "deleted-user" });
    }
    await db.delete(m.pk, m.sk);
  }
  for (const u of await db.query(`USAGE#${c.sub}`)) await db.delete(u.pk, u.sk);
  await db.delete(`USER#${c.sub}`, "PROFILE");
  return ok({ deleted: true });
}

async function recordUsage(db: Db, c: Claims, body: unknown, now: Date) {
  const unit = obj(body).unit;
  if (!(USAGE_UNITS as readonly unknown[]).includes(unit)) throw new ApiError(400, "Unknown usage unit.");
  const count = await db.increment(`USAGE#${c.sub}`, `DAY#${day(now)}#${unit}`, "count", 1, { ttl: ttlIn(now, LIMITS.usageTtlDays) });
  return ok({ unit, day: day(now), count });
}

/** Route one authenticated request. Throws nothing: errors become JSON responses. */
export async function route(req: Req, db: Db, now = new Date()): Promise<Res> {
  try {
    const c = req.claims;
    if (!c?.sub) throw new ApiError(401, "Sign in first.");
    const parts = req.path.replace(/^\/+|\/+$/g, "").split("/");
    const m = req.method.toUpperCase();
    const [a, b, d, e] = parts;
    if (a === "me" && !b && m === "GET") return ok(await me(db, c, now));
    if (a === "me" && !b && m === "DELETE") return await deleteMe(db, c);
    if (a === "orgs" && !b && m === "POST") return await createOrg(db, c, req.body, now);
    if (a === "orgs" && b && !d && m === "GET") return await getOrg(db, c, b);
    if (a === "orgs" && b && d === "invites" && !e && m === "POST") return await invite(db, c, b, req.body, now);
    if (a === "orgs" && b && d === "members" && e && m === "PATCH") return await setRole(db, c, b, e, req.body);
    if (a === "orgs" && b && d === "members" && e && m === "DELETE") return await removeMember(db, c, b, e);
    if (a === "invites" && b && !d && m === "GET") {
      const inv = await getInvite(db, b, now);
      return ok({ org_name: inv.org_name, email: inv.email, role: inv.role });
    }
    if (a === "invites" && b && d === "accept" && m === "POST") return await acceptInvite(db, c, b, now);
    if (a === "usage" && !b && m === "POST") return await recordUsage(db, c, req.body, now);
    throw new ApiError(404, "Not found.");
  } catch (err) {
    if (err instanceof ApiError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: "Something went wrong. Nothing was changed." } };
  }
}
