import "server-only";
import { idToken } from "./session";

/** Profile, organisations and usage, as returned by the AWS accounts API (infra/lambda/core.ts). */
export interface Me {
  sub: string;
  email: string;
  name: string;
  plan: string;
  watch_key: string;
  curator: boolean;
  orgs: { id: string; name: string; role: "owner" | "admin" | "reviewer" | "member" }[];
  usage_today: Record<string, number>;
}

export class ApiCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const apiConfigured = () => !!process.env.ACCOUNTS_API_URL;

/**
 * Call the accounts API as the signed-in user (their ID token is the bearer). Pass `bearer` when the
 * token was read up front, e.g. before `after()`, where cookies are unavailable.
 */
export async function accountsApi<T>(method: string, path: string, body?: unknown, bearer?: string): Promise<T> {
  const base = process.env.ACCOUNTS_API_URL;
  if (!base) throw new ApiCallError("Accounts are not configured on this deployment.", 503);
  const token = bearer ?? (await idToken());
  if (!token) throw new ApiCallError("Sign in first.", 401);
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new ApiCallError("The accounts service is unavailable right now.", 503);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiCallError(json.error ?? (res.status === 401 ? "Sign in again." : "Request failed."), res.status);
  return json as T;
}

/** The signed-in user's profile and memberships, or null when signed out or unavailable. */
export async function getMe(): Promise<Me | null> {
  try {
    return await accountsApi<Me>("GET", "/me");
  } catch {
    return null;
  }
}
