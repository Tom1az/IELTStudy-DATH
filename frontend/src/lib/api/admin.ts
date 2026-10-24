import type { AccountStatus, AuditLog, ContentReport, Course, Lesson, Paginated, PracticeSet, Recommendation, Role, Skill, SkillCategory, User } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { MASTERY_THRESHOLD, bandsBySkill, categoryMastery } from "@/lib/adaptive/bkt";
import { recommendNext } from "@/lib/adaptive/recommender";
import { ApiError, qs, request } from "./client";
import { audit, commit, db, hashPassword, isEmail, notify, nowIso, publicUser, requireUser, resetDb, uid, validate } from "./mock-db";
import { lessonsOf, masteryMap, progressOf, skillCounts } from "./helpers";
import { learnerRisk, type LearnerRow } from "./instructor";

export interface AdminStats {
  users: Record<Role, number>;
  activeLearners7d: number;
  newUsers30d: number;
  enrollments: number;
  activeEnrollments: number;
  completionRate: number;
  avgPracticeScore: number;
  attempts30d: number;
  enrollmentsByWeek: { week: string; count: number }[];
  attemptsByWeek: { week: string; count: number }[];
  scoreBySkill: { skill: SkillCategory; avgPct: number; attempts: number }[];
  courses: { id: string; title: string; level: number; status: Course["status"]; learners: number; completionRate: number; avgProgress: number }[];
  openReports: number;
  pendingCourses: number;
  atRisk: (LearnerRow & { courseTitle: string })[];
  recommender: { shown: number; clicked: number; ctr: number; helpful: number; notHelpful: number; belowThresholdShare: number };
}

const weekKey = (iso: string) => {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

function lastWeeks(n: number) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(weekKey(new Date(Date.now() - i * 7 * 86400000).toISOString()));
  return out;
}

export const adminApi = {
  stats() {
    return request<AdminStats>("GET", "/admin/stats", undefined, () => {
      requireUser(["admin"]);
      const d = db();
      const users = { learner: 0, instructor: 0, admin: 0 } as Record<Role, number>;
      for (const u of d.users) users[u.role]++;
      const now = Date.now();
      const ens = d.enrollments.filter((e) => e.status !== "left");
      const subs = d.attempts.filter((a) => a.status === "submitted" && a.kind === "practice");
      const weeks = lastWeeks(8);
      const setSkill = new Map(d.practiceSets.map((s) => [s.id, s.skill]));
      const atRisk = d.courses.filter((c) => c.status === "published").flatMap((c) =>
        ens.filter((e) => e.courseId === c.id && e.status === "active").map((e) => ({ ...learnerRisk(e.userId, c.id)!, courseTitle: c.title })).filter((r) => r && r.risk === "at_risk"),
      );
      const shown = d.recEvents.filter((e) => e.action === "shown").length;
      const clicked = d.recEvents.filter((e) => e.action === "clicked").length;
      const learnerIds = new Set(d.users.filter((u) => u.role === "learner").map((u) => u.id));
      const mrows = d.mastery.filter((m) => learnerIds.has(m.userId));
      return {
        users,
        activeLearners7d: d.users.filter((u) => u.role === "learner" && u.lastActiveAt && now - Date.parse(u.lastActiveAt) < 7 * 86400000).length,
        newUsers30d: d.users.filter((u) => now - Date.parse(u.createdAt) < 30 * 86400000).length,
        enrollments: ens.length,
        activeEnrollments: ens.filter((e) => e.status === "active").length,
        completionRate: ens.length ? Math.round((ens.filter((e) => e.status === "completed").length / ens.length) * 100) : 0,
        avgPracticeScore: subs.length ? Math.round((subs.reduce((t, a) => t + a.totalScore / a.maxScore, 0) / subs.length) * 100) : 0,
        attempts30d: subs.filter((a) => now - Date.parse(a.completedAt!) < 30 * 86400000).length,
        enrollmentsByWeek: weeks.map((w) => ({ week: w, count: ens.filter((e) => weekKey(e.enrolledAt) === w).length })),
        attemptsByWeek: weeks.map((w) => ({ week: w, count: subs.filter((a) => weekKey(a.completedAt!) === w).length })),
        scoreBySkill: SKILL_CATEGORIES.map((skill) => {
          const as = subs.filter((a) => setSkill.get(a.quizId) === skill);
          return { skill, attempts: as.length, avgPct: as.length ? Math.round((as.reduce((t, a) => t + a.totalScore / a.maxScore, 0) / as.length) * 100) : 0 };
        }),
        courses: d.courses.map((c) => {
          const ce = ens.filter((e) => e.courseId === c.id);
          return { id: c.id, title: c.title, level: c.level, status: c.status, learners: ce.length, completionRate: ce.length ? Math.round((ce.filter((e) => e.status === "completed").length / ce.length) * 100) : 0, avgProgress: ce.length ? Math.round(ce.reduce((t, e) => t + progressOf(e).pct, 0) / ce.length) : 0 };
        }),
        openReports: d.reports.filter((r) => r.status === "open").length,
        pendingCourses: d.courses.filter((c) => c.status === "pending").length,
        atRisk,
        recommender: {
          shown, clicked, ctr: shown ? clicked / shown : 0,
          helpful: d.recEvents.filter((e) => e.action === "helpful").length, notHelpful: d.recEvents.filter((e) => e.action === "not_helpful").length,
          belowThresholdShare: mrows.length ? mrows.filter((m) => m.masteryProb < MASTERY_THRESHOLD).length / mrows.length : 0,
        },
      };
    });
  },

  users(params: { q?: string; role?: Role | "all"; status?: AccountStatus | "all"; page?: number; pageSize?: number } = {}) {
    return request<Paginated<User & { enrollments: number }>>("GET", `/admin/users${qs(params)}`, undefined, () => {
      requireUser(["admin"]);
      const q = (params.q ?? "").toLowerCase();
      const list = db().users
        .filter((u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!params.role || params.role === "all" || u.role === params.role) && (!params.status || params.status === "all" || u.status === params.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = Math.max(1, params.page ?? 1);
      const pageSize = params.pageSize ?? 10;
      return {
        items: list.slice((page - 1) * pageSize, page * pageSize).map((u) => ({ ...publicUser(u), enrollments: db().enrollments.filter((e) => e.userId === u.id && e.status !== "left").length })),
        page, pageSize, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / pageSize)),
      };
    });
  },

  createUser(input: { name: string; email: string; role: Role; tempPassword: string }) {
    return request<User>("POST", "/admin/users", input, () => {
      const admin = requireUser(["admin"]);
      const email = input.email.trim().toLowerCase();
      validate({
        name: input.name.trim().length < 2 && "Enter a full name.",
        email: !isEmail(email) ? "Enter a valid email." : db().users.some((u) => u.email === email) && "This email is already registered.",
        tempPassword: input.tempPassword.length < 8 && "Temporary password must be 8+ characters.",
      });
      const u = { id: uid("u"), email, name: input.name.trim(), role: input.role, status: "active" as const, targetBand: 7, createdAt: nowIso(), placementDone: input.role !== "learner", passwordHash: hashPassword(input.tempPassword), notificationPrefs: { newContent: true, deadlines: true, results: true, email: false } };
      db().users.push(u);
      audit(admin, "user.create", `${u.name} (${u.email})`, `role: ${u.role}`);
      commit();
      return publicUser(u);
    });
  },

  setRole(userId: string, role: Role) {
    return request<User>("POST", `/admin/users/${userId}/role`, { role }, () => {
      const admin = requireUser(["admin"]);
      const u = db().users.find((x) => x.id === userId);
      if (!u) throw new ApiError(404, "NOT_FOUND", "User not found.");
      if (u.id === admin.id) throw new ApiError(409, "SELF_CHANGE", "You can't change your own role.");
      const before = u.role;
      u.role = role;
      audit(admin, "user.role_change", `${u.name} (${u.email})`, `${before} → ${role}`);
      commit();
      return publicUser(u);
    });
  },

  setStatus(userId: string, status: AccountStatus, reason?: string) {
    return request<User>("POST", `/admin/users/${userId}/status`, { status, reason }, () => {
      const admin = requireUser(["admin"]);
      const u = db().users.find((x) => x.id === userId);
      if (!u) throw new ApiError(404, "NOT_FOUND", "User not found.");
      if (u.id === admin.id) throw new ApiError(409, "SELF_CHANGE", "You can't suspend your own account.");
      u.status = status;
      audit(admin, status === "suspended" ? "user.suspend" : "user.activate", `${u.name} (${u.email})`, reason);
      commit();
      return publicUser(u);
    });
  },

  courses() {
    return request<(Course & { instructorName: string; lessonCount: number; skillCounts: Record<SkillCategory, number>; learners: number })[]>("GET", "/admin/courses", undefined, () => {
      requireUser(["admin"]);
      const d = db();
      const order = ["pending", "published", "hidden", "draft", "rejected"];
      return d.courses
        .map((c) => ({ ...c, instructorName: d.users.find((u) => u.id === c.instructorId)?.name ?? "—", lessonCount: lessonsOf(c.id, true).length, skillCounts: skillCounts(lessonsOf(c.id, true)), learners: d.enrollments.filter((e) => e.courseId === c.id && e.status !== "left").length }))
        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.level - b.level);
    });
  },

  reviewCourse(courseId: string, decision: "approve" | "reject", feedback: string) {
    return request<Course>("POST", `/admin/courses/${courseId}/review`, { decision, feedback }, () => {
      const admin = requireUser(["admin"]);
      const c = db().courses.find((x) => x.id === courseId);
      if (!c) throw new ApiError(404, "NOT_FOUND", "Course not found.");
      if (c.status !== "pending") throw new ApiError(409, "NOT_PENDING", "Only courses waiting for review can be approved or rejected.");
      validate({ feedback: decision === "reject" && feedback.trim().length < 10 && "Tell the instructor what to change (10+ characters)." });
      c.status = decision === "approve" ? "published" : "rejected";
      c.reviewFeedback = feedback.trim() || undefined;
      c.updatedAt = nowIso();
      if (decision === "approve") for (const l of lessonsOf(c.id, true)) if (l.status === "draft") l.status = "published";
      notify(c.instructorId, { type: "review", title: decision === "approve" ? `${c.title} is live` : `${c.title} needs changes`, body: feedback.trim() || "Approved without comments.", link: `/instructor/courses/${c.id}` });
      audit(admin, decision === "approve" ? "course.approve" : "course.reject", c.title, feedback.trim() || undefined);
      commit();
      return c;
    });
  },

  setCourseStatus(courseId: string, status: "published" | "hidden") {
    return request<Course>("POST", `/admin/courses/${courseId}/status`, { status }, () => {
      const admin = requireUser(["admin"]);
      const c = db().courses.find((x) => x.id === courseId);
      if (!c) throw new ApiError(404, "NOT_FOUND", "Course not found.");
      c.status = status;
      c.updatedAt = nowIso();
      audit(admin, status === "hidden" ? "course.hide" : "course.publish", c.title);
      commit();
      return c;
    });
  },

  reports(status: ContentReport["status"] | "all" = "open") {
    return request<ContentReport[]>("GET", `/admin/reports${qs({ status })}`, undefined, () => {
      requireUser(["admin"]);
      return db().reports.filter((r) => status === "all" || r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  },

  resolveReport(reportId: string, action: "hide_content" | "dismiss" | "suspend_author", note: string) {
    return request<ContentReport>("POST", `/admin/reports/${reportId}/resolve`, { action, note }, () => {
      const admin = requireUser(["admin"]);
      const d = db();
      const r = d.reports.find((x) => x.id === reportId);
      if (!r) throw new ApiError(404, "NOT_FOUND", "Report not found.");
      if (r.status !== "open") throw new ApiError(409, "ALREADY_RESOLVED", "This report has already been handled.");
      if (action === "hide_content" || action === "suspend_author") {
        if (r.targetType === "post") {
          const p = d.posts.find((x) => x.id === r.targetId);
          if (p) p.hidden = true;
          if (action === "suspend_author" && p) {
            const author = d.users.find((u) => u.id === p.userId);
            if (author && author.role === "learner") { author.status = "suspended"; audit(admin, "user.suspend", `${author.name} (${author.email})`, `Report ${r.id}`); }
          }
        } else if (r.targetType === "question") {
          // flag to the course instructor rather than silently editing content
          const set = d.practiceSets.find((s) => s.questions.some((q) => q.id === r.targetId));
          const c = d.courses.find((x) => x.id === set?.courseId);
          if (c) notify(c.instructorId, { type: "review", title: "A question was reported", body: `${r.reason}: “${r.targetPreview.slice(0, 80)}”. ${note}`, link: `/instructor/questions?q=${encodeURIComponent(r.targetPreview.slice(0, 30))}` });
        }
        r.status = "resolved";
      } else r.status = "dismissed";
      r.resolvedBy = admin.name;
      r.resolution = note.trim() || (r.status === "dismissed" ? "No action needed." : "Content hidden.");
      notify(r.reporterId, { type: "system", title: "Your report was reviewed", body: r.status === "resolved" ? "Thanks — we took action on the content you reported." : "We reviewed your report and found no violation.", link: undefined });
      audit(admin, `report.${r.status === "resolved" ? "resolve" : "dismiss"}`, `Report ${r.id} (${r.targetType})`, `${action}: ${r.resolution}`);
      commit();
      return r;
    });
  },

  audit(params: { q?: string; page?: number; pageSize?: number } = {}) {
    return request<Paginated<AuditLog>>("GET", `/admin/audit${qs(params)}`, undefined, () => {
      requireUser(["admin"]);
      const q = (params.q ?? "").toLowerCase();
      const list = db().audit.filter((a) => !q || `${a.action} ${a.target} ${a.actorName} ${a.detail ?? ""}`.toLowerCase().includes(q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = Math.max(1, params.page ?? 1);
      const pageSize = params.pageSize ?? 15;
      return { items: list.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / pageSize)) };
    });
  },

  skills() {
    return request<(Skill & { lessons: number; questions: number })[]>("GET", "/admin/skills", undefined, () => {
      requireUser(["admin"]);
      const d = db();
      return d.skills.map((s) => ({ ...s, lessons: d.lessons.filter((l) => l.skillIds.includes(s.id)).length, questions: d.practiceSets.reduce((n, ps) => n + ps.questions.filter((q) => q.skills.some((x) => x.skillId === s.id)).length, 0) }));
    });
  },

  upsertSkill(input: Skill, isNew: boolean) {
    return request<Skill>(isNew ? "POST" : "PUT", isNew ? "/admin/skills" : `/admin/skills/${input.id}`, input, () => {
      const admin = requireUser(["admin"]);
      const d = db();
      const code = input.code.trim().toUpperCase();
      validate({
        code: !/^[A-Z]{1,2}\.[A-Z0-9]{2,8}$/.test(code) ? "Use a code like R.SCAN (category letter, dot, 2–8 letters)." : isNew && d.skills.some((s) => s.id === code) && "This code already exists.",
        name: input.name.trim().length < 3 && "Give the skill a name.",
        description: input.description.trim().length < 10 && "Describe what this skill covers.",
      });
      const row: Skill = { ...input, id: isNew ? code : input.id, code: isNew ? code : input.code, name: input.name.trim(), description: input.description.trim() };
      if (isNew) d.skills.push(row); else Object.assign(d.skills.find((s) => s.id === input.id) ?? {}, row);
      audit(admin, isNew ? "skill.create" : "skill.update", `${row.code} ${row.name}`);
      commit();
      return row;
    });
  },

  deleteSkill(id: string) {
    return request<{ ok: true }>("DELETE", `/admin/skills/${id}`, undefined, () => {
      const admin = requireUser(["admin"]);
      const d = db();
      const used = d.lessons.some((l) => l.skillIds.includes(id)) || d.practiceSets.some((ps) => ps.questions.some((q) => q.skills.some((x) => x.skillId === id)));
      if (used) throw new ApiError(409, "IN_USE", "This skill is tagged on lessons or questions. Remove those tags first.");
      d.skills = d.skills.filter((s) => s.id !== id);
      d.mastery = d.mastery.filter((m) => m.skillId !== id);
      audit(admin, "skill.delete", id);
      commit();
      return { ok: true as const };
    });
  },

  /** Inputs for the in-browser A/B simulation plus live recommendations for three learner profiles. */
  evaluationData(courseId: string) {
    return request<{ course: Course; lessons: Lesson[]; sets: PracticeSet[]; skills: Skill[]; popularityOrder: string[]; profiles: { userId: string; name: string; band: number; categories: Record<SkillCategory, number>; recs: Recommendation[]; latencyMs: number }[] }>("GET", `/admin/evaluation${qs({ courseId })}`, undefined, () => {
      requireUser(["admin"]);
      const d = db();
      const lessons = lessonsOf(courseId);
      const setIds = new Set(lessons.map((l) => l.practiceSetId));
      const counts = new Map<string, number>();
      for (const e of d.enrollments) for (const id of e.completedLessonIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      const popularityOrder = [...lessons].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).map((l) => l.id);
      const profiles = ["u-learner", "u-l2", "u-l3", "u-l5"].map((id) => d.users.find((u) => u.id === id)).filter(Boolean).map((u) => {
        const m = masteryMap(u!.id);
        const t0 = performance.now();
        const recs = recommendNext({ mastery: m, skills: d.skills, courses: d.courses, lessons: d.lessons, sets: d.practiceSets, enrollments: d.enrollments.filter((e) => e.userId === u!.id && e.status !== "left"), k: 3 });
        const latencyMs = performance.now() - t0;
        const { overall } = bandsBySkill(m, d.skills);
        return { userId: u!.id, name: u!.name, band: overall, categories: Object.fromEntries(SKILL_CATEGORIES.map((c) => [c, categoryMastery(m, d.skills, c)])) as Record<SkillCategory, number>, recs, latencyMs };
      });
      const course = d.courses.find((c) => c.id === courseId);
      if (!course) throw new ApiError(404, "NOT_FOUND", "Course not found.");
      return { course, lessons, sets: d.practiceSets.filter((x) => setIds.has(x.id)), skills: d.skills, popularityOrder, profiles };
    });
  },

  /** Demo only: restores the seed data. */
  resetDemoData() {
    return request<{ ok: true }>("POST", "/admin/reset-demo", {}, () => {
      requireUser(["admin"]);
      resetDb();
      return { ok: true as const };
    });
  },
};
