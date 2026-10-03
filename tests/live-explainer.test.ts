/**
 * Live OpenAI check of the Path Explainer. Skipped unless RUN_LIVE_OPENAI=1
 * (makes paid API calls; key read from .env.local, never printed).
 *   RUN_LIVE_OPENAI=1 npx vitest run tests/live-explainer.test.ts
 */
import path from "node:path";
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { checkExplanation, WORD_LIMITS } from "@/lib/explanation";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { OpenAIPathExplainerImpl } from "@/lib/services/openai/path-explainer";

config({ path: path.join(process.cwd(), ".env.local"), override: true, quiet: true });
const live = process.env.RUN_LIVE_OPENAI === "1";

describe.skipIf(!live)("Path Explainer (live OpenAI)", () => {
  const g = JsonGraphService.fromFile(REAL_BUNDLE);
  const paths: Record<string, string[]> = {
    hero: ["edge:cdd-in-nhs", "edge:nhs-informed-sa", "edge:css-cdd"],
    contradiction: ["edge:history", "edge:variant-claim"],
  };
  for (const [name, ids] of Object.entries(paths)) {
    it(`${name}: concise, has limitations and a next question`, async () => {
      const edges = ids.map((id) => g.getEdge(id)!);
      const nodes = [...new Set(edges.flatMap((e) => [e.subject_id, e.object_id]))].map((id) => g.getNode(id)!);
      const r = await new OpenAIPathExplainerImpl().explain({ nodes, edges }, "family");
      console.log(`\n[${name}] ${r.word_count} words\nWHY: ${r.why_it_matters}\nSHOWS: ${r.evidence_shows}\nNOT: ${r.does_not_show}\nNEXT: ${r.next_question}\nissues: ${r.quality_issues.join("; ") || "none"}`);
      expect(r.word_count).toBeLessThanOrEqual(WORD_LIMITS.max);
      expect(r.word_count).toBeGreaterThanOrEqual(WORD_LIMITS.min);
      expect(checkExplanation(r).ok).toBe(true);
      expect(r.cited_edge_ids.every((id) => ids.includes(id))).toBe(true);
    }, 120_000);
  }
});
