import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/account/AuthFlow";
import { accountsEnabled, currentUser } from "@/lib/auth/session";
import { AccountsUnavailable } from "@/components/account/AccountsUnavailable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailable />;
  if (await currentUser()) redirect("/account");
  return (
    <div className="py-6">
      <AuthFlow initial="sign-up" next={next} />
    </div>
  );
}
