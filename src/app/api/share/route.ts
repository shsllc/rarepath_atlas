import { NextResponse } from "next/server";
import { getServices } from "@/lib/services/registry";
import { briefDocFrom } from "@/lib/export/brief-doc";
import { createShare } from "@/lib/export/share";
import { sameOrigin } from "@/lib/review/http";
import { clientIp } from "@/lib/guardrails";
import { allow } from "@/lib/watch/limit";

/** POST { query } → a frozen snapshot of that search's Research Action Brief at a shareable URL. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!allow(`share:${clientIp(req)}`, 5)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const text = await req.text();
  let query = "";
  try {
    query = String(JSON.parse(text).query ?? "").trim().slice(0, 120);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!query) return NextResponse.json({ error: "query is required." }, { status: 400 });
  const origin = new URL(req.url).origin;
  const doc = briefDocFrom(await getServices().search.search(query), origin);
  if (!doc) return NextResponse.json({ error: "No Research Action Brief is available for this search." }, { status: 404 });
  const s = await createShare(query, doc);
  return NextResponse.json({ ok: true, url: `${origin}/share/${s.id}` });
}
