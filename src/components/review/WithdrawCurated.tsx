"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function WithdrawCurated({ edgeId }: { edgeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  if (!open)
    return (
      <button className="text-xs text-muted hover:text-contradictory" onClick={() => setOpen(true)}>
        Withdraw
      </button>
    );
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/review/withdraw-curated", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ edge_id: edgeId, note }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setError(j.error ?? "Could not withdraw.");
        router.refresh();
      }}
    >
      <input
        aria-label="Reason for withdrawing"
        className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-xs"
        placeholder="Why is this claim wrong or misleading?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        minLength={5}
      />
      <button className="rounded-lg border border-contradictory px-2 py-1 text-xs font-semibold text-contradictory">Withdraw</button>
      <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className="basis-full text-xs text-contradictory">{error}</span>}
    </form>
  );
}
