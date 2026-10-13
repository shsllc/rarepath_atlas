/**
 * Watchlists without accounts.
 *
 * A browser holds a random 32-byte key in an HttpOnly cookie. Only sha256(key) is used server-side,
 * so the stored data cannot be tied back to the cookie or to a person. What someone watches can reveal
 * a family's health situation, so nothing else (no email, no name, no IP) is stored.
 *
 * Each watched search keeps the set of items already seen. "What's new" is the difference between the
 * current results and that set: papers, preprints, studies, NIH projects and reviewed relationships.
 */
import crypto from "node:crypto";
import { getStore } from "@/lib/store";
import type { EvidenceEdge, GraphNode, SearchResponse } from "@/lib/schemas";
import { PREDICATE_LABEL } from "@/lib/format";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import type { DiscoveryPreview } from "@/lib/discovery";

export const WATCH_COOKIE = "rp_watch";
export const MAX_WATCHES = 10;
const MAX_SEEN = 500;

export type WatchCategory = "reviewed" | "papers" | "preprints" | "studies" | "grants";
export const CATEGORY_LABEL: Record<WatchCategory, string> = {
  reviewed: "Reviewed relationships",
  papers: "Papers",
  preprints: "Preprints (not peer reviewed)",
  studies: "Clinical studies",
  grants: "NIH-funded projects",
};

export interface WatchEntry {
  key: string;
  label: string;
  url?: string;
  detail?: string;
}
export type Snapshot = Record<WatchCategory, WatchEntry[]>;

export interface Watch {
  id: string;
  query: string;
  label: string;
  added_at: string;
  last_seen_at: string;
  seen: Record<WatchCategory, string[]>;
}
export interface WatchDiff {
  watch: Watch;
  checked_at: string;
  new_items: Record<WatchCategory, WatchEntry[]>;
  total_new: number;
}

export class WatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const newWatchKey = () => crypto.randomBytes(32).toString("base64url");
export const watcherId = (key: string) => crypto.createHash("sha256").update(`rp-watch|${key}`).digest("hex").slice(0, 40);
export const validKey = (key: string | undefined): key is string => !!key && /^[A-Za-z0-9_-]{43}$/.test(key);
const norm = (q: string) => q.trim().replace(/\s+/g, " ").slice(0, 120);
const watchId = (q: string) => crypto.createHash("sha256").update(norm(q).toLowerCase()).digest("hex").slice(0, 16);
const K = { watch: (w: string, id: string) => `watch/${w}/${id}`, prefix: (w: string) => `watch/${w}/`, feed: (h: string) => `watchfeed/${h}` };

/**
 * Read-only feed token derived from the browser key. The feed URL cannot be turned back into the key,
 * so sharing it with a feed reader never lets anyone change the watchlist.
 */
export const feedToken = (key: string) => crypto.createHash("sha256").update(`rp-feed|${key}`).digest("base64url");
const feedHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);

export async function registerFeed(key: string) {
  await getStore().create(K.feed(feedHash(feedToken(key))), { watcher: watcherId(key) });
}
export async function watcherForFeed(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (await getStore().get<{ watcher: string }>(K.feed(feedHash(token))))?.watcher ?? null;
}

const CATS: WatchCategory[] = ["reviewed", "papers", "preprints", "studies", "grants"];
const empty = <T>(f: () => T) => Object.fromEntries(CATS.map((c) => [c, f()])) as Record<WatchCategory, T>;

function fromPreview(p: DiscoveryPreview, s: Snapshot) {
  const lit = p.literature;
  const preprintKeys = new Set(lit.preprints.map((x) => x.key));
  for (const x of [...lit.top, ...lit.most_cited, ...lit.recent]) if (!preprintKeys.has(x.key)) s.papers.push({ key: x.key, label: x.label, url: x.url, detail: [x.year, x.venue].filter(Boolean).join(" · ") });
  for (const x of lit.preprints) s.preprints.push({ key: x.key, label: x.label, url: x.url, detail: [x.year, x.venue].filter(Boolean).join(" · ") });
  for (const x of p.clinical.studies) s.studies.push({ key: `study:${x.nct}`, label: x.official_title ?? x.nct, url: x.url, detail: `${x.nct} · ${x.status_label}` });
  for (const x of p.funding.projects) s.grants.push({ key: `grant:${x.core}`, label: x.title, url: x.url, detail: [x.core, x.fiscal_year ? `FY${x.fiscal_year}` : "", x.institution].filter(Boolean).join(" · ") });
}

/** What a search currently shows, per category. Pure. */
export function snapshotOf(r: SearchResponse): { label: string; snapshot: Snapshot } | null {
  const s = empty<WatchEntry[]>(() => []);
  const reviewed = (edges: EvidenceEdge[], nodes: GraphNode[]) => {
    const label = new Map(nodes.map((n) => [n.id, n.label]));
    for (const e of edges.filter(isReviewedEvidenceEdge))
      s.reviewed.push({ key: e.id, label: `${label.get(e.subject_id) ?? e.subject_id} ${PREDICATE_LABEL[e.predicate]} ${label.get(e.object_id) ?? e.object_id}`, url: e.source_url, detail: e.source });
  };
  if ("discovery" in r) {
    fromPreview(r.preview, s);
    return { label: r.preview.disease.label, snapshot: s };
  }
  if ("partial" in r) {
    reviewed(r.edges, r.nodes);
    if (r.preview) fromPreview(r.preview, s);
    return { label: r.coverage.label, snapshot: s };
  }
  if (r.found) {
    reviewed(r.edges, r.nodes);
    return { label: r.nodes.find((n) => n.id === r.disease.node_id)?.label ?? r.query, snapshot: s };
  }
  return null;
}

export async function listWatches(key: string): Promise<Watch[]> {
  return listWatchesFor(watcherId(key));
}
export async function listWatchesFor(watcher: string): Promise<Watch[]> {
  const st = getStore();
  const keys = await st.list(K.prefix(watcher));
  const out = await Promise.all(keys.map((k) => st.get<Watch>(k)));
  return out.filter((w): w is Watch => !!w).sort((a, b) => a.added_at.localeCompare(b.added_at));
}

export async function getWatch(key: string, query: string) {
  return getStore().get<Watch>(K.watch(watcherId(key), watchId(query)));
}

export async function addWatch(key: string, query: string, current: { label: string; snapshot: Snapshot }, now = new Date()): Promise<Watch> {
  const q = norm(query);
  if (!q) throw new WatchError("Nothing to watch.");
  const w = watcherId(key);
  const existing = await getStore().get<Watch>(K.watch(w, watchId(q)));
  if (existing) return existing;
  if ((await getStore().list(K.prefix(w))).length >= MAX_WATCHES) throw new WatchError(`A watchlist holds up to ${MAX_WATCHES} searches. Remove one first.`, 409);
  const at = now.toISOString();
  const watch: Watch = { id: watchId(q), query: q, label: current.label, added_at: at, last_seen_at: at, seen: seenFrom(current.snapshot) };
  await getStore().set(K.watch(w, watch.id), watch);
  return watch;
}

export async function removeWatch(key: string, query: string) {
  await getStore().delete(K.watch(watcherId(key), watchId(query)));
}

export async function forgetAll(key: string) {
  const st = getStore();
  for (const k of await st.list(K.prefix(watcherId(key)))) await st.delete(k);
  await st.delete(K.feed(feedHash(feedToken(key))));
}

const seenFrom = (s: Snapshot) => Object.fromEntries(CATS.map((c) => [c, s[c].map((x) => x.key).slice(0, MAX_SEEN)])) as Record<WatchCategory, string[]>;

/** Items in `current` that the watch has not seen yet. Pure. */
export function diff(watch: Watch, current: Snapshot, now = new Date()): WatchDiff {
  const new_items = empty<WatchEntry[]>(() => []);
  let total = 0;
  for (const c of CATS) {
    const seen = new Set(watch.seen[c] ?? []);
    const fresh = current[c].filter((x, i, a) => !seen.has(x.key) && a.findIndex((y) => y.key === x.key) === i);
    new_items[c] = fresh;
    total += fresh.length;
  }
  return { watch, checked_at: now.toISOString(), new_items, total_new: total };
}

/** Mark everything currently shown as seen (keeps older seen keys, newest first, capped). */
export async function markSeen(key: string, query: string, current: Snapshot, now = new Date()): Promise<Watch> {
  const w = watcherId(key);
  const watch = await getStore().get<Watch>(K.watch(w, watchId(query)));
  if (!watch) throw new WatchError("Not on your watchlist.", 404);
  for (const c of CATS) watch.seen[c] = [...new Set([...current[c].map((x) => x.key), ...(watch.seen[c] ?? [])])].slice(0, MAX_SEEN);
  watch.last_seen_at = now.toISOString();
  await getStore().set(K.watch(w, watch.id), watch);
  return watch;
}
