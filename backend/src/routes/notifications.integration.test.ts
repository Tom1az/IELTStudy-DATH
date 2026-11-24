import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import { notify } from "../services/notifications.ts";
import { authHeader, createTestUser, resetDb } from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

const send = (userId: number, title: string) =>
  notify(db.orm.public, userId, { type: "course.approved", title, link: "/instructor/courses/1" });

describe("GET /api/v1/me/notifications", () => {
  it("lists my notifications newest first, with the unread count and page meta", async () => {
    const { user } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser();
    await send(user.userId, "First");
    await send(user.userId, "Second");
    await send(other.userId, "Not mine");

    const res = await request(app)
      .get("/api/v1/me/notifications")
      .set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(200);
    expect(res.body.notifications.map((n: { title: string }) => n.title)).toEqual(["Second", "First"]);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body).toMatchObject({ page: 1, total: 2, totalPages: 1 });
    expect(Object.keys(res.body.notifications[0]).sort()).toEqual(
      ["body", "createdAt", "link", "notificationId", "readAt", "title", "type"].sort(),
    );
  });

  it("marks one as read (only my own), and `unread=true` leaves it out", async () => {
    const { user } = await createTestUser();
    const { user: other } = await createTestUser();
    await send(user.userId, "A");
    await send(user.userId, "B");
    const header = authHeader(user.userId);
    const list = await request(app).get("/api/v1/me/notifications").set("Authorization", header);
    const [b, a] = list.body.notifications;

    const stranger = await request(app)
      .patch(`/api/v1/me/notifications/${a.notificationId}/read`)
      .set("Authorization", authHeader(other.userId));
    expect(stranger.status).toBe(404);

    const marked = await request(app)
      .patch(`/api/v1/me/notifications/${a.notificationId}/read`)
      .set("Authorization", header);
    expect(marked.status).toBe(200);
    expect(marked.body.notification.readAt).not.toBeNull();

    // Marking again keeps the first readAt
    const again = await request(app)
      .patch(`/api/v1/me/notifications/${a.notificationId}/read`)
      .set("Authorization", header);
    expect(again.body.notification.readAt).toBe(marked.body.notification.readAt);

    const unread = await request(app)
      .get("/api/v1/me/notifications?unread=true")
      .set("Authorization", header);
    expect(unread.body.notifications.map((n: { notificationId: number }) => n.notificationId)).toEqual([
      b.notificationId,
    ]);
    expect(unread.body.unreadCount).toBe(1);
  });

  it("marks all as read", async () => {
    const { user } = await createTestUser({ role: "admin" });
    await send(user.userId, "A");
    await send(user.userId, "B");
    const header = authHeader(user.userId);

    const res = await request(app).post("/api/v1/me/notifications/read-all").set("Authorization", header);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const list = await request(app).get("/api/v1/me/notifications").set("Authorization", header);
    expect(list.body.unreadCount).toBe(0);
  });

  it("needs a token", async () => {
    const res = await request(app).get("/api/v1/me/notifications");
    expect(res.status).toBe(401);
  });
});
