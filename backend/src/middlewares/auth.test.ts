import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../prisma/db.ts";
import { authHeader, createTestUser, resetDb } from "../test/db.ts";
import { authenticate, authorize } from "./auth.ts";

// A small app with one route per access rule, so the middlewares are tested on their own
const testApp = express();
testApp.get("/any", authenticate, (req, res) => {
  res.json({ userId: req.user!.userId });
});
testApp.get("/admin-only", authenticate, authorize("admin"), (req, res) => {
  res.json({ ok: true });
});
testApp.get("/staff", authenticate, authorize("instructor", "admin"), (req, res) => {
  res.json({ ok: true });
});
testApp.get("/no-authenticate", authorize("admin"), (req, res) => {
  res.json({ ok: true });
});
// Express 5's default error handler only sends HTML, so send the status as JSON like app.ts does
testApp.use(
  (
    err: Error & { status?: number },
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err.status ?? 500).json({ error: { message: err.message } });
  },
);

beforeEach(async () => {
  await resetDb();
});

describe("authenticate", () => {
  it("lets a valid token through and sets req.user", async () => {
    const { user } = await createTestUser();

    const res = await request(testApp).get("/any").set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.userId);
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await request(testApp).get("/any");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Please log in");
  });

  it("returns 401 for a header that isn't a Bearer token", async () => {
    const { user } = await createTestUser();
    const token = authHeader(user.userId).replace("Bearer ", "");

    const res = await request(testApp).get("/any").set("Authorization", `Basic ${token}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(testApp).get("/any").set("Authorization", "Bearer not.a.jwt");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const { user } = await createTestUser();
    // Issued 2 days ago and valid for 1 day
    const expired = jwt.sign(
      { iat: Math.floor(Date.now() / 1000) - 2 * 24 * 3600 },
      process.env.JWT_SECRET!,
      { subject: String(user.userId), algorithm: "HS256", expiresIn: "1d" },
    );

    const res = await request(testApp).get("/any").set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for a token signed with another secret", async () => {
    const { user } = await createTestUser();
    const forged = jwt.sign({}, "some-other-secret", {
      subject: String(user.userId),
      algorithm: "HS256",
    });

    const res = await request(testApp).get("/any").set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 when the user no longer exists", async () => {
    const { user } = await createTestUser();
    await db.orm.public.Users.where({ userId: user.userId }).delete();

    const res = await request(testApp).get("/any").set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(401);
  });

  it("returns 401 at once when the user is deactivated after the token was issued", async () => {
    const { user } = await createTestUser();
    const header = authHeader(user.userId);
    await db.orm.public.Users.where({ userId: user.userId }).update({ isActive: false });

    const res = await request(testApp).get("/any").set("Authorization", header);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("This account is deactivated");
  });
});

describe("authorize", () => {
  it("allows a user whose role is listed", async () => {
    const { user } = await createTestUser({ role: "admin" });

    const res = await request(testApp)
      .get("/admin-only")
      .set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(200);
  });

  it("returns 403 for a role that isn't listed", async () => {
    const { user } = await createTestUser({ role: "learner" });

    const res = await request(testApp)
      .get("/admin-only")
      .set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("You don't have permission to do this");
  });

  it("accepts any of several roles", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser({ role: "learner" });

    const allowed = await request(testApp)
      .get("/staff")
      .set("Authorization", authHeader(instructor.userId));
    const denied = await request(testApp)
      .get("/staff")
      .set("Authorization", authHeader(learner.userId));

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
  });

  it("uses the role in the database, not the role when the token was issued", async () => {
    const { user } = await createTestUser({ role: "learner" });
    const header = authHeader(user.userId);
    await db.orm.public.Users.where({ userId: user.userId }).update({ role: "admin" });

    const res = await request(testApp).get("/admin-only").set("Authorization", header);

    expect(res.status).toBe(200);
  });

  it("returns 401 if a route forgot to run authenticate first", async () => {
    const res = await request(testApp).get("/no-authenticate");

    expect(res.status).toBe(401);
  });
});
