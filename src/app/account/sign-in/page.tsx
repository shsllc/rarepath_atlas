import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/account/AuthFlow";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { AccountsUnavailable } from "@/components/account/AccountsUnavailable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailable />;
  if (await currentUser()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/account");
  return (
    <div className="py-6">
      <AuthFlow initial="sign-in" next={next} />
    </div>
  );
}
