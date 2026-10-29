"use client";

import { useAuth } from "@/lib/auth-context";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LearnerShell } from "@/components/layout/LearnerShell";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Learners get the Figma sidebar layout; guests and staff keep the top header
  if (user?.role === "learner") return <LearnerShell>{children}</LearnerShell>;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Wait for the session check so a learner doesn't see the guest header flash first */}
      {!loading && <SiteHeader />}
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
