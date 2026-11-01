import { expect, test } from "@playwright/test";
import { SEED_PASSWORD, loginAs, logout, registerLearner } from "./helpers";

// Needs the seed instructor and admin accounts (see helpers.ts)
test.skip(!SEED_PASSWORD, "Set SEED_PASSWORD (from backend/.env) to run the instructor and admin tests");

test("review flow: instructor builds and submits a course, admin approves, learner sees it", async ({ page }) => {
  const title = `E2E course ${Date.now()}`;

  // Instructor: course, lesson with a skill tag, and a first question (which creates the quiz)
  await loginAs(page, "instructor@ieltstudy.dev", SEED_PASSWORD!);
  await expect(page).toHaveURL(/\/instructor/);
  await page.goto("/instructor/courses/new");
  await page.getByLabel("Course title").fill(title);
  await page.getByLabel("Description").fill("Made by the end-to-end tests.");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Add lesson" }).click();
  await page.getByLabel("Title").fill("Skimming basics");
  await page.getByRole("button", { name: "Form and note completion" }).click();
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page.getByText("Skimming basics")).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.getByRole("button", { name: "Add the first question" }).click();
  await page.getByLabel("Question or statement").fill("Which word means 'quickly read'?");
  for (const [letter, text] of [["A", "skim"], ["B", "scan"], ["C", "study"], ["D", "skip"]]) {
    await page.getByLabel(`Options ${letter}`).fill(text);
  }
  await page.getByLabel("Correct option").selectOption({ label: "A. skim" });
  await page.getByLabel("Add a skill tag").selectOption({ label: "Form and note completion" });
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("Which word means 'quickly read'?")).toBeVisible();

  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("This course is waiting for review")).toBeVisible();

  // Admin approves it
  await logout(page);
  await loginAs(page, "admin@ieltstudy.dev", SEED_PASSWORD!);
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/courses");
  const card = page.locator("article", { hasText: title });
  await card.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(card).toHaveCount(0);

  // A learner finds it in the catalog
  await logout(page);
  await registerLearner(page);
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("admin promotes a new account to instructor", async ({ page }) => {
  const email = await registerLearner(page, "Future Instructor");
  await logout(page);
  await loginAs(page, "admin@ieltstudy.dev", SEED_PASSWORD!);
  await page.goto("/admin/users");
  await page.getByPlaceholder("Search name or email").fill(email);
  // Earlier runs leave accounts with the same name, so pick the row by this run's unique email
  await page.getByRole("row", { name: new RegExp(email) }).getByLabel("Role for Future Instructor").selectOption("instructor");
  await expect(page.getByText("Future Instructor is now an instructor.")).toBeVisible();
});
