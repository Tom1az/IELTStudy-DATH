import { db } from "../prisma/db.ts";
import type { CourseStatus } from "./courses.ts";
import type { UserRole } from "../utils/public-user.ts";

const orm = db.orm.public;

// The contract's `AdminStats` shape (GET /admin/stats)
export type AdminStats = {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  courses: {
    total: number;
    byStatus: Record<CourseStatus, number>;
  };
  enrollments: number;
  attempts: {
    completed: number;
    completedLast7Days: number;
  };
  activeLearnersLast7Days: number;
};

// Platform usage numbers for the admin panel. Every number is counted by Postgres
// (`groupBy` / `aggregate`), so no table is loaded into memory.
export const getUsageStats = async (): Promise<AdminStats> => {
  // "Last 7 days" is a rolling window: the 168 hours before this request
  const since = Temporal.Now.instant().subtract({ hours: 168 });

  const [userGroups, courseGroups, enrollments, completed, completedLast7Days, recentLearners] =
    await Promise.all([
      // One row per (role, isActive) pair that exists, with how many users have it
      orm.Users.groupBy("role", "isActive").aggregate((agg) => ({ count: agg.count() })),
      // One row per course status that exists
      orm.Courses.groupBy("status").aggregate((agg) => ({ count: agg.count() })),
      orm.Enrollments.aggregate((agg) => ({ count: agg.count() })),
      // Open attempts (completedAt is null) are not counted
      orm.QuizAttempts.where((a) => a.completedAt.isNotNull()).aggregate((agg) => ({
        count: agg.count(),
      })),
      orm.QuizAttempts.where((a) => a.completedAt.gte(since)).aggregate((agg) => ({
        count: agg.count(),
      })),
      // One row per learner who completed an attempt in the window, so a learner with
      // several attempts is counted once
      orm.QuizAttempts.where((a) => a.completedAt.gte(since))
        .groupBy("userId")
        .aggregate((agg) => ({ count: agg.count() })),
    ]);

  // Groups with no rows don't come back from the database, so every count starts at 0
  const byRole: Record<UserRole, number> = { learner: 0, instructor: 0, admin: 0 };
  let active = 0;
  let inactive = 0;
  for (const group of userGroups) {
    byRole[group.role] += group.count;
    if (group.isActive) {
      active += group.count;
    } else {
      inactive += group.count;
    }
  }

  const byStatus: Record<CourseStatus, number> = {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
  };
  let totalCourses = 0;
  for (const group of courseGroups) {
    byStatus[group.status] += group.count;
    totalCourses += group.count;
  }

  return {
    users: { total: active + inactive, active, inactive, byRole },
    courses: { total: totalCourses, byStatus },
    enrollments: enrollments.count,
    attempts: {
      completed: completed.count,
      completedLast7Days: completedLast7Days.count,
    },
    activeLearnersLast7Days: recentLearners.length,
  };
};
