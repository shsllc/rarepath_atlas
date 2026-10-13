import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/review/http";
import { getServices } from "@/lib/services/registry";
import { addWatch, diff, forgetAll, getWatch, markSeen, newWatchKey, registerFeed, removeWatch, snapshotOf, validKey, WATCH_COOKIE, WatchError } from "@/lib/watch";
import { allow } from "@/lib/watch/limit";

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 365 * 24 * 3600 };

async function current(query: string) {
  const snap = snapshotOf(await getServices().search.search(query));
  if (!snap) throw new WatchError("RarePath has nothing to watch for this search yet.", 422);
  return snap;
}

/** One endpoint: { action: "add" | "check" | "seen" | "remove" | "forget", query? }. */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new WatchError("Cross-site request refused.", 403);
    const text = await req.text();
    if (text.length > 1_024) throw new WatchError("Request too large.", 413);
    let body: { action?: string; query?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new WatchError("Invalid JSON body.");
    }
    const action = String(body.action ?? "");
    const query = String(body.query ?? "").trim().slice(0, 120);
    const jar = await cookies();
    let key = jar.get(WATCH_COOKIE)?.value;
    const fresh = !validKey(key);
    if (action === "add" && fresh) key = newWatchKey();
    if (!validKey(key)) throw new WatchError("This browser has no watchlist yet.", 404);
    if (!allow(`watch:${key}`, 20)) throw new WatchError("Too many requests. Try again in a minute.", 429);

    let payload: unknown = { ok: true };
    switch (action) {
      case "add": {
        if (!query) throw new WatchError("Nothing to watch.");
        const watch = await addWatch(key, query, await current(query));
        await registerFeed(key);
        payload = { ok: true, watch: { id: watch.id, label: watch.label, query: watch.query } };
        break;
      }
      case "check": {
        const watch = await getWatch(key, query);
        if (!watch) throw new WatchError("Not on your watchlist.", 404);
        payload = { ok: true, diff: diff(watch, (await current(query)).snapshot) };
        break;
      }
      case "seen":
        await markSeen(key, query, (await current(query)).snapshot);
        break;
      case "remove":
        await removeWatch(key, query);
        break;
      case "forget":
        await forgetAll(key);
        break;
      default:
        throw new WatchError("Unknown action.");
    }
    const res = NextResponse.json(payload);
    if (action === "forget") res.cookies.set(WATCH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    else if (fresh) res.cookies.set(WATCH_COOKIE, key, cookieOptions);
    return res;
  } catch (e) {
    if (e instanceof WatchError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong. Nothing was changed." }, { status: 500 });
  }
}
