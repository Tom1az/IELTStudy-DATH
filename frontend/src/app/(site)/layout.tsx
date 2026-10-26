import { SiteHeader } from "@/components/layout/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
