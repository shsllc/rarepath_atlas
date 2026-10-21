/**
 * Weekly email digests for signed-in watchers (opt-in). The site prepares each email; the AWS
 * scheduled job sends it through Amazon SES and confirms, and only then are the items marked as sent.
 * Digests track their own "already emailed" sets, so they never change what the watchlist page shows
 * as new. Emails go only to the account's own verified address.
 */
import crypto from "node:crypto";
import { getStore } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { CATEGORY_LABEL, diff, listWatchesFor, snapshotOf, watcherId, type Snapshot, type Watch, type WatchCategory, type WatchEntry } from "./index";
import type { SearchResponse } from "@/lib/schemas";

export interface DigestSub {
  watcher: string;
  sub: string;
  email: string;
  enabled: boolean;
  token: string;
  created_at: string;
  last_sent?: string;
  /** Per watched search: item keys already emailed. */
  seen: Record<string, Partial<Record<WatchCategory, string[]>>>;
  /** Prepared but not yet confirmed as sent. */
  pending?: { prepared_at: string; seen: DigestSub["seen"] };
}

export interface PreparedEmail {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribe_url: string;
}

const K = { sub: (w: string) => `digest/sub/${w}`, token: (t: string) => `digest/token/${crypto.createHash("sha256").update(t).digest("hex").slice(0, 40)}` };
export const DIGEST_INTERVAL_MS = 6.5 * 86_400_000;
const MAX_SEEN = 500;
const CATS = Object.keys(CATEGORY_LABEL) as WatchCategory[];

export async function getDigest(watchKey: string) {
  return getStore().get<DigestSub>(K.sub(watcherId(watchKey)));
}

/** Turn the weekly digest on or off for a signed-in account's watchlist. */
export async function setDigest(watchKey: string, account: { sub: string; email: string; emailVerified: boolean }, enabled: boolean, watches: Watch[], now = new Date()) {
  if (enabled && !account.emailVerified) throw new Error("Confirm your email address first.");
  const w = watcherId(watchKey);
  const prev = await getStore().get<DigestSub>(K.sub(w));
  const token = prev?.token ?? crypto.randomBytes(24).toString("base64url");
  // Start from what the watchlist has already seen, so the first email only carries what is new.
  const seen = prev?.seen ?? Object.fromEntries(watches.map((x) => [x.id, x.seen]));
  const rec: DigestSub = { watcher: w, sub: account.sub, email: account.email, enabled, token, created_at: prev?.created_at ?? now.toISOString(), last_sent: prev?.last_sent, seen };
  await getStore().set(K.sub(w), rec);
  await getStore().set(K.token(token), { watcher: w });
  return rec;
}

/** One-click unsubscribe from an email link. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return false;
  const ref = await getStore().get<{ watcher: string }>(K.token(token));
  if (!ref) return false;
  const rec = await getStore().get<DigestSub>(K.sub(ref.watcher));
  if (!rec) return false;
  await getStore().set(K.sub(ref.watcher), { ...rec, enabled: false, pending: undefined });
  return true;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Build one email from the new items per watched search. Pure. */
export function renderDigest(sections: { label: string; query: string; items: Partial<Record<WatchCategory, WatchEntry[]>> }[], origin: string, unsubscribeUrl: string): { subject: string; text: string; html: string; total: number } {
  let total = 0;
  const text: string[] = [`New research on the conditions you watch on ${BRAND.name}.`, ""];
  const html: string[] = [`<div style="font-family:Arial,Helvetica,sans-serif;color:#182033;max-width:600px"><p style="font-size:16px">New research on the conditions you watch on <strong>${esc(BRAND.name)}</strong>.</p>`];
  for (const s of sections) {
    const cats = CATS.filter((c) => (s.items[c] ?? []).length > 0);
    if (!cats.length) continue;
    const url = `${origin}/results?q=${encodeURIComponent(s.query)}`;
    text.push(s.label.toUpperCase(), url);
    html.push(`<h2 style="font-size:18px;margin:24px 0 6px"><a href="${esc(url)}" style="color:#4f46a5">${esc(s.label)}</a></h2>`);
    for (const c of cats) {
      const list = s.items[c]!;
      total += list.length;
      const tag = c === "reviewed" ? "" : " (gathered automatically, not reviewed)";
      text.push(`  ${CATEGORY_LABEL[c]}: ${list.length} new${tag}`);
      html.push(`<p style="margin:10px 0 4px;font-size:13px;color:#4f5873"><strong>${esc(CATEGORY_LABEL[c])}</strong>: ${list.length} new${esc(tag)}</p><ul style="margin:0;padding-left:18px">`);
      for (const it of list.slice(0, 5)) {
        text.push(`   - ${it.label}${it.url ? ` <${it.url}>` : ""}`);
        html.push(`<li style="margin:3px 0">${it.url ? `<a href="${esc(it.url)}" style="color:#182033">${esc(it.label)}</a>` : esc(it.label)}${it.detail ? ` <span style="color:#4f5873;font-size:12px">${esc(it.detail)}</span>` : ""}</li>`);
      }
      if (list.length > 5) {
        text.push(`   … and ${list.length - 5} more`);
        html.push(`<li style="color:#4f5873">… and ${list.length - 5} more</li>`);
      }
      html.push("</ul>");
    }
    text.push("");
  }
  const foot = `Research navigation, not medical advice. You receive this because you turned on weekly digests for your watchlist. Stop these emails: ${unsubscribeUrl}`;
  text.push(foot);
  html.push(`<p style="margin-top:28px;font-size:12px;color:#4f5873">Research navigation, not medical advice. You receive this because you turned on weekly digests for your <a href="${esc(origin)}/watch">watchlist</a>. <a href="${esc(unsubscribeUrl)}">Stop these emails</a>.</p></div>`);
  const first = sections.find((s) => CATS.some((c) => (s.items[c] ?? []).length))?.label ?? "your watchlist";
  const others = sections.filter((s) => CATS.some((c) => (s.items[c] ?? []).length)).length - 1;
  return { subject: `New research: ${first}${others > 0 ? ` and ${others} more` : ""}`, text: text.join("\n"), html: html.join(""), total };
}

/** Prepare digests that are due. `search` runs (cached) searches for each watched query. */
export async function prepareDigests(search: (q: string) => Promise<SearchResponse>, origin: string, now = new Date(), limit = 200): Promise<PreparedEmail[]> {
  const st = getStore();
  const keys = (await st.list("digest/sub/")).slice(0, limit);
  const out: PreparedEmail[] = [];
  for (const k of keys) {
    const rec = await st.get<DigestSub>(k);
    if (!rec?.enabled || !rec.email) continue;
    if (rec.last_sent && now.getTime() - new Date(rec.last_sent).getTime() < DIGEST_INTERVAL_MS) continue;
    const watches = await listWatchesFor(rec.watcher);
    const sections: { label: string; query: string; items: Partial<Record<WatchCategory, WatchEntry[]>> }[] = [];
    const nextSeen: DigestSub["seen"] = { ...rec.seen };
    for (const w of watches) {
      const snap = snapshotOf(await search(w.query));
      if (!snap) continue;
      const base: Watch = { ...w, seen: { ...w.seen, ...(rec.seen[w.id] ?? {}) } as Watch["seen"] };
      const d = diff(base, snap.snapshot, now);
      sections.push({ label: w.label, query: w.query, items: d.new_items });
      nextSeen[w.id] = Object.fromEntries(CATS.map((c) => [c, [...new Set([...snap.snapshot[c].map((x) => x.key), ...(base.seen[c] ?? [])])].slice(0, MAX_SEEN)]));
    }
    const unsubscribeUrl = `${origin}/api/watch/unsubscribe?t=${rec.token}`;
    const email = renderDigest(sections, origin, unsubscribeUrl);
    if (email.total === 0) {
      // Nothing new: record the check without sending, so the next look is a week later.
      await st.set(k, { ...rec, last_sent: now.toISOString(), seen: nextSeen, pending: undefined });
      continue;
    }
    await st.set(k, { ...rec, pending: { prepared_at: now.toISOString(), seen: nextSeen } });
    out.push({ id: rec.watcher, to: rec.email, subject: email.subject, text: email.text, html: email.html, unsubscribe_url: unsubscribeUrl });
  }
  return out;
}

/** The sender confirms which digests went out; only those advance. */
export async function confirmSent(ids: string[], now = new Date()) {
  const st = getStore();
  let n = 0;
  for (const id of ids.slice(0, 500)) {
    if (!/^[a-f0-9]{40}$/.test(id)) continue;
    const rec = await st.get<DigestSub>(K.sub(id));
    if (!rec?.pending) continue;
    await st.set(K.sub(id), { ...rec, seen: rec.pending.seen, pending: undefined, last_sent: now.toISOString() });
    n++;
  }
  return n;
}

export type { Snapshot };
