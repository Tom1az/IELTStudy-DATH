import { describe, expect, it } from "vitest";
import type { BackendCourse, BackendLesson, BackendSkill } from "./backend-types";
import { buildSyllabus, lessonCategory, toCourse, toEnrollment, toSkillCategories } from "./mappers";

const skills: BackendSkill[] = [
  { skillId: 1, skillCode: "L_FORM", name: "Forms", category: "listening", description: null },
  { skillId: 2, skillCode: "R_TFNG", name: "TFNG", category: "reading", description: null },
  { skillId: 3, skillCode: "W_TENSES", name: "Tenses", category: "writing", description: null },
];
const categories = toSkillCategories(skills);

function lesson(lessonId: number, kind: "core" | "remedial", tags: [number, number][], status?: "in_progress" | "completed"): BackendLesson {
  return {
    lessonId,
    courseId: 1,
    title: `Lesson ${lessonId}`,
    kind,
    orderIndex: lessonId,
    skills: tags.map(([skillId, weight]) => ({ skillId, skillCode: "", name: "", weight })),
    progress: status ? { lessonId, status, startedAt: "", completedAt: null } : null,
  };
}

describe("lessonCategory", () => {
  it("uses the category of the heaviest skill tag", () => {
    expect(lessonCategory(lesson(1, "core", [[1, 0.3], [2, 0.7]]), categories)).toBe("reading");
    expect(lessonCategory(lesson(2, "core", [[3, 1]]), categories)).toBe("writing");
  });
});

describe("buildSyllabus", () => {
  it("groups core lessons into skill sections in Listening → Reading → Writing → Speaking order", () => {
    const lessons = [lesson(1, "core", [[3, 1]]), lesson(2, "core", [[1, 1]]), lesson(3, "core", [[3, 1]]), lesson(4, "remedial", [[1, 1]])];
    const sections = buildSyllabus(lessons, categories);
    expect(sections.map((s) => s.skill)).toEqual(["listening", "writing"]);
    // Remedial lessons are left out; order restarts at 1 in each section
    expect(sections[0].entries.map((e) => [e.lesson.lessonId, e.order])).toEqual([[2, 1]]);
    expect(sections[1].entries.map((e) => [e.lesson.lessonId, e.order])).toEqual([[1, 1], [3, 2]]);
  });
});

describe("toEnrollment", () => {
  it("is completed once every core lesson is", () => {
    const done = toEnrollment({ courseId: 1, lessons: [lesson(1, "core", [[1, 1]], "completed"), lesson(2, "remedial", [[1, 1]])] });
    expect(done.status).toBe("completed");
    expect(done.completedLessonIds).toEqual(["1"]);
    const open = toEnrollment({ courseId: 1, lessons: [lesson(1, "core", [[1, 1]], "completed"), lesson(2, "core", [[1, 1]], "in_progress")] });
    expect(open.status).toBe("active");
  });
});

describe("toCourse", () => {
  it("maps the level and status names the pages use", () => {
    const course: BackendCourse = {
      courseId: 3, instructor: { userId: 2, fullName: "Ian" }, title: "Band 7+", description: null, targetLevel: "advanced", status: "pending_review",
      reviewFeedback: null, submittedAt: null, reviewedAt: null, lessonCount: 3, createdAt: "", updatedAt: "",
    };
    const c = toCourse(course);
    expect(c.id).toBe("3");
    expect(c.level).toBe(3);
    expect(c.status).toBe("pending");
    expect(c.description).toBe("");
  });
});
