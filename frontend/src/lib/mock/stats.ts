import type { SkillCategory } from "@/lib/types";

/*
 * MOCK DATA for the completion and learning figures (backlog #9). `GET /admin/stats` does not
 * return these yet. When the backend adds them, replace this constant with the response fields.
 */
export interface CourseCompletion {
  courseId: string;
  title: string;
  enrolled: number;
  completed: number;
}

export interface StatsExtras {
  completion: { courses: CourseCompletion[] };
  learning: {
    /** Average quiz score across submitted attempts, 0–100. */
    averageScorePct: number;
    /** Average mastery per skill category, 0–1. */
    masteryBySkill: Record<SkillCategory, number>;
  };
}

export const MOCK_STATS_EXTRAS: StatsExtras = {
  completion: {
    courses: [
      { courseId: "1", title: "Level 1 · Foundations", enrolled: 42, completed: 19 },
      { courseId: "2", title: "Level 2 · Intermediate", enrolled: 27, completed: 8 },
      { courseId: "3", title: "Level 3 · Advanced", enrolled: 11, completed: 2 },
    ],
  },
  learning: {
    averageScorePct: 64,
    masteryBySkill: { listening: 0.58, reading: 0.66, writing: 0.52, speaking: 0.49 },
  },
};
