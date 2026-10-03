/**
 * Shape + quality rules for Path Explainer output. Pure (no OpenAI import) so it is unit-testable.
 */
import { z } from "zod";

export const ExplanationSchema = z.object({
  why_it_matters: z.string(), // WHY THIS CONNECTION MATTERS
  evidence_shows: z.string(), // WHAT THE EVIDENCE SHOWS
  does_not_show: z.string(), // WHAT IT DOES NOT SHOW (limitations)
  next_question: z.string(), // NEXT QUESTION TO ASK (actionable)
  cited_edge_ids: z.array(z.string()),
});
export type ExplanationBody = z.infer<typeof ExplanationSchema>;

export const WORD_LIMITS = { min: 60, max: 180 } as const;

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const totalWords = (e: Pick<ExplanationBody, "why_it_matters" | "evidence_shows" | "does_not_show" | "next_question">) =>
  countWords(e.why_it_matters) + countWords(e.evidence_shows) + countWords(e.does_not_show) + countWords(e.next_question);

/** Phrases the explainer must never produce. */
const FORBIDDEN = [
  /\bwill (work|help|treat)\b/i,
  /\b(cure|cures)\b/i,
  /\bsame (disease|condition)\b/i,
  /\btreatments? (will|would|should) (transfer|work)\b/i,
  /\byou should (take|start|stop|try)\b/i,
  /\bclinically equivalent\b/i,
];

/** Internal pipeline jargon that must not leak into family-facing text. */
const JARGON = [/\bstance\b/i, /["'“]qualifies["'”]/i, /\bedge[_ ]?ids?\b/i, /\bdemo_fixture\b/i];

export function checkExplanation(e: ExplanationBody): { ok: boolean; words: number; issues: string[] } {
  const issues: string[] = [];
  const words = totalWords(e);
  if (words > WORD_LIMITS.max) issues.push(`too long (${words} words > ${WORD_LIMITS.max})`);
  if (words < WORD_LIMITS.min) issues.push(`too short (${words} words < ${WORD_LIMITS.min})`);
  if (countWords(e.does_not_show) < 5) issues.push("missing limitations");
  if (countWords(e.next_question) < 5) issues.push("missing next question");
  if (!/\?\s*$/.test(e.next_question.trim()) && !/^(ask|review|compare|check|request|contact|discuss)\b/i.test(e.next_question.trim())) issues.push("next question is not phrased as a question or action");
  const all = [e.why_it_matters, e.evidence_shows, e.does_not_show, e.next_question].join(" ");
  for (const re of FORBIDDEN) if (re.test(all)) issues.push(`forbidden phrasing: ${re}`);
  for (const re of JARGON) if (re.test(all)) issues.push(`internal jargon: ${re}`);
  return { ok: issues.length === 0, words, issues };
}
