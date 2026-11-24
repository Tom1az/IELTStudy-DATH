// The admin audit log (contract: GET /admin/audit). `audit` runs inside the caller's transaction,
// so an entry exists exactly when the change it records was saved.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";

type Orm = typeof db.orm.public;

export type AuditAction =
  | "user.role_change"
  | "user.deactivate"
  | "user.activate"
  | "course.approve"
  | "course.reject"
  | "course.archive"
  | "report.resolve"
  | "report.dismiss"
  | "comment.remove";

export type AuditTarget = "user" | "course" | "report" | "comment";

// The newest entries the endpoint returns; older ones stay in the table
export const AUDIT_LIST_LIMIT = 500;

export const audit = async (
  orm: Orm,
  actorId: number,
  entry: {
    action: AuditAction;
    targetType: AuditTarget;
    targetId: number;
    summary: string;
    details?: Record<string, unknown> | null;
  },
) => {
  await orm.AdminAuditLogs.create({
    actorId,
    action: varchar<64>(entry.action),
    targetType: varchar<32>(entry.targetType),
    targetId: entry.targetId,
    summary: varchar<500>(entry.summary.length > 500 ? `${entry.summary.slice(0, 499)}…` : entry.summary),
    details: (entry.details ?? null) as never,
  });
};

export const listAuditEntries = async (filters: { action?: string; actorId?: number }) => {
  const orm = db.orm.public;
  const rows = await orm.AdminAuditLogs.where((a) =>
    and(
      filters.action ? a.action.eq(varchar<64>(filters.action)) : a.auditId.isNotNull(),
      filters.actorId !== undefined ? a.actorId.eq(filters.actorId) : a.auditId.isNotNull(),
    ),
  )
    .orderBy([(a) => a.createdAt.desc(), (a) => a.auditId.desc()])
    .limit(AUDIT_LIST_LIMIT)
    .all();

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is number => id !== null))];
  const actors =
    actorIds.length > 0 ? await orm.Users.where((u) => u.userId.in(actorIds)).all() : [];
  const actorById = new Map(actors.map((u) => [u.userId, u]));

  return rows.map((row) => {
    const actor = row.actorId !== null ? actorById.get(row.actorId) : undefined;
    return {
      auditId: row.auditId,
      action: row.action,
      actor: actor ? { userId: actor.userId, fullName: actor.fullName, role: actor.role } : null,
      targetType: row.targetType,
      targetId: row.targetId,
      summary: row.summary,
      details: row.details,
      createdAt: row.createdAt,
    };
  });
};
