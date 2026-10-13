import Link from "next/link";
import { reviewEnabled } from "@/lib/review/auth";
import { currentReviewer } from "@/lib/review/http";
import { listItems, type ReviewStatus } from "@/lib/review/queue";
import { LoginForm, LogoutButton } from "@/components/review/ReviewActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review queue · RarePath Atlas", robots: { index: false } };

const TABS: ReviewStatus[] = ["pending", "accepted", "rejected", "revoked"];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!reviewEnabled())
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-xl font-bold">Review queue</h1>
        <p className="mt-2 text-muted">Reviewer sign-in is not configured on this deployment, so RarePath is read-only here.</p>
      </div>
    );
  const reviewer = await currentReviewer();
  if (!reviewer)
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-xl font-bold">Reviewer sign-in</h1>
        <p className="mb-4 mt-2 text-sm text-muted">Reviewers check machine-assembled relationships against their sources before anything enters the reviewed graph.</p>
        <LoginForm />
      </div>
    );
  const sp = await searchParams;
  const status = TABS.includes(sp.status as ReviewStatus) ? (sp.status as ReviewStatus) : "pending";
  const items = await listItems(status);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Review queue</h1>
          <p className="text-sm text-muted">Signed in as {reviewer.name}. Send relationships here from any search&apos;s discovery preview.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/review/audit" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold">
            Audit log
          </Link>
          <LogoutButton />
        </div>
      </div>
      <nav className="flex gap-2 text-sm" aria-label="Status">
        {TABS.map((t) => (
          <Link key={t} href={`/review?status=${t}`} aria-current={t === status ? "page" : undefined} className={`rounded-full px-3 py-1 font-semibold capitalize ${t === status ? "bg-ink text-white" : "border border-line bg-white"}`}>
            {t}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dotted border-line bg-white p-6 text-muted">Nothing {status}.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {items.map((i) => (
            <li key={i.id} className="p-4">
              <Link href={`/review/${i.id}`} className="font-medium hover:text-brand hover:underline">
                {i.link.statement}
              </Link>
              <p className="mt-1 text-xs text-muted">
                {i.disease.label} · {i.link.provenance.map((p) => p.provider).join(", ")} · proposed by {i.proposed_by.name} {i.created_at.slice(0, 10)}
                {i.decision && ` · ${i.decision.outcome} by ${i.decision.by_name}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
