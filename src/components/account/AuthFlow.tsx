"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Step = "sign-in" | "sign-up" | "verify" | "forgot" | "reset";

async function post(body: Record<string, string>): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? "Something went wrong.", code: j.code };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

const TITLE: Record<Step, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create your account",
  verify: "Check your email",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

/** Sign-up → email code → sign-in, and forgot → reset, in one place so the email carries through. */
export function AuthFlow({ initial = "sign-in", next = "/account" }: { initial?: Step; next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  const go = (s: Step, msg?: string) => {
    setStep(s);
    setError(undefined);
    setNotice(msg);
    setPassword("");
    setCode("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    let r;
    if (step === "sign-in") {
      r = await post({ action: "sign-in", email, password });
      if (r.ok) {
        router.push(safeNext);
        router.refresh();
        return;
      }
      if (r.code === "UserNotConfirmedException") {
        await post({ action: "resend", email });
        setBusy(false);
        return go("verify", "Your email is not confirmed yet. We sent a new code.");
      }
    } else if (step === "sign-up") {
      r = await post({ action: "sign-up", email, password, name });
      if (r.ok) {
        setBusy(false);
        return go("verify", `We sent a 6-digit code to ${email}.`);
      }
    } else if (step === "verify") {
      r = await post({ action: "confirm", email, code });
      if (r.ok) {
        setBusy(false);
        return go("sign-in", "Email confirmed. Sign in to continue.");
      }
    } else if (step === "forgot") {
      r = await post({ action: "forgot", email });
      if (r.ok) {
        setBusy(false);
        return go("reset", `If an account exists for ${email}, we sent it a code.`);
      }
    } else {
      r = await post({ action: "reset", email, code, password });
      if (r.ok) {
        setBusy(false);
        return go("sign-in", "Password changed. Sign in with your new password.");
      }
    }
    setBusy(false);
    setError(r?.error);
  }

  const field = "mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
  const label = "block text-sm font-semibold text-ink";
  const needsEmailInput = step !== "verify" && step !== "reset";

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-[0_20px_50px_-30px_rgba(40,36,110,.35)] sm:p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">{TITLE[step]}</h1>
      {step === "sign-up" && <p className="mt-1 text-sm text-muted">Free for patients and families. Your account keeps your watchlist on every device.</p>}
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-teal-wash px-3.5 py-2.5 text-sm text-supported">
          {notice}
        </p>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4">
        {step === "sign-up" && (
          <label className={label} htmlFor="auth-name">
            Your name <span className="font-normal text-muted">(optional)</span>
            <input id="auth-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </label>
        )}
        {needsEmailInput ? (
          <label className={label} htmlFor="auth-email">
            Email
            <input id="auth-email" className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
        ) : (
          <p className="text-sm text-muted">
            Email: <strong className="text-ink">{email}</strong>{" "}
            <button type="button" className="text-brand underline" onClick={() => go(step === "verify" ? "sign-up" : "forgot")}>
              Change
            </button>
          </p>
        )}
        {(step === "verify" || step === "reset") && (
          <label className={label} htmlFor="auth-code">
            6-digit code
            <input id="auth-code" className={`${field} tracking-[0.3em]`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required />
          </label>
        )}
        {(step === "sign-in" || step === "sign-up" || step === "reset") && (
          <label className={label} htmlFor="auth-password">
            {step === "reset" ? "New password" : "Password"}
            <input
              id="auth-password"
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={step === "sign-in" ? "current-password" : "new-password"}
              minLength={step === "sign-in" ? undefined : 12}
              required
            />
            {step !== "sign-in" && <span className="mt-1 block text-xs font-normal text-muted">At least 12 characters. A short sentence works well.</span>}
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-contradictory">
            {error}
          </p>
        )}
        <button className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60" disabled={busy}>
          {busy ? "Please wait…" : { "sign-in": "Sign in", "sign-up": "Create account", verify: "Confirm email", forgot: "Send reset code", reset: "Change password" }[step]}
        </button>
      </form>
      <div className="mt-5 space-y-2 text-sm text-muted">
        {step === "sign-in" && (
          <>
            <p>
              New here?{" "}
              <button className="font-semibold text-brand hover:underline" onClick={() => go("sign-up")}>
                Create an account
              </button>
            </p>
            <p>
              <button className="text-brand hover:underline" onClick={() => go("forgot")}>
                Forgot your password?
              </button>
            </p>
          </>
        )}
        {step === "sign-up" && (
          <p>
            Already have an account?{" "}
            <button className="font-semibold text-brand hover:underline" onClick={() => go("sign-in")}>
              Sign in
            </button>
          </p>
        )}
        {step === "verify" && (
          <p>
            No email?{" "}
            <button
              className="text-brand hover:underline"
              onClick={async () => {
                const r = await post({ action: "resend", email });
                setNotice(r.ok ? "We sent a new code." : undefined);
                setError(r.ok ? undefined : r.error);
              }}
            >
              Send a new code
            </button>{" "}
            (check spam too).
          </p>
        )}
        {(step === "forgot" || step === "reset") && (
          <p>
            <button className="text-brand hover:underline" onClick={() => go("sign-in")}>
              Back to sign in
            </button>
          </p>
        )}
        <p className="pt-2 text-xs">
          You never need an account to search. See how we handle data in the{" "}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={async () => {
        await post({ action: "sign-out" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="text-sm text-contradictory hover:underline" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  return (
    <form
      className="space-y-3 rounded-2xl border border-contradictory/40 bg-contradictory-bg p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post({ action: "delete-account", confirm });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push("/");
        router.refresh();
      }}
    >
      <p className="text-sm">
        This permanently deletes your sign-in, profile, memberships and usage history. Organisations where you are the only member are deleted too. Review decisions you made stay in the public audit
        record under your name, because other people rely on them.
      </p>
      <label className="block text-sm font-semibold" htmlFor="delete-confirm">
        Type DELETE to confirm
        <input id="delete-confirm" className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      {error && <p className="text-sm text-contradictory">{error}</p>}
      <div className="flex gap-3">
        <button className="rounded-xl bg-contradictory px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || confirm !== "DELETE"}>
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
        <button type="button" className="text-sm text-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
