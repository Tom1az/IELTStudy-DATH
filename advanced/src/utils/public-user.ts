export type UserRole = "learner" | "instructor" | "admin";

export type PublicUser = {
  userId: number;
  email: string;
  fullName: string;
  role: UserRole;
  targetBand: number | null;
  isActive: boolean;
  createdAt: Temporal.Instant;
};

export const toPublicUser = (row: PublicUser): PublicUser => ({
  userId: row.userId,
  email: row.email,
  fullName: row.fullName,
  role: row.role,
  targetBand: row.targetBand,
  isActive: row.isActive,
  createdAt: row.createdAt,
});
