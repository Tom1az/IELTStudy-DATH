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

  it("returns validation errors in the contract's error shape", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details).toEqual(['"email" is required', '"password" is required']);
  });

  it("no longer serves the old open /users routes", async () => {
    const res = await request(app).get("/api/v1/users");

    expect(res.status).toBe(404);
  });
});
