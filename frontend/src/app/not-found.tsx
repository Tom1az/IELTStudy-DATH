import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="eyebrow mt-6">404</p>
      <h1 className="font-serif text-4xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="text-ink-muted">The link may be broken or the page may have moved.</p>
      <Link href="/" className="btn-primary mt-2">Back to home</Link>
    </main>
  );
}
