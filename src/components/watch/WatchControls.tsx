"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WatchCategory, WatchDiff } from "@/lib/watch";

const LABEL: Record<WatchCategory, string> = {
  reviewed: "Reviewed relationships",
  papers: "Papers",
  preprints: "Preprints (not peer reviewed)",
  studies: "Clinical studies",
  grants: "NIH-funded projects",
};

async function call(body: Record<string, string>): Promise<{ ok: boolean; error?: string; diff?: WatchDiff }> {
  try {
    const res = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? `Request failed (${res.status}).` };
  } catch {
    return { ok: false, error: "Network error. Nothing was changed." };
  }
}

export function WatchButton({ query, watched: initial }: { query: string; watched: boolean }) {
  const [watched, setWatched] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        disabled={busy}
        aria-pressed={watched}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const r = await call({ action: watched ? "remove" : "add", query });
          setBusy(false);
          if (r.ok) setWatched(!watched);
          else setError(r.error);
        }}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${watched ? "border border-supported bg-teal-wash text-supported" : "border border-brand bg-white text-brand hover:bg-brand-wash"}`}
      >
        {busy ? "…" : watched ? "✓ Watching" : "☆ Watch for new research"}
      </button>
      {watched && (
        <a href="/watch" className="text-xs text-brand hover:underline">
          Your watchlist →
        </a>
      )}
      {error && <span className="text-xs text-contradictory">{error}</span>}
    </span>
  );
}

export function WatchRow({ query, label, lastSeen }: { query: string; label: string; lastSeen: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; diff?: WatchDiff; error?: string }>({});
  const d = state.diff;
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <a href={`/results?q=${encodeURIComponent(query)}`} className="font-semibold hover:text-brand hover:underline">
            {label}
          </a>
          <p className="text-xs text-muted">Last marked as seen {lastSeen.slice(0, 10)}</p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={state.busy}
            onClick={async () => {
              setState({ busy: true });
              const r = await call({ action: "check", query });
              setState(r.ok ? { diff: r.diff } : { error: r.error });
            }}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {state.busy ? "Checking…" : "What's new?"}
          </button>
          <button
            onClick={async () => {
              const r = await call({ action: "remove", query });
              if (r.ok) router.refresh();
              else setState({ error: r.error });
            }}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
          >
            Remove
          </button>
        </div>
      </div>
      {state.error && <p className="mt-2 text-sm text-contradictory">{state.error}</p>}
      {d && (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-3 text-sm">
          {d.total_new === 0 ? (
            <p className="text-muted">Nothing new since you last looked.</p>
          ) : (
            <>
              {(Object.keys(d.new_items) as WatchCategory[])
                .filter((c) => d.new_items[c].length > 0)
                .map((c) => (
                  <div key={c} className="mb-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      {LABEL[c]} · {d.new_items[c].length} new{c === "reviewed" ? "" : " · machine-assembled"}
                    </h3>
                    <ul className="mt-1 space-y-1">
                      {d.new_items[c].slice(0, 15).map((x) => (
                        <li key={x.key}>
                          {x.url ? (
                            <a href={x.url} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">
                              {x.label} ↗
                            </a>
                          ) : (
                            x.label
                          )}
                          {x.detail && <span className="block text-[11px] text-muted">{x.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              <button
                onClick={async () => {
                  const r = await call({ action: "seen", query });
                  if (r.ok) {
                    setState({});
                    router.refresh();
                  } else setState({ diff: d, error: r.error });
                }}
                className="rounded-lg border border-supported bg-white px-3 py-1.5 text-sm font-semibold text-supported"
              >
                Mark all as seen
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ForgetButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm("Delete this browser's watchlist and its feed? This cannot be undone.")) return;
        await call({ action: "forget" });
        router.refresh();
      }}
      className="text-sm text-contradictory hover:underline"
    >
      Delete this watchlist
    </button>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex gap-2">
      <input readOnly value={value} className="w-full rounded-lg border border-line bg-white px-3 py-1.5 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
        }}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
