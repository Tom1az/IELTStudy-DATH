import type { CourseStatus } from "@/lib/types";
import { StatusPill } from "@/components/ui";

const MAP: Record<CourseStatus, { label: string; tone: "green" | "amber" | "red" | "gray" | "violet" }> = {
  published: { label: "Published", tone: "green" },
  pending: { label: "In review", tone: "amber" },
  draft: { label: "Draft", tone: "gray" },
  hidden: { label: "Hidden", tone: "violet" },
  rejected: { label: "Changes requested", tone: "red" },
};

export function CourseStatusPill({ status }: { status: CourseStatus }) {
  return <StatusPill tone={MAP[status].tone}>{MAP[status].label}</StatusPill>;
}
