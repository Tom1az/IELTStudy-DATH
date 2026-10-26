export type UserRole = "learner" | "instructor" | "admin";

// The `User` shape from the API contract. It never includes `hashedPass`.
export type PublicUser = {
  userId: number;
  email: string;
  fullName: string;
  role: UserRole;
  targetBand: number | null;
  isActive: boolean;
  createdAt: Temporal.Instant;
};

// Copies only the public fields, so a database row with `hashedPass` can't leak by accident
export const toPublicUser = (row: PublicUser): PublicUser => ({
  userId: row.userId,
  email: row.email,
  fullName: row.fullName,
  role: row.role,
  targetBand: row.targetBand,
  isActive: row.isActive,
  createdAt: row.createdAt,
});
