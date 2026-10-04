/**
 * Open Targets Platform GraphQL adapter (runtime, discovery layer only).
 * https://api.platform.opentargets.org/api/v4/graphql — no key required.
 *
 * Everything returned here is machine-assembled: it never enters the reviewed bundle.
 * Requests are short-timeout and un-retried so a slow API cannot stall a page render.
 */
import { USER_AGENT } from "./http";

export const OPEN_TARGETS_API = "https://api.platform.opentargets.org/api/v4/graphql";
export const OPEN_TARGETS_WEB = "https://platform.opentargets.org";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class SourceUnavailableError extends Error {
  constructor(
    readonly source: string,
    detail: string,
  ) {
    super(`${source} unavailable: ${detail}`);
  }
}

export interface OTSearchHit {
  id: string;
  name: string;
  description?: string | null;
}
export interface OTAssociatedTarget {
  score: number;
  target: { id: string; approvedSymbol: string; approvedName: string };
  datatypeScores: { id: string; score: number }[];
}
export interface OTDrugRow {
  maxClinicalStage: string | null;
  drug: { id: string; name: string; drugType: string | null } | null;
}
export interface OTDisease {
  id: string;
  name: string;
  description: string | null;
  dbXRefs: string[] | null;
  synonyms: { relation: string; terms: string[] }[] | null;
  therapeuticAreas: { id: string; name: string }[] | null;
  parents: { id: string; name: string }[] | null;
  children: { id: string; name: string }[] | null;
  associatedTargets: { count: number; rows: OTAssociatedTarget[] } | null;
  phenotypes: { count: number; rows: { phenotypeHPO: { id: string; name: string } | null }[] } | null;
  drugAndClinicalCandidates: { count: number; rows: OTDrugRow[] } | null;
}
export interface OTVariantEvidence {
  datasourceId: string;
  target: { approvedSymbol: string; id: string } | null;
  variant: { id: string; rsIds: string[] | null } | null;
  variantRsId: string | null;
  clinicalSignificances: string[] | null;
  studyId: string | null;
  confidence: string | null;
}

const SEARCH = `query Search($q: String!) {
  search(queryString: $q, entityNames: ["disease"], page: { index: 0, size: 5 }) { total hits { id name description } }
}`;

const DISEASE = `query Disease($id: String!) {
  meta { apiVersion { x y z } dataVersion { year month } }
  disease(efoId: $id) {
    id name description dbXRefs
    synonyms { relation terms }
    therapeuticAreas { id name }
    parents { id name }
    children { id name }
    associatedTargets(page: { index: 0, size: 12 }) {
      count rows { score target { id approvedSymbol approvedName } datatypeScores { id score } }
    }
    phenotypes(page: { index: 0, size: 12 }) { count rows { phenotypeHPO { id name } } }
    drugAndClinicalCandidates { count rows { maxClinicalStage drug { id name drugType } } }
  }
}`;

const VARIANTS = `query Variants($id: String!, $targets: [String!]!) {
  disease(efoId: $id) {
    evidences(ensemblIds: $targets, datasourceIds: ["eva"], size: 8) {
      count rows { datasourceId target { id approvedSymbol } variant { id rsIds } variantRsId clinicalSignificances studyId confidence }
    }
  }
}`;

export class OpenTargetsClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 7_000,
  ) {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(OPEN_TARGETS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new SourceUnavailableError("Open Targets", (e as Error)?.name === "TimeoutError" ? "timeout" : "network error");
    }
    if (!res.ok) throw new SourceUnavailableError("Open Targets", `HTTP ${res.status}`);
    const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
    if (!json || json.errors?.length || !json.data) throw new SourceUnavailableError("Open Targets", json?.errors?.[0]?.message ?? "invalid response");
    return json.data;
  }

  async searchDiseases(q: string): Promise<{ total: number; hits: OTSearchHit[] }> {
    const d = await this.gql<{ search: { total: number; hits: OTSearchHit[] } }>(SEARCH, { q });
    return d.search;
  }

  async disease(id: string): Promise<{ disease: OTDisease | null; apiVersion: string; dataVersion: string }> {
    const d = await this.gql<{ disease: OTDisease | null; meta: { apiVersion: { x: string; y: string; z: string }; dataVersion: { year: string; month: string } } }>(DISEASE, { id });
    const v = d.meta?.apiVersion;
    const dv = d.meta?.dataVersion;
    return { disease: d.disease, apiVersion: v ? `${v.x}.${v.y}.${v.z}` : "unknown", dataVersion: dv ? `${dv.year}.${dv.month}` : "unknown" };
  }

  /** ClinVar (via EVA) variant evidence for the given targets in this disease. */
  async clinvarVariants(id: string, ensemblIds: string[]): Promise<{ count: number; rows: OTVariantEvidence[] }> {
    if (ensemblIds.length === 0) return { count: 0, rows: [] };
    const d = await this.gql<{ disease: { evidences: { count: number; rows: OTVariantEvidence[] } } | null }>(VARIANTS, { id, targets: ensemblIds });
    return d.disease?.evidences ?? { count: 0, rows: [] };
  }
}
