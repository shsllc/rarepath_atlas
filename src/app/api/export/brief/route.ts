import { getServices } from "@/lib/services/registry";
import { briefDocFrom, type BriefDoc } from "@/lib/export/brief-doc";
import { briefToDocx, briefToPdf } from "@/lib/export/render";
import { getShare } from "@/lib/export/share";
import { clientIp } from "@/lib/guardrails";
import { allow } from "@/lib/watch/limit";

export const maxDuration = 60;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "brief";

/** GET ?q=<search>&format=docx|pdf, or ?share=<id>&format=… for a frozen snapshot. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "docx" && format !== "pdf") return new Response("format must be docx or pdf", { status: 400 });
  if (!allow(`export:${clientIp(req)}`, 10)) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });

  let doc: BriefDoc | null = null;
  const share = url.searchParams.get("share");
  if (share) doc = (await getShare(share))?.brief ?? null;
  else {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    if (q) doc = briefDocFrom(await getServices().search.search(q), url.origin);
  }
  if (!doc) return new Response("No Research Action Brief is available for this search.", { status: 404 });

  const name = `rarepath-brief-${slug(doc.disease)}-${doc.generated_at.slice(0, 10)}`;
  if (format === "docx") {
    const buf = await briefToDocx(doc);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"`, "Cache-Control": "no-store" } });
  }
  const pdf = await briefToPdf(doc);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
