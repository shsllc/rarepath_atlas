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

const PREDICATE_GUIDE = `
Predicates (use exactly one):
- caused_by_variant_in: Disease -> Gene
- has_phenotype: Disease -> Phenotype (a clinical feature)
- phenotypically_overlaps: Disease -> Disease (text says they share features)
- clinically_differs_from: Disease -> Disease (text reports a difference in features, onset, severity, etc.)
- historically_classified_with: Disease -> Disease (text says one was formerly grouped/named as the other)
- classified_as_variant_of: Disease -> Disease (text asserts one IS a variant/subtype of the other)
- co_studied_with: Disease -> Disease (enrolled/compared in the same study)
- studied_in: Disease -> Study
- applied_to: ResearchAsset (scale, instrument, database, biobank) -> Disease
- produced_asset: Study -> ResearchAsset
- investigates: Researcher -> Study
- described_in: Study|ResearchAsset -> Paper
Never use predicates for treatments or drug effects; skip such statements entirely.`;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface ExtractionResult {
  claims: ExtractedClaim[];
  returned: number;
  dropped_unverified_quote: number;
  response_id: string;
  model: string;
}

/** Role 1 — Evidence Extractor. Keeps only claims whose quote appears verbatim in the source. */
export class OpenAIEvidenceExtractorImpl implements OpenAIEvidenceExtractor {
  async extract(doc: SourceDocument): Promise<ExtractedClaim[]> {
    return (await this.extractDetailed(doc)).claims;
  }

  async extractDetailed(doc: SourceDocument): Promise<ExtractionResult> {
    const openai = getOpenAI();
    if (!openai) throw new OpenAINotConfiguredError();

    const res = await openai.responses.parse({
      model: openAIModel(),
      input: [
        {
          role: "system",
          content: `${SAFETY_RULES}
Extract biomedical relationships stated in the text. Every claim MUST include a supporting_quote copied character-for-character from the text (one sentence or shorter).
Mark hedged=true for speculative language ("may", "appears", "possibly") and negated=true for explicit non-findings.
Use the entity names as written in the text. Return an empty list if nothing qualifies.
${PREDICATE_GUIDE}`,
        },
        { role: "user", content: `Source: ${doc.source} (${doc.source_url})\n\n${doc.text}` },
      ],
      text: { format: zodTextFormat(ClaimSchema, "extracted_claims") },
    });

    const all = res.output_parsed?.claims ?? [];
    // Anti-hallucination guard: drop any claim whose quote is not actually in the source.
    const haystack = norm(doc.text);
    const kept = all.filter((c) => c.supporting_quote.trim().length > 0 && haystack.includes(norm(c.supporting_quote)));
    return { claims: kept, returned: all.length, dropped_unverified_quote: all.length - kept.length, response_id: res.id, model: res.model };
  }
}
