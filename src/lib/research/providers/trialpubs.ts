/**
 * Trial → publication enrichment via Europe PMC's text-mined accession index: papers in which the
 * NCT id of a registered study appears. Only the stable NCT identifier creates the link; a mention
 * is a navigation lead, never proof of a result.
 */
import { fetchJson, normDoi } from "../fetch";
import { link, type PaperRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord, type StudyRecord } from "../types";
import { EPMC_API, epmcPublicationStatus, paperKey } from "./europepmc";

/* eslint-disable @typescript-eslint/no-explicit-any */
export class TrialPublicationsProvider implements ResearchProvider {
  dependsOn = ["clinicaltrials" as const];
  meta = {
    id: "trialpubs" as const,
    name: "Europe PMC trial-publication links",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Papers mentioning a registered NCT id (text-mined accession)", "Trial → paper links", "Publication status"],
    homepage: "https://europepmc.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    // Completed and terminated studies first: those are the ones whose publications matter for reuse and caution.
    const rank = { completed: 0, caution: 1, active: 2, unknown: 3 } as const;
    const studies = ctx.upstream
      .filter((r): r is StudyRecord => r.kind === "study")
      .sort((a, b) => rank[a.status_category] - rank[b.status_category])
      .slice(0, 6);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    let total = 0;
    const res = await Promise.allSettled(
      studies.map((s) => fetchJson<{ hitCount: number; resultList: { result: any[] } }>("Europe PMC", `${EPMC_API}/search?query=${encodeURIComponent(`ACCESSION_ID:"${s.ids.nct}"`)}&resultType=lite&pageSize=3&format=json`, {}, 4_000)),
    );
    res.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const s = studies[i];
      total += r.value.hitCount ?? 0;
      for (const x of r.value.resultList?.result ?? []) {
        const ids = { doi: normDoi(x.doi), pmid: x.pmid as string | undefined, pmcid: x.pmcid as string | undefined };
        const key = paperKey(ids, `epmc:${x.source}:${x.id}`);
        const url = ids.pmid ? `https://europepmc.org/article/MED/${ids.pmid}` : `https://europepmc.org/article/${x.source}/${x.id}`;
        const prov = { provider: "trialpubs" as const, source_id: `${x.source}:${x.id}`, url, retrieved_at: at, native_type: "accession_mention" };
        records.push({
          kind: "paper",
          key,
          label: String(x.title ?? "").replace(/<[^>]+>/g, "").replace(/\.$/, ""),
          ids: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)) as PaperRecord["ids"],
          year: x.pubYear ? Number(x.pubYear) : undefined,
          venue: x.journalTitle,
          publication_status: epmcPublicationStatus({ source: x.source, pubTypeList: { pubType: String(x.pubType ?? "").split("; ") } }),
          publication_types: String(x.pubType ?? "").split("; ").filter(Boolean),
          authors: [],
          update_notices: [],
          provenance: [prov],
          review_status: "machine_assembled",
        });
        links.push(link({ from: key, to: s.key, relation: "paper_mentions_trial", native_evidence_type: "epmc_accession_mention", statement: `Europe PMC finds ${s.ids.nct} mentioned in this paper. A mention is a lead, not proof of a result.`, discovery_lead: true, provenance: [prov] }));
      }
    });
    return { records, links, totals: { trial_paper_mentions: total } };
  }
}
