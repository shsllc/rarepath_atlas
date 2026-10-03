import type { SourceRecord } from "@/lib/schemas";
import type { PatientOrganizationProvider } from "@/lib/services/interfaces";
import { getText, normalizeText, today } from "./http";

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Reads only the <title> and meta description of an official homepage. No crawling. */
export class HomepageOrgProvider implements PatientOrganizationProvider {
  async fetchHomepage(id: string, url: string): Promise<SourceRecord> {
    const html = await getText(url, { headers: { Accept: "text/html" } });
    const title = normalizeText(decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""));
    const desc =
      /<meta[^>]+name=["']description["'][^>]+content=(["'])(.*?)\1/i.exec(html)?.[2] ??
      /<meta[^>]+property=["']og:description["'][^>]+content=(["'])(.*?)\1/i.exec(html)?.[2] ??
      "";
    if (!title) throw new Error(`No <title> at ${url}`);
    return {
      id: `org:${id}`,
      kind: "org_homepage",
      title,
      url,
      retrieval_date: today(),
      retrieved_via: "HTTP GET of official homepage (title + meta description only)",
      text: [`Page title: ${title}`, `Meta description: ${normalizeText(decode(desc))}`].join("\n"),
      citation: {},
      authors: [],
      publication_types: [],
      meta: {},
    };
  }
}
