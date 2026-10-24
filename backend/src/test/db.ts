// Helpers for tests that use the test database (TEST_DATABASE_URL, see vitest.config.ts).
import bcrypt from "bcrypt";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import { signToken } from "../utils/jwt.ts";
import type { UserRole } from "../utils/public-user.ts";

// Empties every table and restarts the id counters, so each test starts from a blank
// database. When a table is added to schema.prisma, add it here too.
export const resetDb = async () => {
  const plan = db.raw.sql`
    TRUNCATE TABLE
      users, courses, lessons, lesson_skills, passages_media, skills,
      questions, question_skills, quizzes, quiz_questions, quiz_attempts, question_responses,
      user_skill_mastery, enrollments, lesson_progress, recommendations
    RESTART IDENTITY CASCADE
  `
    .affectedCount()
    .build();

  await db.runtime().execute(plan);
};

let userCount = 0;

// Inserts a user straight into the database and returns the row plus its plain password.
// bcrypt cost 4 (the minimum) keeps tests fast; the app itself uses 10.
export const createTestUser = async (
  options: { role?: UserRole; isActive?: boolean; email?: string } = {},
) => {
  userCount += 1;
  const email = options.email ?? `user${userCount}@test.dev`;
  const password = "test-password";

  const user = await db.orm.public.Users.create({
    email: varchar<255>(email),
    fullName: varchar<255>(`Test User ${userCount}`),
    hashedPass: varchar<255>(await bcrypt.hash(password, 4)),
    role: options.role ?? "learner",
    isActive: options.isActive ?? true,
  });

  return { user, password };
};

// The `Authorization` header value for a user, as the frontend would send it
export const authHeader = (userId: number) => `Bearer ${signToken(userId)}`;
