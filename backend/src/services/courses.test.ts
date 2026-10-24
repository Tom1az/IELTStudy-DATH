import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../prisma/db.ts";
import { createTestCourse, createTestUser, resetDb } from "../test/db.ts";
import { changeCourseStatus } from "./courses.ts";
import type { CourseRow, CourseStatus } from "./courses.ts";

beforeEach(async () => {
  await resetDb();
});

// Moves a pending course to `status` and reports the outcome: the new status, or "409"
const tryReview = async (course: CourseRow, status: CourseStatus, reviewerId: number) => {
  try {
    await changeCourseStatus(
      course,
      ["pending_review"],
      {
        status,
        reviewFeedback: status === "rejected" ? "Needs work" : null,
        reviewedById: reviewerId,
        reviewedAt: Temporal.Now.instant(),
      },
      "Only courses pending review can be reviewed",
    );
    return status;
  } catch (err) {
    if ((err as { status?: number }).status === 409) return "409";
    throw err;
  }
};

// The route test in routes/courses.test.ts races two HTTP requests, which rarely overlap
// closely enough to hit the gap between reading and writing the row. Calling the service
// directly, several times, makes the two status changes really run at the same moment.
describe("changeCourseStatus", () => {
  it("lets exactly one of two simultaneous status changes win", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });

    for (let round = 0; round < 10; round++) {
      const course = await createTestCourse({
        instructorId: instructor.userId,
        status: "pending_review",
      });

      // Both calls start from the same loaded row, as two requests would
      const outcomes = await Promise.all([
        tryReview(course, "approved", admin.userId),
        tryReview(course, "rejected", admin.userId),
      ]);

      const winners = outcomes.filter((outcome) => outcome !== "409");
      expect(winners).toHaveLength(1);
      const row = await db.orm.public.Courses.first({ courseId: course.courseId });
      expect(row!.status).toBe(winners[0]);
    }
  });
});
