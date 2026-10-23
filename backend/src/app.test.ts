import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "./app.ts";

describe("app", () => {
  it("GET / reports the server is up", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Server is OK!");
  });

  it("serves Swagger UI at /api-docs", async () => {
    const res = await request(app).get("/api-docs/");

    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Not Found");
  });

  it("rejects a non-numeric user id before touching the DB", async () => {
    const res = await request(app).get("/api/v1/users/abc");

    expect(res.status).toBe(400);
  });
});
