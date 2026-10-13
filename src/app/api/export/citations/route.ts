import { getServices } from "@/lib/services/registry";
import { citationsFor, toBibTeX, toRIS } from "@/lib/export/citations";
import { clientIp } from "@/lib/guardrails";
import { allow } from "@/lib/watch/limit";

export const maxDuration = 60;

/** GET ?q=<search>&format=bibtex|ris → the sources behind a search, reviewed first, discovery tagged. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "bibtex" && format !== "ris") return new Response("format must be bibtex or ris", { status: 400 });
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (!q) return new Response("q is required", { status: 400 });
  if (!allow(`export:${clientIp(req)}`, 10)) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  const cs = citationsFor(await getServices().search.search(q));
  if (cs.length === 0) return new Response("No citable sources for this search.", { status: 404 });
  const name = `rarepath-sources-${q.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
  return format === "bibtex"
    ? new Response(toBibTeX(cs), { headers: { "Content-Type": "application/x-bibtex; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.bib"`, "Cache-Control": "no-store" } })
    : new Response(toRIS(cs), { headers: { "Content-Type": "application/x-research-info-systems; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.ris"`, "Cache-Control": "no-store" } });
}
