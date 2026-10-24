import Link from "next/link";
import { BRAND, cx } from "@/lib/format";

export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 22 20" className={cx("h-5 w-[22px]", className)} aria-hidden>
      <rect x="0" y="10" width="6" height="10" fill="#C3410D" />
      <rect x="8" y="5" width="6" height="15" fill={light ? "#7FB8B5" : "#0E5C5C"} />
      <rect x="16" y="0" width="6" height="20" fill={light ? "#FFFFFF" : "#1B2A41"} />
    </svg>
  );
}

export function Logo({ light, href = "/" }: { light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cx("flex items-center gap-2.5 font-serif text-[22px] font-bold tracking-tight", light ? "text-white" : "text-navy")} aria-label={`${BRAND.name} home`}>
      <LogoMark light={light} />
      {BRAND.name}
    </Link>
  );
}
