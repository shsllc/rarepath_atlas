import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { GraphNode } from "@/lib/schemas";
import type { OpenAIEntityReconciler, ReconciliationResult } from "../interfaces";
import { getOpenAI, openAIModel, OpenAINotConfiguredError, SAFETY_RULES } from "./client";

const ResultSchema = z.object({
  matched_node_id: z.string().nullable(),
  match_type: z.enum(["exact", "alias", "synonym", "none"]),
  confidence: z.enum(["high", "moderate", "low"]),
  rationale: z.string(),
});

/**
 * Role 2 — Entity Reconciler. Chooses among ontology-provided candidates only;
 * it can never mint a new identifier. Status: implemented, wired in Gate 2.
 */
export class OpenAIEntityReconcilerImpl implements OpenAIEntityReconciler {
  async reconcile(mention: string, candidates: GraphNode[]): Promise<ReconciliationResult> {
    if (candidates.length === 0) {
      return { input: mention, matched_node_id: null, match_type: "none", confidence: "high", rationale: "No candidates supplied." };
    }
    const openai = getOpenAI();
    if (!openai) throw new OpenAINotConfiguredError();

    const list = candidates.map((c) => ({ id: c.id, type: c.type, label: c.label, aliases: c.aliases, ids: c.external_ids.map((x) => `${x.system}:${x.id}`) }));
    const res = await openai.responses.parse({
      model: openAIModel(),
      input: [
        {
          role: "system",
          content: `${SAFETY_RULES}
Map the user's mention to exactly one candidate id, or null if none clearly matches. Do not guess between similarly named diseases.`,
        },
        { role: "user", content: JSON.stringify({ mention, candidates: list }) },
      ],
      text: { format: zodTextFormat(ResultSchema, "reconciliation") },
    });

    const out = res.output_parsed;
    const valid = out && (out.matched_node_id === null || candidates.some((c) => c.id === out.matched_node_id));
    if (!out || !valid) {
      return { input: mention, matched_node_id: null, match_type: "none", confidence: "low", rationale: "Model output rejected: not a supplied candidate." };
    }
    return { input: mention, ...out };
  }
}
