import { NextResponse } from "next/server";
import { getServices } from "@/lib/services/registry";
import { openAIKeySource, openAIModel } from "@/lib/services/openai/client";

export async function GET() {
  const s = getServices();
  const b = s.graph.bundle();
  return NextResponse.json({
    ok: true,
    data_bundle: process.env.DATA_BUNDLE === "fixture" ? "fixture" : "real",
    bundle: b.bundle_id,
    is_fixture: b.is_fixture,
    openai_configured: s.ai.configured(),
    openai_key_source: openAIKeySource(), // ".env.local" | "process.env" | "none" (never the key itself)
    openai_model: openAIModel(),
    counts: { nodes: b.nodes.length, edges: b.edges.length, sources: b.sources.length },
    openai_build_runs: b.build_info?.openai_runs ?? [],
  });
}
