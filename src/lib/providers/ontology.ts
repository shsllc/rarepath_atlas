import type { SourceRecord } from "@/lib/schemas";
import type { OntologyProvider } from "@/lib/services/interfaces";
import { getJson, normalizeText, today } from "./http";

const OLS = "https://www.ebi.ac.uk/ols4/api";
const iri = (oboId: string) => encodeURIComponent(encodeURIComponent(`http://purl.obolibrary.org/obo/${oboId.replace(":", "_")}`));

/* eslint-disable @typescript-eslint/no-explicit-any */

/** MONDO and HPO through EBI OLS4; genes through HGNC REST. */
export class OlsOntologyProvider implements OntologyProvider {
  async searchTerms(ontology: "mondo" | "hp", query: string, rows = 5) {
    const data = await getJson<any>(`${OLS}/search?q=${encodeURIComponent(query)}&ontology=${ontology}&rows=${rows}&fieldList=obo_id,label`);
    return (data.response.docs as any[]).map((d) => ({ obo_id: d.obo_id as string, label: d.label as string }));
  }

  async getTerm(ontology: "mondo" | "hp", oboId: string): Promise<SourceRecord> {
    const d = await getJson<any>(`${OLS}/ontologies/${ontology}/terms/${iri(oboId)}`);
    if (d.obo_id !== oboId) throw new Error(`OLS returned ${d.obo_id} for ${oboId}`);
    if (d.is_obsolete) throw new Error(`${oboId} is obsolete`);
    const xrefs = ((d.annotation?.database_cross_reference ?? []) as string[]).filter((x) => /^(OMIM|Orphanet|GARD|DOID|MESH|UMLS):/.test(x));
    const synonyms = (d.synonyms ?? []) as string[];
    const definition = normalizeText((d.description ?? [""])[0] ?? "");
    const text = [`Label: ${d.label}`, `ID: ${oboId}`, `Definition: ${definition}`, `Synonyms: ${synonyms.join("; ")}`, `Cross-references: ${xrefs.join("; ")}`].join("\n");
    const browse =
      ontology === "hp" ? `https://hpo.jax.org/browse/term/${oboId}` : `https://monarchinitiative.org/${oboId}`;
    return {
      id: `${ontology}:${oboId}`,
      kind: "ontology_term",
      title: `${oboId} ${d.label}`,
      url: browse,
      retrieval_date: today(),
      retrieved_via: `EBI OLS4 /ontologies/${ontology}/terms`,
      text,
      citation: {},
      authors: [],
      publication_types: [],
      meta: { label: d.label, synonyms, xrefs, ontology },
    };
  }

  async getGene(symbol: string): Promise<SourceRecord> {
    const data = await getJson<any>(`https://rest.genenames.org/fetch/symbol/${encodeURIComponent(symbol)}`);
    const g = data.response.docs[0];
    if (!g || g.symbol !== symbol) throw new Error(`HGNC has no approved symbol ${symbol}`);
    const text = [`Approved symbol: ${g.symbol}`, `HGNC ID: ${g.hgnc_id}`, `Approved name: ${g.name}`, `Previous symbols: ${(g.prev_symbol ?? []).join("; ")}`, `Location: ${g.location}`].join("\n");
    return {
      id: `hgnc:${g.hgnc_id}`,
      kind: "gene_record",
      title: `${g.symbol} (${g.hgnc_id})`,
      url: `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${g.hgnc_id}`,
      retrieval_date: today(),
      retrieved_via: "HGNC REST /fetch/symbol",
      text,
      citation: {},
      authors: [],
      publication_types: [],
      meta: { hgnc_id: g.hgnc_id, symbol: g.symbol, prev_symbol: g.prev_symbol ?? [] },
    };
  }
}
