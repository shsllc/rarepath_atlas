/**
 * Reviewer authentication, with no external service.
 *
 *   REVIEWERS       "id:Display Name:<sha256 hex of access key>;id2:…"   (raw keys are never stored)
 *   SESSION_SECRET  ≥ 32 random characters, signs the session cookie (HMAC-SHA256)
 *
 * If either is missing, review features are disabled and the app stays read-only.
 * Generate a reviewer entry with:  npx tsx scripts/reviewer-key.ts "Display Name"
 */
import crypto from "node:crypto";

export interface Reviewer {
  id: string;
  name: string;
  /** Organisation the reviewer acts for (account-based reviewers only). */
  org?: { id: string; name: string };
  /** Platform curator (Cognito group "curators"). */
  curator?: boolean;
}
export const SESSION_COOKIE = "rp_review";
const SESSION_HOURS = 12;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function reviewers(): { id: string; name: string; hash: string }[] {
  return (process.env.REVIEWERS ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [id, name, hash] = x.split(":");
      return { id: id?.trim(), name: name?.trim() || id?.trim(), hash: hash?.trim().toLowerCase() };
    })
    .filter((r) => r.id && /^[a-f0-9]{64}$/.test(r.hash ?? ""));
}

export function reviewEnabled(): boolean {
  return reviewers().length > 0 && (process.env.SESSION_SECRET ?? "").length >= 32;
}

/** Constant-time check of an access key against the configured hashes. */
export function verifyAccessKey(id: string, key: string): Reviewer | null {
  if (!reviewEnabled() || !key) return null;
  const r = reviewers().find((x) => x.id === id.trim());
  const given = Buffer.from(sha256(key), "hex");
  const expected = Buffer.from(r?.hash ?? "0".repeat(64), "hex");
  const ok = crypto.timingSafeEqual(given, expected) && !!r;
  return ok ? { id: r!.id, name: r!.name } : null;
}

const sign = (payload: string) => crypto.createHmac("sha256", process.env.SESSION_SECRET ?? "").update(payload).digest("base64url");

export function createSession(r: Reviewer, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ id: r.id, exp: now + SESSION_HOURS * 3_600_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the reviewer for a valid, unexpired session that still exists in REVIEWERS. */
export function readSession(token: string | undefined, now = Date.now()): Reviewer | null {
  if (!token || !reviewEnabled()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { id, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { id: string; exp: number };
    if (typeof exp !== "number" || exp < now) return null;
    const r = reviewers().find((x) => x.id === id);
    return r ? { id: r.id, name: r.name } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_HOURS * 3600 };
