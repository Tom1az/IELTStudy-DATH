"use client";

import Link from "next/link";
import { useState } from "react";
import { authApi, ApiError, USING_MOCK } from "@/lib/api";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ demoResetLink?: string } | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      setSent(await authApi.forgotPassword(email));
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you signed up with and we'll send you a link to choose a new password.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">If an account exists for <strong>{email}</strong>, a reset link is on its way. The link expires in 30 minutes.</Alert>
          {USING_MOCK && sent.demoResetLink && (
            <Alert tone="info">Demo mode: emails aren&apos;t sent. <Link href={sent.demoResetLink} className="link">Open the reset link</Link></Alert>
          )}
          <Link href="/login" className="btn-outline w-full">Back to log in</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          {err && !Object.keys(fields).length && <Alert tone="error">{err.message}</Alert>}
          <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} />
          <button className="btn-primary w-full py-3" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Send reset link</button>
          <p className="text-center text-sm"><Link href="/login" className="link">Back to log in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
