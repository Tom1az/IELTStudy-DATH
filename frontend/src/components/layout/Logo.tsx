import Link from "next/link";
import { BookOpen } from "lucide-react";
import { BRAND, cx } from "@/lib/format";

/** Figma brand mark: a blue rounded square with an open book. */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", light ? "bg-white text-brand" : "bg-brand text-white", className)} aria-hidden>
      <BookOpen className="h-5 w-5" strokeWidth={2} />
    </span>
  );
}

export function Logo({ light, href = "/" }: { light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cx("flex items-center gap-2.5 text-[22px] font-extrabold tracking-tight", light ? "text-white" : "text-ink")} aria-label={`${BRAND.name} home`}>
      <LogoMark light={light} />
      {BRAND.name}
    </Link>
  );
}
