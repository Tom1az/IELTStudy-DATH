import { BookOpen, Headphones, Mic, PencilLine } from "lucide-react";
import type { SkillCategory } from "@/lib/types";
import { SKILL_META, cx } from "@/lib/format";

const ICONS = { listening: Headphones, reading: BookOpen, writing: PencilLine, speaking: Mic };

export function SkillIcon({ skill, className }: { skill: SkillCategory; className?: string }) {
  const I = ICONS[skill];
  return <I className={cx("h-4 w-4", className)} aria-hidden strokeWidth={1.8} />;
}

/** Rounded tinted tile with the skill icon (Figma "Four skills" cards and syllabus headers). */
export function SkillTile({ skill, size = 40 }: { skill: SkillCategory; size?: number }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-lg", SKILL_META[skill].tint, SKILL_META[skill].text)} style={{ width: size, height: size }}>
      <SkillIcon skill={skill} className="h-[18px] w-[18px]" />
    </span>
  );
}
