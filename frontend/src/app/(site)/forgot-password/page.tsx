"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { ApiError, authApi, isMissingEndpoint } from "@/lib/api";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

/**
 * Step one of the reset: ask for the link.
 *
 * The answer is the same whether or not the address has an account, so nobody can use
 * this form to find out who is registered. The backend is written the same way; this page
 * only has to avoid saying more than it does.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<Error | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      await authApi.requestPasswordReset(email);
      setSent(true);
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox">
        <div className="reveal flex flex-col items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-ink-muted">
            If <span className="font-semibold text-ink">{email}</span> has an account, a reset link is on its way. The link works once and expires after an hour.
          </p>
          <p className="text-sm text-ink-muted">
            Nothing arrived? Check the spam folder, or{" "}
            <button type="button" className="link" onClick={() => setSent(false)}>try another address</button>.
          </p>
          <Link href="/login" className="btn-outline mt-2 w-full">Back to log in</Link>
        </div>
      </AuthShell>
    );
  }

  const unavailable = err !== null && isMissingEndpoint(err);
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  return (
    <AuthShell title="Reset your password" subtitle={<>Remembered it? <Link href="/login" className="link">Log in instead</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {unavailable ? (
          <Alert tone="warn">Password reset isn&apos;t switched on yet. Ask an admin to reset it for you in the meantime.</Alert>
        ) : err && !Object.keys(fields).length ? (
          <Alert tone="error">{err.message}</Alert>
        ) : null}
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          hint="We send a link that lets you set a new password."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          required
        />
        <button className="btn-primary w-full py-3" disabled={pending || email.trim() === ""}>{pending && <Spinner className="h-4 w-4" />}Send reset link</button>
      </form>
    </AuthShell>
  );
}
