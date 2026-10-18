/** Cookie names and token helpers shared by middleware (edge) and server code. No Node-only imports. */
export const COOKIE = { id: "rp_id", access: "rp_at", refresh: "rp_rt" } as const;
export const REFRESH_DAYS = 30;

/** Seconds until a JWT expires (negative when expired). Reads the payload only; never trusts it for access. */
export function secondsLeft(jwt: string | undefined, nowMs = Date.now()): number {
  if (!jwt) return -1;
  try {
    const part = jwt.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp - Math.floor(nowMs / 1000) : -1;
  } catch {
    return -1;
  }
}

/** Refresh when the ID token is missing or within two minutes of expiry, and a refresh token exists. */
export const needsRefresh = (idToken: string | undefined, refreshToken: string | undefined, nowMs = Date.now()) => !!refreshToken && secondsLeft(idToken, nowMs) < 120;

export const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
