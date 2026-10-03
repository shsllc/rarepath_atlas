import { NextResponse } from "next/server";
import { z } from "zod";
import { getServices } from "@/lib/services/registry";
import { cacheGet, cacheKey, cacheSet, checkRate, clientIp, EDGE_ID_RE, friendlyAiError, LIMITS } from "@/lib/guardrails";

// Explanations can take a while (one corrective retry); stay inside serverless limits.
export const maxDuration = 60;

const Body = z
  .object({
    edge_ids: z.array(z.string().regex(EDGE_ID_RE)).min(1).max(LIMITS.maxEdgeIds),
    audience: z.enum(["family", "researcher"]).default("family"),
  })
  .strict();

/**
 * OpenAI Path Explainer endpoint. Not a general proxy: it only explains relationships
 * that already exist in the loaded evidence graph. No free text reaches the model.
 * Failure never affects the sourced evidence page; it only returns a calm error.
 */
export async function POST(req: Request) {
  const { graph, ai } = getServices();
  if (!ai.configured()) {
    return NextResponse.json({ error: "Explanations are not available on this deployment. All evidence is still shown below.", code: "not_configured" }, { status: 503 });
  }

  const raw = await req.text().catch(() => "");
  if (raw.length > LIMITS.maxBodyBytes) return NextResponse.json({ error: "Request too large.", code: "too_large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed request.", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Malformed request.", code: "bad_request" }, { status: 400 });

  const ids = [...new Set(parsed.data.edge_ids)];
  const edges = ids.map((id) => graph.getEdge(id));
  if (edges.some((e) => e === undefined)) return NextResponse.json({ error: "Unknown evidence id.", code: "unknown_id" }, { status: 400 });
  const known = edges.filter((e) => e !== undefined);

  const key = cacheKey(ids, parsed.data.audience);
  const cached = cacheGet<object>(key);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const rate = checkRate(clientIp(req));
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many explanation requests. The evidence below is unchanged. Please try again shortly.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  const nodes = [...new Set(known.flatMap((e) => [e.subject_id, e.object_id]))].map((id) => graph.getNode(id)).filter((n) => n !== undefined);
  try {
    const result = await ai.explainer.explain({ nodes, edges: known }, parsed.data.audience);
    cacheSet(key, result);
    return NextResponse.json(result);
  } catch (err) {
    const f = friendlyAiError(err);
    console.error(`[explain] ${f.code}`); // no payloads, no provider messages
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
  }
}
