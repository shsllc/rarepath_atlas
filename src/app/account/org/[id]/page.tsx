import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { accountsApi, ApiCallError } from "@/lib/auth/api";
import { InviteForm, MemberControls } from "@/components/account/OrgControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organisation", robots: { index: false } };

interface Org {
  id: string;
  name: string;
  plan: string;
  your_role: "owner" | "admin" | "reviewer" | "member";
  members: { sub: string; email: string; name: string; role: string; joined_at: string }[];
}

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  if (!accountsEnabled()) notFound();
  const user = await currentUser();
  const { id } = await params;
  if (!user) redirect(`/account/sign-in?next=/account/org/${id}`);
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  let org: Org;
  try {
    org = await accountsApi<Org>("GET", `/orgs/${id}`);
  } catch (e) {
    if (e instanceof ApiCallError && e.status === 404) notFound();
    throw e;
  }
  const canManage = org.your_role === "owner" || org.your_role === "admin";
  const order = { owner: 0, admin: 1, reviewer: 2, member: 3 } as Record<string, number>;
  return (
    <div className="space-y-6">
      <Link href="/account" className="text-sm text-brand hover:underline">
        ← Your account
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Organisation · {org.plan} plan</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{org.name}</h1>
        <p className="text-muted">
          You are {org.your_role === "admin" || org.your_role === "owner" ? "an" : "a"} {org.your_role}.
        </p>
      </header>

      {canManage && (
        <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
          <h2 className="font-display text-xl font-bold">Invite someone</h2>
          <p className="text-sm text-muted">Reviewers can check evidence for {org.name}; their decisions show your organisation&apos;s name. Members share watchlists and briefs.</p>
          <InviteForm org={org.id} canInviteAdmins={org.your_role === "owner"} />
        </section>
      )}

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-xl font-bold">Members ({org.members.length})</h2>
        <ul className="mt-3 divide-y divide-line">
          {[...org.members]
            .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name))
            .map((m) => (
              <li key={m.sub} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.name || m.email}
                    {m.sub === user.sub && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <MemberControls org={org.id} sub={m.sub} role={m.role} canManage={canManage} isOwner={org.your_role === "owner"} isSelf={m.sub === user.sub} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
