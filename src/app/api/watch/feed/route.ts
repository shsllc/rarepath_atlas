import { getServices } from "@/lib/services/registry";
import { CATEGORY_LABEL, diff, listWatchesFor, snapshotOf, watcherForFeed, type WatchCategory } from "@/lib/watch";
import { allow } from "@/lib/watch/limit";

export const maxDuration = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Private Atom feed of what is new for a watchlist since it was last marked as seen. Read-only:
 * the token in the URL cannot change the watchlist. Entries are machine-assembled discovery items
 * unless their category says "Reviewed relationships".
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("k") ?? "";
  const watcher = await watcherForFeed(token);
  if (!watcher) return new Response("Not found", { status: 404 });
  if (!allow(`feed:${token}`, 6)) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });

  const origin = new URL(req.url).origin;
  const watches = await listWatchesFor(watcher);
  const search = getServices().search;
  const entries: string[] = [];
  let updated = new Date(0).toISOString();
  for (const w of watches) {
    const snap = snapshotOf(await search.search(w.query));
    if (!snap) continue;
    const d = diff(w, snap.snapshot);
    for (const [cat, items] of Object.entries(d.new_items) as [WatchCategory, typeof d.new_items.papers][]) {
      for (const it of items.slice(0, 10)) {
        const id = `${origin}/watch#${w.id}:${encodeURIComponent(it.key)}`;
        if (d.checked_at > updated) updated = d.checked_at;
        entries.push(`<entry><id>${esc(id)}</id><title>${esc(`${w.label}: ${it.label}`)}</title><updated>${d.checked_at}</updated><category term="${esc(cat)}" label="${esc(CATEGORY_LABEL[cat])}"/>${it.url ? `<link href="${esc(it.url)}"/>` : ""}<summary>${esc(`${CATEGORY_LABEL[cat]}${cat === "reviewed" ? "" : " · machine-assembled discovery, not reviewed"}${it.detail ? ` · ${it.detail}` : ""}. New since ${w.last_seen_at.slice(0, 10)}.`)}</summary></entry>`);
      }
    }
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${esc(`${origin}/watch`)}</id><title>RarePath Atlas watchlist</title><updated>${updated === new Date(0).toISOString() ? new Date().toISOString() : updated}</updated><link rel="alternate" href="${esc(`${origin}/watch`)}"/>${entries.slice(0, 100).join("")}</feed>`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex" } });
}
