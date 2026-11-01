import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { authHeader, createTestSkill, createTestUser, resetDb } from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/skills", () => {
  it("lists every skill, or the skills in one category", async () => {
    const { user } = await createTestUser();
    const reading = await createTestSkill({ category: "reading" });
    const writing = await createTestSkill({ category: "writing" });

    const all = await request(app)
      .get("/api/v1/skills")
      .set("Authorization", authHeader(user.userId));
    expect(all.status).toBe(200);
    expect(all.body.skills.map((s: { skillId: number }) => s.skillId)).toEqual([
      reading.skillId,
      writing.skillId,
    ]);
    expect(Object.keys(all.body.skills[0]).sort()).toEqual(
      ["category", "description", "name", "skillCode", "skillId"].sort(),
    );

    const filtered = await request(app)
      .get("/api/v1/skills?category=writing")
      .set("Authorization", authHeader(user.userId));
    expect(filtered.body.skills).toHaveLength(1);
    expect(filtered.body.skills[0].skillId).toBe(writing.skillId);
  });

  it("returns 400 for an unknown category and 401 without a token", async () => {
    const { user } = await createTestUser();

    const bad = await request(app)
      .get("/api/v1/skills?category=maths")
      .set("Authorization", authHeader(user.userId));
    expect(bad.status).toBe(400);

    const anonymous = await request(app).get("/api/v1/skills");
    expect(anonymous.status).toBe(401);
  });
});
