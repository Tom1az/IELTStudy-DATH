import { expect, test } from "@playwright/test";
import { loginAs, logout } from "./helpers";

test("instructor builds a course, admin approves it, learners see it", async ({ page }) => {
  await loginAs(page, "Instructor");
  await page.goto("/instructor/courses/new");
  await page.getByLabel("Course title").fill("Speaking Booster E2E");
  await page.getByLabel("One-line description").fill("Fluency drills for Part 2 and Part 3.");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { name: "Speaking Booster E2E" })).toBeVisible();

  const speaking = page.locator("section", { has: page.getByRole("heading", { name: /^Speaking/ }) });
  await speaking.getByRole("button", { name: "Add lesson" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Linking ideas in Part 3");
  await page.getByRole("button", { name: /Part 3: opinions/ }).click();
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page.getByText("Linking ideas in Part 3")).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.getByRole("tab", { name: /Practice set/ }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question / statement").fill("Which phrase introduces a counter-argument?");
  await page.getByLabel("Option A").fill("Having said that");
  await page.getByLabel("Option B").fill("For example");
  await page.getByLabel("Option 1 is correct").check();
  await page.getByLabel("Explanation shown after submitting").fill("'Having said that' signals the other side.");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Which phrase introduces a counter-argument?" })).toBeVisible();

  await page.getByRole("link", { name: /Speaking Booster E2E/ }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Waiting for admin review")).toBeVisible();

  await logout(page);
  await loginAs(page, "Admin");
  await page.goto("/admin/courses");
  const card = page.locator("article", { hasText: "Speaking Booster E2E" });
  await card.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("Speaking Booster E2E is now published.")).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByText("course.approve").first()).toBeVisible();

  await page.goto("/courses");
  await expect(page.getByText("Speaking Booster E2E")).toBeVisible();
});

test("instructor grades a writing submission", async ({ page }) => {
  await loginAs(page, "Instructor");
  await page.goto("/instructor/grading");
  await page.getByRole("button", { name: "Grade" }).first().click();
  for (const sel of await page.locator("dialog, [role=dialog]").locator("select").all()) await sel.selectOption("6");
  await page.getByLabel("Feedback for the learner").fill("Clear overview and accurate data. Vary your trend verbs next time.");
  await page.getByRole("button", { name: "Submit grade" }).click();
  await expect(page.getByText(/Graded .*They've been notified/)).toBeVisible();
  await page.getByRole("tab", { name: /Graded/ }).click();
  await expect(page.getByText("6.0").first()).toBeVisible();
});

test("admin moderates a reported post and runs the recommender evaluation", async ({ page }) => {
  await loginAs(page, "Admin");
  await page.goto("/admin/reports");
  const report = page.locator("li", { hasText: "Spam or advertising" });
  await report.getByRole("button", { name: "Hide post" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Action taken")).toBeVisible();

  await page.goto("/admin/evaluation");
  await page.getByLabel("Synthetic learners").fill("60");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Results by policy" })).toBeVisible();
  await expect(page.getByText("BKT + content-based (ours)").first()).toBeVisible();
});
