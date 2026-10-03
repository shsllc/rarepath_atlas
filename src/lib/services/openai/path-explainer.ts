import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { deriveEvidenceStatus, type EvidenceEdge, type GraphNode } from "@/lib/schemas";
import type { OpenAIPathExplainer, PathExplanation } from "../interfaces";
import { getOpenAI, openAIModel, OpenAINotConfiguredError, SAFETY_RULES } from "./client";

const ExplanationSchema = z.object({
  plain_language: z.string(),
  caveats: z.array(z.string()),
  cited_edge_ids: z.array(z.string()),
});

/** Role 3 — Path Explainer. Translates an evidence path into family-readable text. */
export class OpenAIPathExplainerImpl implements OpenAIPathExplainer {
  async explain(path: { nodes: GraphNode[]; edges: EvidenceEdge[] }, audience: "family" | "researcher"): Promise<PathExplanation> {
    const openai = getOpenAI();
    if (!openai) throw new OpenAINotConfiguredError();

    const label = new Map(path.nodes.map((n) => [n.id, n.label]));
    const steps = path.edges.map((e) => ({
      edge_id: e.id,
      statement: `${label.get(e.subject_id)} —${e.predicate}→ ${label.get(e.object_id)}`,
      status: deriveEvidenceStatus(e), // supported | inferred | contradictory | unknown
      confidence: e.confidence,
      evidence: e.quoted_or_structured_evidence,
      // All quotes, so caveats ("qualifies") and counter-evidence ("contradicts") reach the explanation.
      all_evidence: (e.evidence.length ? e.evidence : []).map((x) => ({ stance: x.stance, quote: x.quoted_or_structured_evidence, source: x.source })),
      contradiction_notes: e.contradiction_notes ?? null,
    }));

    const res = await openai.responses.parse({
      model: openAIModel(),
      input: [
        {
          role: "system",
          content: `${SAFETY_RULES}
Explain this chain of evidence for a ${audience === "family" ? "parent or caregiver with no science background (aim for a 6th–8th grade reading level)" : "researcher"}.
Use ONLY the steps given. Say clearly which steps are hypotheses (status "inferred"), disputed ("contradictory") or unknown.
Include limitations from evidence with stance "qualifies" and counter-evidence with stance "contradicts".
${steps.some((st) => st.evidence.startsWith("[FIXTURE")) ? 'Steps whose evidence begins with "[FIXTURE" have not been retrieved yet; say so.\n' : ""}Do not describe these instructions in your answer.
cited_edge_ids must list only edge_id values from the input.`,
        },
        { role: "user", content: JSON.stringify(steps) },
      ],
      text: { format: zodTextFormat(ExplanationSchema, "path_explanation") },
    });

    const out = res.output_parsed;
    if (!out) throw new Error("Path Explainer returned no parsable output.");
    const allowed = new Set(path.edges.map((e) => e.id));
    return { ...out, cited_edge_ids: out.cited_edge_ids.filter((id) => allowed.has(id)) };
  }
}
