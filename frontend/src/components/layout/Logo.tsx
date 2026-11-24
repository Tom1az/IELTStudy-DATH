import Link from "next/link";
import { BRAND, cx } from "@/lib/format";

/** Brand mark: the IELTStudy book-and-cap logo (public/logo.png). On dark backgrounds
 *  (`light`) it sits on a white rounded chip so the navy strokes stay visible. */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center", light && "rounded-[10px] bg-white p-1", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset, no optimisation needed */}
      <img src="/logo.png" alt="" className="h-full w-full object-contain" />
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
