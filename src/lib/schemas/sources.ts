import { z } from "zod";

/**
 * A retrieved source, stored verbatim so every quote can be re-verified.
 * `text` is exactly what the Evidence Extractor saw.
 */
export const SourceRecord = z.object({
  id: z.string(), // e.g. "pubmed:32472944", "ctgov:NCT02738281", "mondo:0100039"
  kind: z.enum(["pubmed_abstract", "pmc_excerpt", "ctgov_record", "ontology_term", "gene_record", "org_homepage", "funding_record"]),
  title: z.string(),
  url: z.string().url(),
  retrieval_date: z.string(), // ISO date
  retrieved_via: z.string(), // the API endpoint family used
  text: z.string(),
  citation: z
    .object({ pmid: z.string().optional(), pmcid: z.string().optional(), doi: z.string().optional(), nct: z.string().optional() })
    .default({}),
  authors: z.array(z.string()).default([]),
  pub_date: z.string().optional(),
  journal: z.string().optional(),
  publication_types: z.array(z.string()).default([]),
  /** Reuse terms for the stored text (e.g. PMC text-mining license). */
  license_note: z.string().optional(),
  /** Extra structured fields from the API response. */
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type SourceRecord = z.infer<typeof SourceRecord>;
