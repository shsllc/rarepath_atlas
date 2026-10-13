"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; id?: string; created?: boolean }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? `Request failed (${res.status}).` };
  } catch {
    return { ok: false, error: "Network error. Nothing was changed." };
  }
}

const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
const field = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export function LoginForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post("/api/review/login", { id, key });
        setBusy(false);
        if (r.ok) router.refresh();
        else setError(r.error);
      }}
    >
      <label className="block text-sm font-semibold">
        Reviewer id
        <input className={field} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required />
      </label>
      <label className="block text-sm font-semibold">
        Access key
        <input className={field} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p role="alert" className="text-sm text-contradictory">{error}</p>}
      <button className={`${btn} bg-brand text-white`} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className={`${btn} border border-line bg-white`}
      onClick={async () => {
        await post("/api/review/logout", {});
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function ProposeButton({ query, linkKey }: { query: string; linkKey: string }) {
  const [state, setState] = useState<{ busy?: boolean; id?: string; created?: boolean; error?: string }>({});
  if (state.id)
    return (
      <a href={`/review/${state.id}`} className="whitespace-nowrap text-xs font-semibold text-supported hover:underline">
        {state.created ? "✓ Sent to review" : "Already in queue"} →
      </a>
    );
  return (
    <span className="whitespace-nowrap">
      <button
        className="rounded border border-brand px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand-wash disabled:opacity-50"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          const r = await post("/api/review/propose", { query, link_key: linkKey });
          setState(r.ok ? { id: r.id, created: r.created } : { error: r.error });
        }}
      >
        {state.busy ? "Sending…" : "Send to review"}
      </button>
      {state.error && <span className="ml-2 text-xs text-contradictory">{state.error}</span>}
    </span>
  );
}

const OUTCOMES = [
  { v: "supports", label: "Supports: the source states this relationship" },
  { v: "qualifies", label: "Qualifies: true only with the limits noted" },
  { v: "contradicts", label: "Contradicts: the source argues against it" },
  { v: "rejected", label: "Reject: not supported by the source / not useful" },
] as const;

export function DecisionForm({ id }: { id: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["v"]>("supports");
  const [confidence, setConfidence] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const rejecting = outcome === "rejected";
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post("/api/review/decide", { id, outcome, confidence: rejecting ? undefined : confidence, note, source_checked: checked });
        setBusy(false);
        if (r.ok) router.refresh();
        else setError(r.error);
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Outcome</legend>
        {OUTCOMES.map((o) => (
          <label key={o.v} className="mt-1 flex items-start gap-2 text-sm">
            <input type="radio" name="outcome" checked={outcome === o.v} onChange={() => setOutcome(o.v)} className="mt-1" />
            {o.label}
          </label>
        ))}
      </fieldset>
      {!rejecting && (
        <label className="block text-sm font-semibold">
          Confidence in the source
          <select className={field} value={confidence} onChange={(e) => setConfidence(e.target.value)} required>
            <option value="">Choose…</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
        </label>
      )}
      <label className="block text-sm font-semibold">
        Reviewer note {outcome === "supports" ? "(optional)" : "(required)"}
        <textarea className={field} rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What the source actually says, and any limits." />
      </label>
      {!rejecting && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />I opened the source record(s) and confirmed what they state.
        </label>
      )}
      {error && <p role="alert" className="text-sm text-contradictory">{error}</p>}
      <button className={`${btn} ${rejecting ? "bg-contradictory" : "bg-supported"} text-white`} disabled={busy}>
        {busy ? "Saving…" : rejecting ? "Reject" : "Accept into reviewed graph"}
      </button>
    </form>
  );
}

export function RevokeForm({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm("Withdraw this edge from the reviewed graph? The decision stays in the audit history.")) return;
        const r = await post("/api/review/revoke", { id, note });
        if (r.ok) router.refresh();
        else setError(r.error);
      }}
    >
      <label className="block text-sm font-semibold">
        Reason for withdrawing (required)
        <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} required />
      </label>
      {error && <p role="alert" className="text-sm text-contradictory">{error}</p>}
      <button className={`${btn} border border-contradictory bg-white text-contradictory`}>Withdraw</button>
    </form>
  );
}
