import { NextResponse } from "next/server";
import { fail, guard, readJson } from "@/lib/review/http";
import { ReviewError } from "@/lib/review/queue";
import { withdrawCurated } from "@/lib/curation/store";

/** Curators only: withdraw one rule-promoted (source-curated) edge. */
export async function POST(req: Request) {
  try {
    const reviewer = await guard(req);
    if (!reviewer.curator) throw new ReviewError("Only platform curators can withdraw source-curated claims.", 403);
    const b = await readJson(req);
    try {
      await withdrawCurated(String(b.edge_id ?? ""), reviewer, String(b.note ?? ""));
    } catch (e) {
      throw new ReviewError((e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
