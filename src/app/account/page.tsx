import Link from "next/link";
import { redirect } from "next/navigation";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { getMe } from "@/lib/auth/api";
import { DeleteAccount, SignOutButton } from "@/components/account/AuthFlow";
import { CreateOrgForm } from "@/components/account/OrgControls";
import { AccountsUnavailable } from "@/components/account/AccountsUnavailable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account", robots: { index: false } };

const ROLE_HELP: Record<string, string> = {
  owner: "Manages the organisation, its members and admins",
  admin: "Invites members and reviewers",
  reviewer: "Reviews evidence for the organisation",
  member: "Shares the organisation's watchlists and briefs",
};

export default async function AccountPage() {
  if (!accountsEnabled()) return <AccountsUnavailable />;
  const user = await currentUser();
  if (!user) redirect("/account/sign-in?next=/account");
  const me = await getMe();
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your account</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{user.name}</h1>
          <p className="text-muted">{user.email}</p>
        </div>
        <SignOutButton className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-brand" />
      </header>

      {!me && <p className="rounded-2xl border border-dashed border-unknown bg-unknown-bg p-4 text-sm">Your profile could not be loaded right now. Searching and watchlists still work.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Plan</h2>
          <p className="mt-2 font-display text-2xl font-bold capitalize">{me?.plan ?? "Free"}</p>
          <p className="mt-1 text-sm text-muted">Everything RarePath shows today is free.</p>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Today</h2>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{me?.usage_today.discovery_search ?? 0}</p>
          <p className="mt-1 text-sm text-muted">live discovery searches. Counted to plan fair limits; nothing is limited yet.</p>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Watchlist</h2>
          <p className="mt-2 text-sm">Your watchlist follows this account on every device.</p>
          <Link href="/watch" className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
            Open watchlist →
          </Link>
        </section>
      </div>

      <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Organisations</h2>
          <p className="text-sm text-muted">Patient groups, labs and teams. Owners invite members and reviewers; reviewers check evidence on the organisation&apos;s behalf.</p>
        </div>
        {me && me.orgs.length > 0 ? (
          <ul className="divide-y divide-line">
            {me.orgs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/account/org/${o.id}`} className="font-semibold hover:text-brand hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-xs text-muted">{ROLE_HELP[o.role]}</p>
                </div>
                <span className="rounded-full bg-brand-wash px-2.5 py-0.5 text-xs font-semibold capitalize text-brand">{o.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You are not in an organisation yet. Create one, or ask an owner to invite you.</p>
        )}
        {!user.emailVerified ? <p className="text-sm text-muted">Confirm your email to create an organisation.</p> : <CreateOrgForm />}
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Your data</h2>
        <p className="text-sm text-muted">
          We store your email, name, organisation memberships and daily usage counts (kept 40 days). See the{" "}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>
          .
        </p>
        <DeleteAccount />
      </section>

      {(me?.curator || me?.orgs.some((o) => o.role !== "member")) && (
        <section className="rounded-2xl border border-brand/30 bg-brand-wash p-5">
          <h2 className="font-display text-xl font-bold">Review queue</h2>
          <p className="text-sm text-muted">{me?.curator ? "You are a platform curator." : "You can review evidence for your organisation."}</p>
          <Link href="/review" className="mt-2 inline-block font-semibold text-brand hover:underline">
            Open the review queue →
          </Link>
        </section>
      )}
    </div>
  );
}
