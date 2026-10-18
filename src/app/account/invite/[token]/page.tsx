import Link from "next/link";
import { notFound } from "next/navigation";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { accountsApi, ApiCallError } from "@/lib/auth/api";
import { AcceptInvite } from "@/components/account/OrgControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!accountsEnabled()) notFound();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) notFound();
  const user = await currentUser();
  const back = `/account/invite/${token}`;
  if (!user)
    return (
      <Card title="You have been invited">
        <p className="text-muted">Sign in, or create a free account with the email address the invitation was sent to.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/account/sign-in?next=${back}`} className="rounded-xl bg-brand px-4 py-2 font-semibold text-white">
            Sign in
          </Link>
          <Link href={`/account/sign-up?next=${back}`} className="rounded-xl border border-line px-4 py-2 font-semibold">
            Create an account
          </Link>
        </div>
      </Card>
    );
  let inv: { org_name: string; email: string; role: string };
  try {
    inv = await accountsApi("GET", `/invites/${token}`);
  } catch (e) {
    if (e instanceof ApiCallError && e.status === 404)
      return (
        <Card title="This invitation is no longer valid">
          <p className="text-muted">It may have expired or already been used. Ask the organisation for a new one.</p>
        </Card>
      );
    throw e;
  }
  return (
    <Card title={`Join ${inv.org_name}`}>
      <p className="text-muted">
        You are invited as a <strong className="text-ink">{inv.role}</strong>. The invitation is for {inv.email}
        {user.email.toLowerCase() !== inv.email ? `, but you are signed in as ${user.email}. Sign in with ${inv.email} to accept it.` : "."}
      </p>
      {user.email.toLowerCase() === inv.email && <AcceptInvite token={token} />}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-line bg-white p-8">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
