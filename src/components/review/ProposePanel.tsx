import type { DiscoveryPreview } from "@/lib/discovery";
import { toCandidateEdge } from "@/lib/discovery";
import { ProposeButton } from "./ReviewActions";

/** Shown only to signed-in reviewers: the discovery links that could be promoted after review. */
export function ProposePanel({ preview, query, reviewerName }: { preview: DiscoveryPreview; query: string; reviewerName: string }) {
  const links = preview.links.filter((l) => toCandidateEdge(l) !== null).slice(0, 60);
  return (
    <section className="rounded-2xl border-2 border-brand bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-brand">Reviewer · send relationships to review</h2>
      <p className="mt-1 text-xs text-muted">
        Signed in as {reviewerName}. Sending a relationship does not change the reviewed graph: it enters the queue, where a reviewer must open the source and accept it with a note.
      </p>
      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No relationships in this preview map to a reviewable claim type.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {links.map((l) => (
            <li key={l.key} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span>
                {l.statement}
                <span className="mt-0.5 block text-[11px] text-muted">
                  {l.provenance.map((p) => (
                    <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="mr-2 hover:underline">
                      {p.provider} ↗
                    </a>
                  ))}
                  {l.discovery_lead && "· navigation lead"}
                </span>
              </span>
              <ProposeButton query={query} linkKey={l.key} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
