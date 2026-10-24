import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="container grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_420px] lg:items-start">
      <div className="mx-auto w-full max-w-[460px] lg:mx-0 lg:max-w-none">
        <div className="rounded-2xl border border-line bg-white p-6 md:p-9">
          <h1 className="font-serif text-[30px] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
      <aside className="hidden rounded-2xl bg-navy p-8 text-white lg:block">
        {aside ?? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft">Adaptive IELTS learning</p>
            <p className="mt-3 font-serif text-[28px] font-bold leading-tight">Climb from Band 4 to Band 7, one skill at a time.</p>
            <ul className="mt-6 space-y-3 text-sm text-white/85">
              <li>• A 15-minute placement quiz sets your starting level.</li>
              <li>• Every lesson ends with an IELTS-style practice set.</li>
              <li>• Your skill map updates after every answer and picks what to review next.</li>
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
