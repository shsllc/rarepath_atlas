import { zodTextFormat } from "openai/helpers/zod";
import { deriveEvidenceStatus, type EvidenceEdge, type GraphNode } from "@/lib/schemas";
import { checkExplanation, ExplanationSchema, WORD_LIMITS, type ExplanationBody } from "@/lib/explanation";
import type { OpenAIPathExplainer, PathExplanation } from "../interfaces";
import { getOpenAI, openAIModel, OpenAINotConfiguredError, SAFETY_RULES } from "./client";

/** Role 3 — Path Explainer. Concise, four-part, family-readable explanation of an evidence path. */
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
      // All quotes, so caveats ("qualifies") and counter-evidence ("contradicts") reach the explanation.
      evidence: e.evidence.map((x) => ({ stance: x.stance, quote: x.quoted_or_structured_evidence, source: x.source })),
      contradiction_notes: e.contradiction_notes ?? null,
    }));
    const hasFixture = path.edges.some((e) => e.source_type === "demo_fixture");

    const system = `${SAFETY_RULES}
Explain this chain of evidence for ${audience === "family" ? "a parent or patient-organization volunteer with no science background (plain words, 6th–8th grade reading level)" : "a researcher"}.
Return four short parts, ${WORD_LIMITS.max} words maximum IN TOTAL (aim for 120–160):
- why_it_matters: 1–2 sentences on why this connection matters to a patient organization.
- evidence_shows: 2–3 sentences on what the cited sources actually show. Include key numbers only if quoted.
- does_not_show: 1–2 sentences of limitations. Always include any evidence with stance "qualifies" or "contradicts", any "contradictory" or "inferred" step, and that this is not evidence of shared biology or treatment transfer.
- next_question: ONE concrete question a patient organization or researcher could ask next, ending with "?".
Use ONLY the steps given. No hype, no medical advice. Never mention internal field names such as "stance", "qualifies", "status", "edge" or "steps"; just state the limitation in plain words.${hasFixture ? ' Steps from "demo_fixture" sources were not retrieved; say so.' : ""}
cited_edge_ids must list only edge_id values from the input.`;

    const run = async (extra: string): Promise<ExplanationBody> => {
      const res = await openai.responses.parse({
        model: openAIModel(),
        input: [
          { role: "system", content: system + extra },
          { role: "user", content: JSON.stringify(steps) },
        ],
        text: { format: zodTextFormat(ExplanationSchema, "path_explanation") },
      });
      if (!res.output_parsed) throw new Error("Path Explainer returned no parsable output.");
      return res.output_parsed;
    };

    const started = Date.now();
    let out = await run("");
    let check = checkExplanation(out);
    // One corrective retry, only if there is time left inside the serverless budget.
    if (!check.ok && Date.now() - started < 20_000) {
      // One corrective retry with the specific problems listed.
      out = await run(`\nYour previous answer had these problems: ${check.issues.join("; ")}. Fix them.`);
      check = checkExplanation(out);
    }

    const allowed = new Set(path.edges.map((e) => e.id));
    return {
      ...out,
      cited_edge_ids: out.cited_edge_ids.filter((id) => allowed.has(id)),
      word_count: check.words,
      quality_issues: check.issues,
    };
  }
}
