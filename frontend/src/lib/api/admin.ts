import type { AccountStatus, Course, Paginated, Role, SkillCategory, User } from "@/lib/types";
import type { BackendAdminStats, BackendCourse, BackendLesson, BackendSkill, BackendUser } from "./backend-types";
import { backendRequest } from "./client";
import { lessonCategory, toCourse, toSkillCategories, toUser } from "./mappers";

/**
 * Admin: users (role and deactivation), the course review queue, and usage statistics.
 * Decisions: `docs/plans/phase-4-frontend.md`.
 */

/** A course in the admin list, with its core lessons counted per skill. */
export interface AdminCourse extends Course {
  instructorName: string;
  lessonCount: number;
  skillCounts: Record<SkillCategory, number>;
}

export type AdminStats = BackendAdminStats;

export const adminApi = {
  /** The users table. The backend filters by role and status; search and paging run here. */
  async users(params: { q?: string; role?: Role | "all"; status?: AccountStatus | "all"; page?: number; pageSize?: number } = {}): Promise<Paginated<User>> {
    const query = new URLSearchParams();
    if (params.role && params.role !== "all") query.set("role", params.role);
    if (params.status === "active") query.set("isActive", "true");
    if (params.status === "suspended") query.set("isActive", "false");
    const qs = query.toString();
    const res = await backendRequest<{ users: BackendUser[] }>("GET", `/admin/users${qs ? `?${qs}` : ""}`);

    const q = (params.q ?? "").trim().toLowerCase();
    const matches = res.users.filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    // The API lists the oldest account first; the table shows the newest first
    matches.reverse();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = params.pageSize ?? 10;
    // `placementDone` doesn't matter on this page, so it isn't looked up for each learner
    const items = matches.slice((page - 1) * pageSize, page * pageSize).map((u) => toUser(u, u.role !== "learner"));
    return { items, page, pageSize, total: matches.length, totalPages: Math.max(1, Math.ceil(matches.length / pageSize)) };
  },

  /** Role changes and deactivation share one endpoint. Admins can't change their own account (409). */
  async setRole(userId: string, role: Role): Promise<User> {
    const res = await backendRequest<{ user: BackendUser }>("PATCH", `/admin/users/${userId}`, { role });
    return toUser(res.user, res.user.role !== "learner");
  },

  /** A suspended user can't log in, and their current token stops working at once. */
  async setStatus(userId: string, status: AccountStatus): Promise<User> {
    const res = await backendRequest<{ user: BackendUser }>("PATCH", `/admin/users/${userId}`, { isActive: status === "active" });
    return toUser(res.user, res.user.role !== "learner");
  },

  /** Every course, with lesson counts per skill. Waiting for review first, then by level. */
  async courses(): Promise<AdminCourse[]> {
    const [res, skills] = await Promise.all([
      backendRequest<{ courses: BackendCourse[] }>("GET", "/admin/courses"),
      backendRequest<{ skills: BackendSkill[] }>("GET", "/skills"),
    ]);
    const categories = toSkillCategories(skills.skills);
    const lessonLists = await Promise.all(res.courses.map((c) => backendRequest<{ lessons: BackendLesson[] }>("GET", `/courses/${c.courseId}/lessons`).then((r) => r.lessons)));

    const list: AdminCourse[] = [];
    for (let i = 0; i < res.courses.length; i++) {
      const counts: Record<SkillCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
      for (const lesson of lessonLists[i]) {
        if (lesson.kind === "core") counts[lessonCategory(lesson, categories)] += 1;
      }
      list.push({ ...toCourse(res.courses[i]), instructorName: res.courses[i].instructor.fullName, lessonCount: res.courses[i].lessonCount, skillCounts: counts });
    }
    const order = ["pending", "published", "hidden", "draft", "rejected"];
    list.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.level - b.level);
    return list;
  },

  /** Approve (feedback optional) or reject (feedback required) a course waiting for review. */
  async reviewCourse(courseId: string, decision: "approve" | "reject", feedback: string): Promise<Course> {
    const text = feedback.trim();
    const body = decision === "reject" || text ? { feedback: text } : {};
    const res = await backendRequest<{ course: BackendCourse }>("POST", `/courses/${courseId}/${decision}`, body);
    return toCourse(res.course);
  },

  /** Archiving is permanent: the course leaves the catalog, and learner history is kept. */
  async archiveCourse(courseId: string): Promise<Course> {
    const res = await backendRequest<{ course: BackendCourse }>("POST", `/courses/${courseId}/archive`);
    return toCourse(res.course);
  },

  /** Users, courses, enrolments and attempts, counted by the API. */
  async stats(): Promise<AdminStats> {
    const res = await backendRequest<{ stats: BackendAdminStats }>("GET", "/admin/stats");
    return res.stats;
  },
};
