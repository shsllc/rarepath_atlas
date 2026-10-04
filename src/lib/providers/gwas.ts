/**
 * GWAS Catalog REST API v2 adapter (runtime, discovery layer only).
 * https://www.ebi.ac.uk/gwas/rest/api/v2/ — the retired v1 endpoints are not used.
 */
import { USER_AGENT } from "./http";
import { SourceUnavailableError, type FetchLike } from "./opentargets";

export const GWAS_API = "https://www.ebi.ac.uk/gwas/rest/api/v2";
export const GWAS_WEB = "https://www.ebi.ac.uk/gwas";

export interface GwasAssociation {
  association_id: number;
  p_value: number | null;
  pvalue_mantissa: number | null;
  pvalue_exponent: number | null;
  accession_id: string | null;
  pubmed_id: string | null;
  first_author: string | null;
  mapped_genes: string[] | null;
  reported_trait: string[] | null;
  snp_allele: { rs_id: string; effect_allele?: string }[] | null;
}

export class GwasCatalogClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 6_000,
  ) {}

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${GWAS_API}${path}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      throw new SourceUnavailableError("GWAS Catalog", (e as Error)?.name === "TimeoutError" ? "timeout" : "network error");
    }
    if (!res.ok) throw new SourceUnavailableError("GWAS Catalog", `HTTP ${res.status}`);
    const json = (await res.json().catch(() => null)) as T | null;
    if (!json) throw new SourceUnavailableError("GWAS Catalog", "invalid response");
    return json;
  }

  /** Strongest associations for an ontology trait id (e.g. MONDO_0004975), with the total count. */
  async associationsForTrait(efoId: string, size = 6): Promise<{ total: number; rows: GwasAssociation[] }> {
    const j = await this.get<{ _embedded?: { associations?: GwasAssociation[] }; page?: { totalElements?: number } }>(
      `/associations?efo_id=${encodeURIComponent(efoId)}&size=${size}&sort=p_value&direction=asc`,
    );
    return { total: j.page?.totalElements ?? 0, rows: j._embedded?.associations ?? [] };
  }
}
