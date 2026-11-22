"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { KeyRound } from "lucide-react";
import { ApiError, authApi, isMissingEndpoint } from "@/lib/api";
import { Alert, PageLoader, Spinner, TextInput, useToast } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

/** Same floor as sign-up, so a reset can't quietly weaken an account. */
const MIN_LENGTH = 8;

/** A token that was already used, or is older than an hour, comes back as one of these. */
const isDeadToken = (e: unknown) => e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 410);

function ResetPasswordInner() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<Error | null>(null);

  const mismatch = confirm !== "" && confirm !== password;
  const tooShort = password !== "" && password.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setPending(true);
    setErr(null);
    try {
      await authApi.resetPassword(token, password);
      toast("Your password has been changed. Log in with it now.");
      router.replace("/login");
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };

  // A link that lost its token (copied by hand, cut by a mail client) can't be used
  if (!token) {
    return (
      <AuthShell title="This link is incomplete">
        <div className="reveal space-y-4">
          <Alert tone="warn">The reset link has no token in it. Links sometimes get cut when they are copied — open the one in the email directly.</Alert>
          <Link href="/forgot-password" className="btn-primary w-full py-3">Ask for a new link</Link>
        </div>
      </AuthShell>
    );
  }

  const dead = err !== null && !isMissingEndpoint(err) && isDeadToken(err);
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  return (
    <AuthShell title="Choose a new password" subtitle="The link you used works once. Pick something you don't use anywhere else.">
      <form className="space-y-4" onSubmit={submit} noValidate>
        {dead ? (
          <Alert tone="error">
            This link has expired or has already been used.{" "}
            <Link href="/forgot-password" className="font-bold underline">Ask for a new one</Link>.
          </Alert>
        ) : err && isMissingEndpoint(err) ? (
          <Alert tone="warn">Password reset isn&apos;t switched on yet. Ask an admin to reset it for you in the meantime.</Alert>
        ) : err && !Object.keys(fields).length ? (
          <Alert tone="error">{err.message}</Alert>
        ) : null}

        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : fields.password}
          hint={`At least ${MIN_LENGTH} characters.`}
          required
        />
        <TextInput
          label="Repeat the new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "The two passwords don't match." : undefined}
          required
        />
        <button className="btn-primary w-full py-3" disabled={pending || password === "" || confirm === "" || mismatch || tooShort}>
          {pending ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}Set new password
        </button>
        <p className="text-center text-sm text-ink-muted"><Link href="/login" className="link">Back to log in</Link></p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
