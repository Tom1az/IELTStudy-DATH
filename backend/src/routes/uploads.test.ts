import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
import { authHeader, createTestUser, resetDb } from "../test/db.ts";

// Never call Supabase from tests (see src/test/fake-storage.ts)
vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"));

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/v1/uploads", () => {
  it("gives instructors and admins a signed upload URL under their own folder", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });

    for (const user of [instructor, admin]) {
      const res = await request(app)
        .post("/api/v1/uploads")
        .set("Authorization", authHeader(user.userId))
        .send({ fileName: " part1-booking.mp3 ", contentType: "audio/mpeg" });

      expect(res.status).toBe(201);
      expect(res.body.upload).toEqual({
        uploadUrl: `https://storage.test/upload/${user.userId}/part1-booking.mp3?token=test`,
        path: `${user.userId}/test-part1-booking.mp3`,
      });
    }
  });

  it("returns 403 to learners and 401 without a token", async () => {
    const { user: learner } = await createTestUser();
    const body = { fileName: "part1.mp3", contentType: "audio/mpeg" };

    const byLearner = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", authHeader(learner.userId))
      .send(body);
    expect(byLearner.status).toBe(403);

    const anonymous = await request(app).post("/api/v1/uploads").send(body);
    expect(anonymous.status).toBe(401);
  });

  it("accepts only audio, video and image files, and needs a file name", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const asInstructor = authHeader(instructor.userId);

    const pdf = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", asInstructor)
      .send({ fileName: "notes.pdf", contentType: "application/pdf" });
    expect(pdf.status).toBe(400);

    const noName = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", asInstructor)
      .send({ fileName: "  ", contentType: "audio/mpeg" });
    expect(noName.status).toBe(400);
  });
});
