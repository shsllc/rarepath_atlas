import { NextResponse, type NextRequest } from "next/server";
import { cognitoConfig, refresh } from "@/lib/auth/cognito";
import { COOKIE, cookieBase, needsRefresh, REFRESH_DAYS } from "@/lib/auth/tokens";

/**
 * Keeps a session alive: when the ID token is missing or about to expire and a refresh token exists,
 * fetch new tokens from Cognito, pass them to this request's server code, and set them on the response.
 * A failed refresh signs the browser out quietly.
 */
export async function middleware(req: NextRequest) {
  const cfg = cognitoConfig();
  const rt = req.cookies.get(COOKIE.refresh)?.value;
  if (!cfg || !needsRefresh(req.cookies.get(COOKIE.id)?.value, rt)) return NextResponse.next();
  try {
    const t = await refresh(cfg, rt!);
    req.cookies.set(COOKIE.id, t.idToken);
    req.cookies.set(COOKIE.access, t.accessToken);
    const res = NextResponse.next({ request: { headers: req.headers } });
    res.cookies.set(COOKIE.id, t.idToken, { ...cookieBase, maxAge: t.expiresIn });
    res.cookies.set(COOKIE.access, t.accessToken, { ...cookieBase, maxAge: t.expiresIn });
    if (t.refreshToken) res.cookies.set(COOKIE.refresh, t.refreshToken, { ...cookieBase, maxAge: REFRESH_DAYS * 86_400 });
    return res;
  } catch {
    req.cookies.delete(COOKIE.id);
    const res = NextResponse.next({ request: { headers: req.headers } });
    for (const name of Object.values(COOKIE)) res.cookies.set(name, "", { ...cookieBase, maxAge: 0 });
    return res;
  }
}

export const config = {
  // Pages and API routes; skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
