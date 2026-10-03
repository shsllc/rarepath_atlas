import { NextResponse } from "next/server";
import { z } from "zod";
import { getServices } from "@/lib/services/registry";

const Body = z.object({
  edge_ids: z.array(z.string()).min(1).max(20),
  audience: z.enum(["family", "researcher"]).default("family"),
});

/** OpenAI Path Explainer endpoint. Returns 503 (not a fake answer) when no key is configured. */
export async function POST(req: Request) {
  const { graph, ai } = getServices();
  if (!ai.configured()) {
    return NextResponse.json({ error: "OpenAI is not configured. Set OPENAI_API_KEY in .env.local." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const edges = parsed.data.edge_ids.map((id) => graph.getEdge(id)).filter((e) => e !== undefined);
  if (edges.length === 0) return NextResponse.json({ error: "No known edges." }, { status: 404 });
  const nodeIds = new Set(edges.flatMap((e) => [e.subject_id, e.object_id]));
  const nodes = [...nodeIds].map((id) => graph.getNode(id)).filter((n) => n !== undefined);

  try {
    return NextResponse.json(await ai.explainer.explain({ nodes, edges }, parsed.data.audience));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Explainer failed" }, { status: 502 });
  }
}
