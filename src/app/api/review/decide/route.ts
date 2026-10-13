import { NextResponse } from "next/server";
import { fail, guard, readJson } from "@/lib/review/http";
import { decide, ReviewError, type ReviewOutcome } from "@/lib/review/queue";
import { getServices } from "@/lib/services/registry";

const OUTCOMES: ReviewOutcome[] = ["supports", "qualifies", "contradicts", "rejected"];

export async function POST(req: Request) {
  try {
    const reviewer = await guard(req);
    const b = await readJson(req);
    const outcome = String(b.outcome ?? "") as ReviewOutcome;
    if (!OUTCOMES.includes(outcome)) throw new ReviewError("Unknown outcome.");
    const confidence = b.confidence ? (String(b.confidence) as "high" | "moderate" | "low") : undefined;
    const item = await decide(String(b.id ?? ""), reviewer, { outcome, confidence, note: String(b.note ?? ""), source_checked: b.source_checked === true }, getServices().graph.bundle().nodes);
    return NextResponse.json({ ok: true, status: item.status });
  } catch (e) {
    return fail(e);
  }
}
