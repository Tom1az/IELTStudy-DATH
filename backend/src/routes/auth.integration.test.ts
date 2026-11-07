import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { createTestUser, resetDb } from "../test/db.ts";

const newLearner = {
  email: "minh.anh@example.com",
  fullName: "Minh Anh",
  password: "correct-horse-battery",
};

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/v1/auth/register", () => {
  it("creates a learner and returns a working token", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(newLearner);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: newLearner.email,
      fullName: newLearner.fullName,
      role: "learner",
      targetBand: null,
      isActive: true,
    });
    expect(res.body.user.hashedPass).toBeUndefined();
    expect(typeof res.body.user.createdAt).toBe("string");

    const me = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.userId).toBe(res.body.user.userId);
  });

  it("stores the email in lowercase", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...newLearner, email: "  Minh.Anh@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("minh.anh@example.com");
  });

  it("does not let the client choose a role", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...newLearner, role: "admin" });

    expect(res.status).toBe(400);
  });

  it("returns 409 for an email that already exists, in any letter case", async () => {
    await request(app).post("/api/v1/auth/register").send(newLearner);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...newLearner, email: "MINH.ANH@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("An account with this email already exists");
  });

  it("returns 409, not 500, when two sign-ups with the same email race", async () => {
    // Both requests can pass the "email exists?" check before either inserts. The database's
    // UNIQUE constraint then rejects the second insert, which must still come back as a 409.
    const [first, second] = await Promise.all([
      request(app).post("/api/v1/auth/register").send(newLearner),
      request(app).post("/api/v1/auth/register").send(newLearner),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it("returns 400 with one detail per invalid field", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", fullName: "Al", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details).toHaveLength(3);
  });

  it("rejects a password longer than 72 bytes, counting bytes, not characters", async () => {
    // 37 "é" characters are 74 bytes in UTF-8
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...newLearner, password: "é".repeat(37) });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("logs in with the right password", async () => {
    const { user, password } = await createTestUser({ email: "lena@test.dev" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "Lena@Test.dev", password });

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(user.userId);
    expect(typeof res.body.token).toBe("string");
  });

  it("gives the same 401 for an unknown email and a wrong password", async () => {
    await createTestUser({ email: "lena@test.dev" });

    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "lena@test.dev", password: "not-the-password" });
    const unknownEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.dev", password: "not-the-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it("returns 403 for a deactivated account with the right password", async () => {
    const { password } = await createTestUser({ email: "gone@test.dev", isActive: false });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "gone@test.dev", password });

    expect(res.status).toBe(403);
  });

  it("returns 401, not 403, for a deactivated account with a wrong password", async () => {
    await createTestUser({ email: "gone@test.dev", isActive: false });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "gone@test.dev", password: "not-the-password" });

    expect(res.status).toBe(401);
  });
});
