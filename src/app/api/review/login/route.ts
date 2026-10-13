import { NextResponse } from "next/server";
import { createSession, reviewEnabled, SESSION_COOKIE, sessionCookieOptions, verifyAccessKey } from "@/lib/review/auth";
import { fail, readJson, sameOrigin } from "@/lib/review/http";
import { ReviewError } from "@/lib/review/queue";
import { checkRate, clientIp } from "@/lib/guardrails";

export async function POST(req: Request) {
  try {
    if (!reviewEnabled()) throw new ReviewError("Reviewer sign-in is not configured on this deployment.", 503);
    if (!sameOrigin(req)) throw new ReviewError("Cross-site request refused.", 403);
    const rate = checkRate(`login:${clientIp(req)}`);
    if (!rate.ok) throw new ReviewError(`Too many attempts. Try again in ${rate.retryAfterSec}s.`, 429);
    const body = await readJson(req);
    const r = verifyAccessKey(String(body.id ?? ""), String(body.key ?? ""));
    if (!r) throw new ReviewError("Reviewer id or access key not recognised.", 401);
    const res = NextResponse.json({ ok: true, reviewer: r });
    res.cookies.set(SESSION_COOKIE, createSession(r), sessionCookieOptions);
    return res;
  } catch (e) {
    return fail(e);
  }
}
