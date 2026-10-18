import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, cognitoConfig, confirmForgotPassword, confirmSignUp, deleteUser, forgotPassword, globalSignOut, resendCode, signIn, signUp } from "@/lib/auth/cognito";
import { accountsApi, ApiCallError } from "@/lib/auth/api";
import { clearedCookies, tokenCookies } from "@/lib/auth/session";
import { COOKIE } from "@/lib/auth/tokens";
import { sameOrigin } from "@/lib/review/http";
import { clientIp } from "@/lib/guardrails";
import { allow } from "@/lib/watch/limit";

const str = (v: unknown, max = 256) => String(v ?? "").slice(0, max);

/** POST { action, ... } for sign-up, email confirmation, sign-in, sign-out and password reset. */
export async function POST(req: Request) {
  const cfg = cognitoConfig();
  if (!cfg) return NextResponse.json({ error: "Accounts are not configured on this deployment." }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!allow(`auth:${clientIp(req)}`, 12)) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  const text = await req.text();
  if (text.length > 4_096) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = str(b.email, 254);
  try {
    switch (b.action) {
      case "sign-up":
        if (str(b.password).length < 12) throw new AuthError("Choose a password of at least 12 characters.", "InvalidPasswordException");
        await signUp(cfg, email, str(b.password), str(b.name, 80));
        return NextResponse.json({ ok: true, next: "verify" });
      case "confirm":
        await confirmSignUp(cfg, email, str(b.code, 10));
        return NextResponse.json({ ok: true, next: "sign-in" });
      case "resend":
        await resendCode(cfg, email);
        return NextResponse.json({ ok: true });
      case "sign-in": {
        const t = await signIn(cfg, email, str(b.password));
        const res = NextResponse.json({ ok: true });
        for (const c of tokenCookies(t)) res.cookies.set(c.name, c.value, c.options);
        return res;
      }
      case "sign-out": {
        const access = (await cookies()).get(COOKIE.access)?.value;
        if (access) await globalSignOut(cfg, access).catch(() => {});
        const res = NextResponse.json({ ok: true });
        for (const c of clearedCookies()) res.cookies.set(c.name, c.value, c.options);
        return res;
      }
      case "delete-account": {
        const access = (await cookies()).get(COOKIE.access)?.value;
        if (!access) throw new AuthError("Sign in again to delete your account.", "signin", 401);
        if (b.confirm !== "DELETE") throw new AuthError('Type DELETE to confirm.', "confirm", 400);
        // App data first (it can refuse, e.g. a sole owner); then the sign-in identity.
        try {
          await accountsApi("DELETE", "/me");
        } catch (e) {
          if (e instanceof ApiCallError) throw new AuthError(e.message, "api", e.status);
          throw e;
        }
        await deleteUser(cfg, access);
        const res = NextResponse.json({ ok: true });
        for (const c of clearedCookies()) res.cookies.set(c.name, c.value, c.options);
        return res;
      }
      case "forgot":
        // Same response whether or not the account exists.
        await forgotPassword(cfg, email).catch((e) => {
          if (!(e instanceof AuthError) || e.status >= 500 || e.status === 429) throw e;
        });
        return NextResponse.json({ ok: true, next: "reset" });
      case "reset":
        if (str(b.password).length < 12) throw new AuthError("Choose a password of at least 12 characters.", "InvalidPasswordException");
        await confirmForgotPassword(cfg, email, str(b.code, 10), str(b.password));
        return NextResponse.json({ ok: true, next: "sign-in" });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong. Try again shortly." }, { status: 500 });
  }
}
