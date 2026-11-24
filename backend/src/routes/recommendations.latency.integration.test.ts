// Phase 3 target (specs.md): GET /recommendations answers in under 300 ms at p95. Measured on a
// data set the size of the seed (20 skills, 3 courses, 21 lessons) plus history, through the real
// app and database. Each round makes the learner's newest batch stale (a skill gets mastered), so
// half the requests also generate and save a new batch, which is the slower path.
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createTestCourse,
  createTestLesson,
  createTestSkill,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

const ROUNDS = 60;
const P95_LIMIT_MS = 300;

let learnerId = 0;
let skillIds: number[] = [];

beforeAll(async () => {
  await resetDb();
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const { user: learner } = await createTestUser();
  learnerId = learner.userId;
  skillIds = [];
  for (let i = 0; i < 20; i++) skillIds.push((await createTestSkill()).skillId);

  for (let c = 0; c < 3; c++) {
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    for (let l = 0; l < 7; l++) {
      const kind = l < 3 ? "core" : "remedial";
      await createTestLesson({
        courseId: course.courseId,
        kind,
        orderIndex: l,
        skillIds: [skillIds[(c * 7 + l) % 20]!],
      });
    }
    if (c === 0) await enrollTestUser(learnerId, course.courseId);
  }
  for (const [i, skillId] of skillIds.entries()) {
    await db.orm.public.UserSkillMastery.create({
      userId: learnerId,
      skillId,
      masteryProb: 0.2 + (i % 10) * 0.05,
      observations: 3,
    });
  }
});

describe("GET /api/v1/recommendations latency", () => {
  it(`answers within ${P95_LIMIT_MS} ms at p95 over ${ROUNDS} requests`, async () => {
    const header = authHeader(learnerId);
    // Warm-up: the first request also loads modules and opens database connections
    await request(app).get("/api/v1/recommendations").set("Authorization", header);

    const times: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      if (i % 2 === 0) {
        // Master the weakest skill of the current batch, so the next request regenerates
        const current = await db.orm.public.Recommendations.where({ userId: learnerId })
          .orderBy((r) => r.recommendationId.desc())
          .first();
        if (current) {
          await db.orm.public.UserSkillMastery.where({ userId: learnerId, skillId: current.skillId }).update({
            masteryProb: 0.2 + (i % 7) * 0.08,
          });
        }
      }
      const startedAt = performance.now();
      const res = await request(app).get("/api/v1/recommendations").set("Authorization", header);
      times.push(performance.now() - startedAt);
      expect(res.status).toBe(200);
    }

    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)]!;
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    console.log(`GET /recommendations over ${ROUNDS} requests: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThan(P95_LIMIT_MS);
  });
});
