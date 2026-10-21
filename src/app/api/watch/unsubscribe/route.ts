import { unsubscribe } from "@/lib/watch/digest";
import { BRAND } from "@/lib/brand";

/** One-click unsubscribe from a digest email link. GET so it works from any mail client. */
export async function GET(req: Request) {
  const ok = await unsubscribe(new URL(req.url).searchParams.get("t") ?? "");
  const msg = ok ? "You will not receive weekly digests any more. Your watchlist is unchanged." : "This link is not valid any more. You can turn digests off on your watchlist page.";
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND.name}</title><body style="font-family:Arial,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;color:#182033"><h1 style="font-size:22px">${ok ? "Digests turned off" : "Link expired"}</h1><p>${msg}</p><p><a href="/watch" style="color:#4f46a5">Open your watchlist</a></p></body>`;
  return new Response(html, { status: ok ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/** RFC 8058 one-click unsubscribe (mail clients POST to the same URL). */
export const POST = GET;
