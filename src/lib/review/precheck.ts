/**
 * AI pre-check for the review queue. OpenAI reads the source material RarePath already holds for a
 * proposed claim (the source's own statement and structured fields, a paper's abstract, a study's
 * registered conditions) and drafts a decision for a reviewer to confirm. It never decides: a
 * reviewer still opens the source, ticks the check and submits. No personal data is sent.
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAI, openAIModel, OpenAINotConfiguredError } from "@/lib/services/openai/client";
import type { ReviewItem } from "./queue";

export const PrecheckSchema = z.object({
  suggested_outcome: z.enum(["supports", "qualifies", "contradicts", "rejected"]),
  confidence: z.enum(["high", "moderate", "low"]),
  /** Draft reviewer note: what the source states, and any limits. */
  note: z.string(),
  checks: z.array(z.object({ check: z.string(), passed: z.boolean(), detail: z.string() })),
  /** What the judgement rests on. */
  basis: z.enum(["structured_record", "abstract", "statement_only"]),
});
export type PrecheckBody = z.infer<typeof PrecheckSchema>;
export type Precheck = PrecheckBody & { model: string; at: string };

/** The material sent to the model: only what the source itself provides. */
export function precheckInput(item: ReviewItem) {
  const l = item.link;
  return {
    claim: l.statement,
    claim_as_edge: `${item.candidate_edge.subject_id} ${item.candidate_edge.predicate} ${item.candidate_edge.object_id}`,
    disease: item.disease.label,
    source_relation: l.relation,
    source_native_type: l.native_evidence_type,
    source_marked_as_navigation_lead: l.discovery_lead,
    source_qualifiers: l.qualifiers ?? {},
    source_score: l.source_score ?? null,
    providers: l.provenance.map((p) => ({ provider: p.provider, native_type: p.native_type, retrieved: p.retrieved_at.slice(0, 10) })),
    records: item.records.map((r) => {
      const base = { kind: r.kind, label: r.label };
      if (r.kind === "paper") return { ...base, year: r.year, venue: r.venue, publication_status: r.publication_status, abstract: r.abstract ?? null };
      if (r.kind === "study") return { ...base, conditions: r.conditions, status: r.status_label, title: r.official_title ?? null, study_type: r.study_type ?? null };
      return base;
    }),
  };
}

const SYSTEM = `You help a human reviewer check one machine-assembled research claim about a rare disease against its source.
Judge ONLY whether the supplied source material supports the specific claim as worded. You have not opened any web page; never say you did.
Rules:
- "supports": the source material directly states the relationship.
- "qualifies": the relationship holds only with limits the source states (frequency, classification level, population, preclinical only), or the material is a search hit that is relevant but does not itself state the relationship.
- "contradicts": the source material argues against the claim.
- "rejected": the material does not support the claim, or the claim over-reads a co-occurrence or search hit.
- A record marked as a navigation lead is never "supports" by itself.
- Preprints are not peer reviewed; say so in the note if relevant.
- confidence reflects how clearly the material settles it.
note: at most 60 words, plain and factual: what the source states and any limit. No medical advice.
checks: 2 to 5 short checks you applied (for example "condition named exactly in the registry record", "classification level stated", "abstract mentions the gene and disease together").
basis: "structured_record" if you relied on registry or database fields, "abstract" if on a paper abstract, "statement_only" if only the one-line claim was available.`;

export async function runPrecheck(item: ReviewItem, now = new Date()): Promise<Precheck> {
  const openai = getOpenAI();
  if (!openai) throw new OpenAINotConfiguredError();
  const res = await openai.responses.parse(
    {
      model: openAIModel(),
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(precheckInput(item)) },
      ],
      text: { format: zodTextFormat(PrecheckSchema, "review_precheck") },
    },
    { timeout: 18_000, maxRetries: 0 },
  );
  const out = res.output_parsed;
  if (!out) throw new Error("The pre-check returned no parsable output.");
  return sanitize(out, item, now);
}

/** Enforce the rules the model was given, whatever it returned. Pure. */
export function sanitize(out: PrecheckBody, item: ReviewItem, now: Date): Precheck {
  let suggested = out.suggested_outcome;
  // A navigation lead can never be suggested as plainly supported.
  if (item.link.discovery_lead && suggested === "supports") suggested = "qualifies";
  const words = out.note.trim().split(/\s+/);
  const note = words.length > 60 ? `${words.slice(0, 60).join(" ")}…` : out.note.trim();
  return { ...out, suggested_outcome: suggested, note, checks: out.checks.slice(0, 5), model: openAIModel(), at: now.toISOString() };
}
