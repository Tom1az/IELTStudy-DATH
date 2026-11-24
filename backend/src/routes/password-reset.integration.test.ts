import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import { outbox } from "../services/mail.ts";
import { authHeader, createTestUser, resetDb } from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});

// The token from the link in the last email
const lastToken = () => {
  const match = /token=([A-Za-z0-9_-]+)/.exec(outbox.at(-1)?.text ?? "");
  return match?.[1] ?? null;
};

// sendMail runs without being awaited, so give it a tick
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("POST /api/v1/auth/forgot-password", () => {
  it("answers the same 200 for a known and an unknown email, and only mails the known one", async () => {
    const { user } = await createTestUser({ email: "known@test.dev" });

    const known = await request(app).post("/api/v1/auth/forgot-password").send({ email: "KNOWN@test.dev" });
    const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@test.dev" });
    await flush();

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe(user.email);

    // Only a SHA-256 hash is stored, never the token itself
    const rows = await db.orm.public.PasswordResetTokens.where({ userId: user.userId }).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.tokenHash).not.toBe(lastToken());
  });

  it("sends nothing for a deactivated account", async () => {
    await createTestUser({ email: "off@test.dev", isActive: false });
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "off@test.dev" });
    await flush();
    expect(outbox).toHaveLength(0);
  });

  it("rejects a missing or malformed email with 400", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  it("sets the new password once, and older login tokens stop working", async () => {
    const { user, password } = await createTestUser({ email: "reset@test.dev" });
    // A token issued well before the reset
    const oldHeader = authHeader(user.userId);
    await db.orm.public.Users.where({ userId: user.userId }).update({ isActive: true });

    await request(app).post("/api/v1/auth/forgot-password").send({ email: "reset@test.dev" });
    await flush();
    const token = lastToken()!;
    // Make sure the reset happens in a later second than the old token's `iat`
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "brand-new-password" });
    expect(res.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "reset@test.dev", password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "reset@test.dev", password: "brand-new-password" });
    expect(newLogin.status).toBe(200);

    const stale = await request(app).get("/api/v1/me").set("Authorization", oldHeader);
    expect(stale.status).toBe(401);
    const fresh = await request(app).get("/api/v1/me").set("Authorization", `Bearer ${newLogin.body.token}`);
    expect(fresh.status).toBe(200);

    // The same link can't be used twice
    const again = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "another-password" });
    expect(again.status).toBe(400);
  });

  it("refuses an expired token, an unknown token and a link replaced by a newer one", async () => {
    const { user } = await createTestUser({ email: "exp@test.dev" });

    await request(app).post("/api/v1/auth/forgot-password").send({ email: "exp@test.dev" });
    await flush();
    const first = lastToken()!;
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "exp@test.dev" });
    await flush();
    const second = lastToken()!;

    const replaced = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: first, password: "new-password-1" });
    expect(replaced.status).toBe(400);

    await db.orm.public.PasswordResetTokens.where({ userId: user.userId }).updateAll({
      expiresAt: Temporal.Now.instant().subtract({ minutes: 1 }),
    });
    const expired = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: second, password: "new-password-1" });
    expect(expired.status).toBe(400);

    const unknown = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "made-up", password: "new-password-1" });
    expect(unknown.status).toBe(400);
  });

  it("validates the new password like registration (8 to 72 bytes)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "anything", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.join(" ")).toMatch(/password/);
  });
});
