import Link from "next/link";
import { currentReviewer } from "@/lib/review/http";
import { listAudit } from "@/lib/review/queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review audit log · RarePath Atlas", robots: { index: false } };

export default async function AuditPage() {
  if (!(await currentReviewer()))
    return (
      <p className="rounded-xl border border-line bg-white p-6">
        <Link href="/review" className="text-brand underline">
          Sign in as a reviewer
        </Link>{" "}
        to see the audit log.
      </p>
    );
  const events = await listAudit(300);
  return (
    <div className="space-y-4">
      <Link href="/review" className="text-sm text-brand hover:underline">
        ← Queue
      </Link>
      <h1 className="text-xl font-bold">Audit log</h1>
      <p className="text-sm text-muted">Append-only. Every proposal, decision and withdrawal, newest first.</p>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
        {events.map((e) => (
          <li key={e.id} className="p-3">
            <span className="font-mono text-xs text-muted">{e.at.slice(0, 19).replace("T", " ")}</span> <strong>{e.actor.name}</strong> {e.action}{" "}
            <Link href={`/review/${e.item_id}`} className="text-brand hover:underline">
              {e.summary}
            </Link>
            {e.note && <span className="block text-xs text-muted">Note: {e.note}</span>}
          </li>
        ))}
        {events.length === 0 && <li className="p-6 text-muted">No events yet.</li>}
      </ul>
    </div>
  );
}
