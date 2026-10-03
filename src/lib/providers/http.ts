/** Small polite-fetch helper: per-host spacing, timeout, retries on 429/5xx. */

const lastCall = new Map<string, number>();
const MIN_GAP_MS: Record<string, number> = {
  "eutils.ncbi.nlm.nih.gov": process.env.NCBI_API_KEY ? 110 : 350, // NCBI: 10 req/s with key, 3 req/s without
  default: 250,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const USER_AGENT = "RarePathAtlas/0.2 (Hack-Nation research prototype)";

export async function politeFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const host = new URL(url).host;
  const gap = MIN_GAP_MS[host] ?? MIN_GAP_MS.default;
  const wait = (lastCall.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());

  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(1000 * 2 ** attempt);
    return politeFetch(url, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  return (await politeFetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } })).json() as Promise<T>;
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  return (await politeFetch(url, init)).text();
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Collapse whitespace so quote checks are robust to line wrapping. */
export const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
