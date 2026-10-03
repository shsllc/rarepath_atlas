import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { NodeType, Predicate } from "@/lib/schemas";
import type { ExtractedClaim, OpenAIEvidenceExtractor, SourceDocument } from "../interfaces";
import { getOpenAI, openAIModel, OpenAINotConfiguredError, SAFETY_RULES } from "./client";

const ClaimSchema = z.object({
  claims: z.array(
    z.object({
      subject: z.object({ text: z.string(), type: NodeType }),
      predicate: Predicate,
      object: z.object({ text: z.string(), type: NodeType }),
      supporting_quote: z.string(),
      hedged: z.boolean(),
      negated: z.boolean(),
    }),
  ),
});

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Role 1 — Evidence Extractor. Status: implemented, not yet exercised against live sources (Gate 2). */
export class OpenAIEvidenceExtractorImpl implements OpenAIEvidenceExtractor {
  async extract(doc: SourceDocument): Promise<ExtractedClaim[]> {
    const openai = getOpenAI();
    if (!openai) throw new OpenAINotConfiguredError();

    const res = await openai.responses.parse({
      model: openAIModel(),
      input: [
        {
          role: "system",
          content: `${SAFETY_RULES}
Extract biomedical relationships from the text. Every claim MUST include a verbatim supporting_quote copied exactly from the text.
Mark hedged=true for speculative language and negated=true for explicit non-findings. Return an empty list if nothing qualifies.`,
        },
        { role: "user", content: `Source: ${doc.source} (${doc.source_url})\n\n${doc.text}` },
      ],
      text: { format: zodTextFormat(ClaimSchema, "extracted_claims") },
    });

    const claims = res.output_parsed?.claims ?? [];
    // Anti-hallucination guard: drop any claim whose quote is not actually in the source.
    const haystack = norm(doc.text);
    return claims.filter((c) => c.supporting_quote.length > 0 && haystack.includes(norm(c.supporting_quote)));
  }
}
