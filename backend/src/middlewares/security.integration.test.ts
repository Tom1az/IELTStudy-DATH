import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../app.ts";

describe("security middleware", () => {
  it("sets helmet's headers and hides X-Powered-By", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("refuses CORS for an origin that isn't listed", async () => {
    const res = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  describe("rate limit on login", () => {
    beforeAll(() => {
      process.env.RATE_LIMIT_IN_TESTS = "1";
    });
    afterAll(() => {
      delete process.env.RATE_LIMIT_IN_TESTS;
    });

    it("answers 429 after 10 attempts from one address", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await request(app)
          .post("/api/v1/auth/login")
          .set("X-Forwarded-For", "203.0.113.7")
          .send({ email: "nobody@test.dev" });
        statuses.push(res.status);
      }
      // Invalid bodies still count: the limiter runs before validation
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });
});
