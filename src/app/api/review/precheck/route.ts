import { NextResponse } from "next/server";
import { fail, guard, readJson } from "@/lib/review/http";
import { getItem, ReviewError, savePrecheck } from "@/lib/review/queue";
import { runPrecheck } from "@/lib/review/precheck";
import { getServices } from "@/lib/services/registry";
import { friendlyAiError } from "@/lib/guardrails";
import { allow } from "@/lib/watch/limit";

export const maxDuration = 30;

/** Reviewers: (re)run the AI pre-check for one pending item. */
export async function POST(req: Request) {
  try {
    const reviewer = await guard(req);
    if (!getServices().ai.configured()) throw new ReviewError("AI pre-checks are not configured on this deployment.", 503);
    if (!allow(`precheck:${reviewer.id}`, 10)) throw new ReviewError("Too many pre-checks. Wait a minute.", 429);
    const b = await readJson(req);
    const item = await getItem(String(b.id ?? ""));
    if (!item) throw new ReviewError("Review item not found.", 404);
    if (item.status !== "pending") throw new ReviewError("Only pending items can be pre-checked.", 409);
    try {
      await savePrecheck(item.id, { precheck: await runPrecheck(item) });
    } catch (e) {
      const f = friendlyAiError(e);
      await savePrecheck(item.id, { error: f.error });
      throw new ReviewError(f.error, f.status);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
