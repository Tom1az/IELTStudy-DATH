import type { AccountStatus, Course, Paginated, Role, SkillCategory, User } from "@/lib/types";
import type { BackendAdminStats, BackendCourse, BackendLesson, BackendSkill, BackendUser } from "./backend-types";
import { backendRequest, optional } from "./client";
import { lessonCategory, toCourse, toSkillCategories, toUser } from "./mappers";

/**
 * Admin: users (role and deactivation), the course review queue, usage statistics and
 * the audit log. Decisions: `docs/plans/phase-4-frontend.md`.
 */

/** A course in the admin list, with its core lessons counted per skill. */
export interface AdminCourse extends Course {
  instructorName: string;
  lessonCount: number;
  skillCounts: Record<SkillCategory, number>;
}

export type AdminStats = BackendAdminStats;

/**
 * `GET /admin/audit` is not in `backend/src/docs/openapi.yaml` yet, so its shape lives here
 * rather than in `backend-types.ts` (which only mirrors the documented contract). Move it
 * there once the endpoint is written up.
 */
interface BackendAuditEntry {
  auditId: number;
  action: string;
  actor: { userId: number; fullName: string; role: Role } | null;
  targetType: string | null;
  targetId: number | null;
  summary: string | null;
  createdAt: string;
}

/** One recorded action. `actor` is null for something the system did on its own. */
export interface AuditEntry {
  id: string;
  action: string;
  actor: { id: string; name: string; role: Role } | null;
  /** What the action was about, e.g. "Course #12". Empty when the action has no target. */
  target: string;
  summary: string;
  at: string;
}

/** The log plus the values to offer in the two filters, taken from the rows themselves. */
export interface AuditPage extends Paginated<AuditEntry> {
  actions: string[];
  actors: { id: string; name: string }[];
}

/** `course.approve` reads as "Course approved" in the table. */
export function auditActionLabel(action: string): string {
  const [subject, verb] = action.split(".");
  if (!verb) return action;
  const noun = subject.replace(/_/g, " ");
  const stem = verb.replace(/_/g, " ");
  const past = stem.endsWith("e") ? `${stem}d` : `${stem}ed`;
  return `${noun[0].toUpperCase()}${noun.slice(1)} ${past}`;
}

function toAuditEntry(row: BackendAuditEntry): AuditEntry {
  return {
    id: String(row.auditId),
    action: row.action,
    actor: row.actor ? { id: String(row.actor.userId), name: row.actor.fullName, role: row.actor.role } : null,
    target: row.targetType ? `${row.targetType[0].toUpperCase()}${row.targetType.slice(1)} #${row.targetId ?? "—"}` : "",
    summary: row.summary ?? "",
    at: row.createdAt,
  };
}

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

  /**
   * `GET /admin/audit` — who did what, newest first. Like the users table, the backend
   * returns the matching rows and the paging is done here, so the two filters can be
   * combined without another round trip.
   *
   * Null while the backend doesn't record an audit log yet; the page then says so.
   */
  async audit(params: { action?: string; actorId?: string; page?: number; pageSize?: number } = {}): Promise<AuditPage | null> {
    const query = new URLSearchParams();
    if (params.action && params.action !== "all") query.set("action", params.action);
    if (params.actorId && params.actorId !== "all") query.set("actorId", params.actorId);
    const qs = query.toString();
    const res = await optional(() => backendRequest<{ entries: BackendAuditEntry[] }>("GET", `/admin/audit${qs ? `?${qs}` : ""}`));
    if (!res) return null;

    const rows = res.entries.map(toAuditEntry);
    rows.sort((a, b) => b.at.localeCompare(a.at));

    // The dropdowns list exactly what the log holds, so they can never offer an empty filter
    const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
    const actorMap = new Map<string, string>();
    for (const row of rows) {
      if (row.actor) actorMap.set(row.actor.id, row.actor.name);
    }
    const actors = Array.from(actorMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = params.pageSize ?? 20;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      actions,
      actors,
    };
  },
};
