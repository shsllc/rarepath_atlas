"use client";

import { useState } from "react";

const btn = "rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:border-brand";

/** Brief downloads (when there is a brief), a frozen share link, and citation exports. */
export function ExportBar({ query, hasBrief }: { query: string; hasBrief: boolean }) {
  const q = encodeURIComponent(query);
  const [share, setShare] = useState<{ busy?: boolean; url?: string; error?: string; copied?: boolean }>({});
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasBrief && (
        <>
          <a className={btn} href={`/api/export/brief?q=${q}&format=pdf`}>
            Brief · PDF
          </a>
          <a className={btn} href={`/api/export/brief?q=${q}&format=docx`}>
            Brief · Word
          </a>
          <button
            className={btn}
            disabled={share.busy}
            onClick={async () => {
              setShare({ busy: true });
              try {
                const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) return setShare({ error: j.error ?? "Could not create a link." });
                const copied = await navigator.clipboard.writeText(j.url).then(
                  () => true,
                  () => false,
                );
                setShare({ url: j.url, copied });
              } catch {
                setShare({ error: "Network error." });
              }
            }}
          >
            {share.busy ? "Creating link…" : "Share brief"}
          </button>
        </>
      )}
      <span className="text-xs text-muted">Cite sources:</span>
      <a className={btn} href={`/api/export/citations?q=${q}&format=bibtex`}>
        BibTeX
      </a>
      <a className={btn} href={`/api/export/citations?q=${q}&format=ris`}>
        RIS
      </a>
      {share.url && (
        <span className="basis-full text-xs">
          {share.copied ? "Link copied: " : "Share link: "}
          <a href={share.url} className="break-all font-mono text-brand underline">
            {share.url}
          </a>{" "}
          <span className="text-muted">(a frozen copy of today&apos;s brief)</span>
        </span>
      )}
      {share.error && <span className="basis-full text-xs text-contradictory">{share.error}</span>}
    </div>
  );
}
