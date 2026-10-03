import { NextResponse } from "next/server";
import { getServices } from "@/lib/services/registry";

export async function GET() {
  const s = getServices();
  const b = s.graph.bundle();
  return NextResponse.json({
    ok: true,
    data_mode: process.env.DATA_MODE ?? "fixture",
    bundle: b.bundle_id,
    is_fixture: b.is_fixture,
    openai_configured: s.ai.configured(),
    counts: { nodes: b.nodes.length, edges: b.edges.length },
  });
}
