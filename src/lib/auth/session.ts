import "server-only";
import { cookies } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cognitoConfig, type Tokens } from "./cognito";
import { COOKIE, cookieBase, REFRESH_DAYS } from "./tokens";

export interface User {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
  groups: string[];
}

export const accountsEnabled = () => cognitoConfig() !== null;

type Verify = (token: string) => Promise<Record<string, unknown>>;
let verifier: Verify | null = null;
/** Test seam. */
export function setTokenVerifier(v: Verify | null) {
  verifier = v;
}
function verify(): Verify | null {
  if (verifier) return verifier;
  const cfg = cognitoConfig();
  if (!cfg) return null;
  // Checks signature (JWKS, cached), issuer, audience, token use and expiry.
  const v = CognitoJwtVerifier.create({ userPoolId: cfg.userPoolId, tokenUse: "id", clientId: cfg.clientId });
  verifier = (t) => v.verify(t) as Promise<Record<string, unknown>>;
  return verifier;
}

export function userFromClaims(c: Record<string, unknown>): User {
  const groups = c["cognito:groups"];
  return {
    sub: String(c.sub),
    email: String(c.email ?? ""),
    name: String(c.name ?? "") || String(c.email ?? "").split("@")[0],
    emailVerified: c.email_verified === true || c.email_verified === "true",
    groups: Array.isArray(groups) ? groups.map(String) : [],
  };
}

/** The signed-in user from the verified ID-token cookie, or null. */
export async function currentUser(): Promise<User | null> {
  const v = verify();
  if (!v) return null;
  const token = (await cookies()).get(COOKIE.id)?.value;
  if (!token) return null;
  try {
    return userFromClaims(await v(token));
  } catch {
    return null;
  }
}

export async function idToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE.id)?.value;
}

/** Cookie writes for a fresh set of tokens (route handlers and middleware). */
export function tokenCookies(t: Tokens): { name: string; value: string; options: typeof cookieBase & { maxAge: number } }[] {
  const out: { name: string; value: string; options: typeof cookieBase & { maxAge: number } }[] = [
    { name: COOKIE.id, value: t.idToken, options: { ...cookieBase, maxAge: t.expiresIn } },
    { name: COOKIE.access, value: t.accessToken, options: { ...cookieBase, maxAge: t.expiresIn } },
  ];
  if (t.refreshToken) out.push({ name: COOKIE.refresh, value: t.refreshToken, options: { ...cookieBase, maxAge: REFRESH_DAYS * 86_400 } });
  return out;
}

export const clearedCookies = () => Object.values(COOKIE).map((name) => ({ name, value: "", options: { ...cookieBase, maxAge: 0 } }));
