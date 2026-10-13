import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/export/share";
import { BRIEF_FOOTER, briefSections, briefSubtitle, briefTitle } from "@/lib/export/brief-doc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared Research Action Brief · RarePath Atlas", robots: { index: false } };

export default async function SharedBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getShare(id);
  if (!s) notFound();
  const d = s.brief;
  return (
    <article className="space-y-4">
      <div role="note" className="rounded-xl border border-dashed border-unknown bg-unknown-bg px-4 py-3 text-sm">
        A frozen copy taken on {s.created_at.slice(0, 10)}. The evidence may have changed since.{" "}
        <Link href={`/results?q=${encodeURIComponent(s.query)}`} className="font-semibold text-brand underline">
          See the live page
        </Link>
        .
      </div>
      <section className="rounded-2xl border-2 border-brand bg-white p-6">
        <h1 className="text-xl font-bold text-brand">{briefTitle(d)}</h1>
        <p className="mt-1 text-xs text-muted">{briefSubtitle(d)}</p>
        <div className="mt-4 space-y-4 text-sm">
          {briefSections(d).map((sec) => (
            <div key={sec.title}>
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{sec.title}</h2>
              {sec.title.startsWith("Bring these sources") ? (
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {d.sources.map((x) => (
                    <li key={x.url}>
                      <a href={x.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {x.label} ↗
                      </a>
                    </li>
                  ))}
                </ol>
              ) : sec.items.length === 1 ? (
                <p className="mt-1">{sec.items[0]}</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {sec.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted">{BRIEF_FOOTER}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <a href={`/api/export/brief?share=${s.id}&format=pdf`} className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-brand">
            Download PDF
          </a>
          <a href={`/api/export/brief?share=${s.id}&format=docx`} className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-brand">
            Download Word
          </a>
        </div>
      </section>
    </article>
  );
}
