import { Construction } from "lucide-react";
import { PageHeader } from "@/components/ui";

/**
 * Placeholder for a page whose feature the backend doesn't have yet. The pages stay so
 * the routes and navigation are ready (see docs/plans/phase-4-frontend.md).
 */
export function NotAvailable({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="card flex gap-4 p-6">
        <Construction className="h-6 w-6 shrink-0 text-brand" aria-hidden />
        <div className="text-sm text-ink-muted">
          <p className="font-semibold text-ink">This feature is not available yet.</p>
          {children && <p className="mt-1">{children}</p>}
        </div>
      </div>
    </div>
  );
}
