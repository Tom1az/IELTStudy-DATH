import { expect, test } from "@playwright/test";
import { SEED_PASSWORD, loginAs, registerLearner } from "./helpers";

// The backlog features: password reset request, lesson discussion, notifications, the admin's
// completion stats and moderation queue, and the instructor's grading pages.

test("forgot password always gives the same answer", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByRole("button", { name: /send|reset/i }).click();
  await expect(page.getByText(/has an account, a reset link is on its way/i)).toBeVisible();
});

test("a learner comments on a lesson and sees an empty inbox", async ({ page }) => {
  await registerLearner(page, "Discussion Learner");
  await page.goto("/courses");
  await page.getByRole("button", { name: "Enroll" }).first().click();
  await page.getByRole("link", { name: "Start quiz →" }).waitFor();
  // The first lesson of the course: the discussion sits under its content
  await expect(page.getByRole("heading", { name: /Discussion/ })).toBeVisible();
  const text = `Is the first answer B? ${Date.now()}`;
  await page.getByPlaceholder("Write a comment").fill(text);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(text)).toBeVisible();
  // My own comment can be edited, not reported
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("No notifications yet")).toBeVisible();
});

test.describe("staff pages", () => {
  test.skip(!SEED_PASSWORD, "needs SEED_PASSWORD for the seed accounts");

  test("the admin sees completion stats, the moderation queue and the audit log", async ({ page }) => {
    await loginAs(page, "admin@ieltstudy.dev", SEED_PASSWORD!);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Course completion" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learning results" })).toBeVisible();
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "Content reports" })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /audit/i })).toBeVisible();
    await expect(page.getByLabel(/Notifications/)).toBeVisible();
  });

  test("the instructor opens grading and the learner list", async ({ page }) => {
    await loginAs(page, "instructor@ieltstudy.dev", SEED_PASSWORD!);
    await page.goto("/instructor/grading");
    await expect(page.getByText(/not available/i)).toHaveCount(0);
    await page.goto("/instructor/learners");
    await expect(page.getByText(/not available/i)).toHaveCount(0);
  });
});
