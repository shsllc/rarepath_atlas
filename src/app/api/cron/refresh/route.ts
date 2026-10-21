import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { getServices } from "@/lib/services/registry";
import { promoteFromPreview } from "@/lib/curation/store";

export const maxDuration = 30;

/** Nightly job: refresh one disease's discovery data and apply the source-curation rules. */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const started = Date.now();
  let disease = "";
  try {
    disease = String(((await req.json()) as { disease?: string }).disease ?? "").trim().slice(0, 120);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!disease) return NextResponse.json({ error: "disease is required." }, { status: 400 });
  const { discovery, graph } = getServices();
  if (!discovery) return NextResponse.json({ error: "Discovery is disabled." }, { status: 503 });
  const out = await discovery.preview(disease);
  if (out.kind !== "preview") return NextResponse.json({ disease, status: out.kind, ms: Date.now() - started });
  const b = graph.bundle();
  const changed = await promoteFromPreview(out.preview, b.nodes, b.focus_disease_id);
  return NextResponse.json({ disease, status: "ok", resolved_as: out.preview.disease.label, changed, ms: Date.now() - started });
}
