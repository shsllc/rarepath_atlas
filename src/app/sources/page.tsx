import Link from "next/link";
import type { Metadata } from "next";
import { researchSources, type SourceUse } from "@/lib/research/registry";
import { DiscoveryOrchestrator } from "@/lib/research/orchestrator";
import { getServices } from "@/lib/services/registry";
import { EvidenceTierChip } from "@/components/EvidenceTierChip";

export const metadata: Metadata = { title: "Research sources · RarePath Atlas" };
export const dynamic = "force-dynamic";

const USE_LABEL: Record<SourceUse, string> = {
  discovery: "Discovery source (machine-assembled)",
  metadata: "Metadata / reconciliation source",
  reviewed_ingestion: "Reviewed-evidence source (after analyst review)",
};

const LIVE_ID: Record<string, string> = {
  "Open Targets Platform": "opentargets",
  "GWAS Catalog (REST API v2)": "gwas",
  "ClinicalTrials.gov (API v2)": "clinicaltrials",
  "Europe PMC": "europepmc",
  OpenAlex: "openalex",
  Crossref: "crossref",
  DataCite: "datacite",
};

export default function SourcesPage() {
  const sources = researchSources();
  const bundle = getServices().graph.bundle();
  const offlineDates = [...new Set(bundle.sources.map((s) => s.retrieval_date))].sort();
  const lastOffline = offlineDates.at(-1);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Transparency</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Research sources</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Live sources assemble a discovery preview at search time. Offline sources were retrieved, stored verbatim and analyst-reviewed into the CDKL5 journey. Only reviewed evidence can drive ranking or a Research Action Brief.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <EvidenceTierChip tier="machine_assembled" />
          <EvidenceTierChip tier="reviewed" />
        </div>
      </div>
      <ul className="space-y-3">
        {sources.map((s) => {
          const last = s.mode === "live" ? DiscoveryOrchestrator.lastSuccess.get(LIVE_ID[s.name] as never) : lastOffline;
          return (
            <li key={s.name} className={`rounded-2xl bg-white p-5 ${s.mode === "live" ? "border-2 border-dashed border-line" : "border-2 border-solid border-supported/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <a href={s.homepage} target="_blank" rel="noreferrer" className="text-lg font-semibold hover:text-brand">
                    {s.name}
                  </a>
                  <p className="mt-1 text-xs text-muted">{s.data_types.join(" · ")}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${s.mode === "live" ? "border-2 border-dashed border-unknown text-unknown" : "border-2 border-solid border-supported text-supported"}`}>
                  {s.mode === "live" ? "◌ LIVE" : "✓ OFFLINE · STORED"}
                </span>
              </div>
              <p className="mt-2 text-sm">
                {s.uses.map((u) => (
                  <span key={u} className="font-semibold">
                    {USE_LABEL[u]}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-xs text-muted">{s.note}</p>
              <p className="mt-1 text-[11px] text-muted">
                {s.mode === "live" ? (last ? `Last successful retrieval on this server: ${last.slice(0, 16).replace("T", " ")} UTC` : "Queried live on each discovery search (not yet queried on this server instance).") : `Retrieved ${last ?? "offline"} and stored in the reviewed bundle.`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Deduplication: records from different sources merge only on stable identifiers (DOI, PMID, PMCID, MONDO, Ensembl, ORCID, ROR, NCT, dataset DOI), never on a person&apos;s name alone. Every contributing source stays listed on the merged record.{" "}
        <Link href="/" className="text-brand hover:underline">
          Back to RarePath
        </Link>
      </p>
    </div>
  );
}
