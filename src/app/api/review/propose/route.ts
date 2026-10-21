import { after, NextResponse } from "next/server";
import { fail, guard, readJson } from "@/lib/review/http";
import { propose, ReviewError, savePrecheck } from "@/lib/review/queue";
import { runPrecheck } from "@/lib/review/precheck";
import { getServices } from "@/lib/services/registry";

/** The client sends only the search query and the link key; the claim itself is re-derived server-side. */
export async function POST(req: Request) {
  try {
    const reviewer = await guard(req);
    const body = await readJson(req);
    const query = String(body.query ?? "").trim().slice(0, 120);
    const linkKey = String(body.link_key ?? "").slice(0, 600);
    if (!query || !linkKey) throw new ReviewError("query and link_key are required.");
    const discovery = getServices().discovery;
    if (!discovery) throw new ReviewError("Discovery is disabled on this deployment.", 503);
    const out = await discovery.preview(query);
    if (out.kind !== "preview") throw new ReviewError("The discovery preview for this query is not available right now.", 503);
    const { item, created } = await propose(out.preview, linkKey, reviewer);
    // Draft a decision in the background so the reviewer finds it ready on the item page.
    if (created && getServices().ai.configured())
      after(() =>
        runPrecheck(item)
          .then((precheck) => savePrecheck(item.id, { precheck }))
          .catch((e) => savePrecheck(item.id, { error: (e as Error).message })),
      );
    return NextResponse.json({ ok: true, id: item.id, created, status: item.status });
  } catch (e) {
    return fail(e);
  }
}
