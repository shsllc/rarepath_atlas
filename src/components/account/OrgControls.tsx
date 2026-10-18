"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function act(body: Record<string, string>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? "Request failed." };
  } catch {
    return { ok: false, error: "Network error. Nothing was changed." };
  }
}

const field = "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand";
const btn = "rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60";

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await act({ action: "create-org", name });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push(`/account/org/${r.id}`);
      }}
    >
      <label className="grow text-sm font-semibold" htmlFor="org-name">
        New organisation
        <input id="org-name" className={`${field} mt-1 block w-full`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CDKL5 Family Alliance" maxLength={80} required />
      </label>
      <button className={btn} disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      {error && <p className="basis-full text-sm text-contradictory">{error}</p>}
    </form>
  );
}

export function InviteForm({ org, canInviteAdmins }: { org: string; canInviteAdmins: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setLink(undefined);
          const r = await act({ action: "invite", org, email, role });
          if (!r.ok) return setError(r.error);
          setLink(`${window.location.origin}/account/invite/${r.token}`);
          setCopied(false);
          setEmail("");
        }}
      >
        <label className="grow text-sm font-semibold" htmlFor="invite-email">
          Email
          <input id="invite-email" type="email" className={`${field} mt-1 block w-full`} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="text-sm font-semibold" htmlFor="invite-role">
          Role
          <select id="invite-role" className={`${field} mt-1 block`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="reviewer">Reviewer</option>
            {canInviteAdmins && <option value="admin">Admin</option>}
          </select>
        </label>
        <button className={btn}>Create invite</button>
      </form>
      {error && <p className="text-sm text-contradictory">{error}</p>}
      {link && (
        <div className="rounded-xl bg-teal-wash p-3 text-sm">
          <p className="font-semibold text-supported">Invite created. Send this link to them; it works once, for that email, for 14 days.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link} className={`${field} w-full font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
            <button
              className="rounded-xl border border-line bg-white px-3 text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemberControls({ org, sub, role, canManage, isOwner, isSelf }: { org: string; sub: string; role: string; canManage: boolean; isOwner: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const roles = isOwner ? ["owner", "admin", "reviewer", "member"] : ["reviewer", "member"];
  const editable = canManage && (isOwner || (role !== "owner" && role !== "admin"));
  return (
    <span className="flex flex-wrap items-center gap-2">
      {editable ? (
        <select
          aria-label="Role"
          className={field}
          value={role}
          onChange={async (e) => {
            const r = await act({ action: "set-role", org, sub, role: e.target.value });
            if (!r.ok) setError(r.error);
            router.refresh();
          }}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      ) : (
        <span className="rounded-full bg-brand-wash px-2.5 py-0.5 text-xs font-semibold capitalize text-brand">{role}</span>
      )}
      {(editable || isSelf) &&
        (confirming ? (
          <>
            <button
              className="text-sm font-semibold text-contradictory"
              onClick={async () => {
                const r = await act({ action: "remove", org, sub });
                setConfirming(false);
                if (!r.ok) return setError(r.error);
                if (isSelf) router.push("/account");
                router.refresh();
              }}
            >
              {isSelf ? "Yes, leave" : "Yes, remove"}
            </button>
            <button className="text-sm text-muted" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="text-sm text-muted hover:text-contradictory" onClick={() => setConfirming(true)}>
            {isSelf ? "Leave" : "Remove"}
          </button>
        ))}
      {error && <span className="basis-full text-xs text-contradictory">{error}</span>}
    </span>
  );
}

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <button
        className={btn}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await act({ action: "accept", token });
          setBusy(false);
          if (!r.ok) return setError(r.error);
          router.push(`/account/org/${r.org_id}`);
          router.refresh();
        }}
      >
        {busy ? "Joining…" : "Accept invitation"}
      </button>
      {error && <p className="text-sm text-contradictory">{error}</p>}
    </div>
  );
}
