/**
 * Runtime fetch for discovery providers: one short timeout per call, no retries,
 * polite identification (User-Agent + contact email where the provider asks for one).
 */
import { USER_AGENT } from "@/lib/providers/http";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: "timeout" | "network" | "http" | "invalid" | "rate_limited",
    detail = "",
  ) {
    super(`${provider}: ${reason}${detail ? ` (${detail})` : ""}`);
  }
}

/** Contact email for polite pools (OpenAlex, Crossref, NCBI). Read from env; never hard-coded. */
export const contactEmail = () => process.env.NCBI_EMAIL || process.env.CONTACT_EMAIL || "";
export const userAgent = () => (contactEmail() ? `${USER_AGENT}; mailto:${contactEmail()}` : USER_AGENT);

let fetchImpl: FetchLike = (u, i) => fetch(u, i);
/** Test seam: route all provider HTTP through a fake. */
export function setResearchFetch(f: FetchLike | null) {
  fetchImpl = f ?? ((u, i) => fetch(u, i));
}

export async function fetchJson<T>(provider: string, url: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": userAgent(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ProviderError(provider, (e as Error)?.name === "TimeoutError" ? "timeout" : "network");
  }
  if (res.status === 429) throw new ProviderError(provider, "rate_limited");
  if (!res.ok) throw new ProviderError(provider, "http", String(res.status));
  const json = (await res.json().catch(() => null)) as T | null;
  if (json == null) throw new ProviderError(provider, "invalid");
  return json;
}

/** Bound any promise by a deadline (used per provider so one slow source cannot stall a page). */
export function withDeadline<T>(p: Promise<T>, ms: number, provider: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ProviderError(provider, "timeout", `${ms}ms budget`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export const normDoi = (doi?: string | null) => (doi ? doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:/, "") : undefined);
export const normOrcid = (o?: string | null) => (o ? o.trim().replace(/^https?:\/\/orcid\.org\//, "").toUpperCase() : undefined);
export const normRor = (r?: string | null) => (r ? r.trim().replace(/^https?:\/\/ror\.org\//, "").toLowerCase() : undefined);
export const normName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The routed fetch, for clients that take a FetchLike (Open Targets, GWAS). */
export const researchFetch: FetchLike = (u, i) => fetchImpl(u, i);
