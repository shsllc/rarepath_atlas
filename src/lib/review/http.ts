import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE, type Reviewer } from "./auth";
import { ReviewError } from "./queue";

/** Current reviewer from the signed session cookie, or null. */
export async function currentReviewer(): Promise<Reviewer | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Reject cross-site requests: the Origin (or Referer) must match this host. */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: Request, maxBytes = 8_192): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ReviewError("Request too large.", 413);
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ReviewError("Invalid JSON body.");
  }
}

export function fail(e: unknown) {
  if (e instanceof ReviewError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Something went wrong. Nothing was changed." }, { status: 500 });
}

/** Common guard for reviewer-only POST routes. */
export async function guard(req: Request): Promise<Reviewer> {
  if (!sameOrigin(req)) throw new ReviewError("Cross-site request refused.", 403);
  const r = await currentReviewer();
  if (!r) throw new ReviewError("Sign in as a reviewer first.", 401);
  return r;
}
