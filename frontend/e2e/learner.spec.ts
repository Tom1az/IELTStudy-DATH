import { expect, test } from "@playwright/test";
import { registerLearner } from "./helpers";

test("main flow: enroll → lesson → mark complete → quiz → review → dashboard and history", async ({ page }) => {
  await registerLearner(page);

  // The seed's beginner course is listed first (lowest level)
  await page.goto("/courses");
  await page.getByRole("button", { name: "Enroll" }).first().click();
  await expect(page).toHaveURL(/\/learn\/\d+\/\d+/);
  await expect(page.getByText("0 of 3 lessons complete")).toBeVisible();

  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByText("1 of 3 lessons complete")).toBeVisible();
  await expect(page.getByText("Lesson complete")).toBeVisible();

  await page.getByRole("link", { name: "Start quiz →" }).click();
  await expect(page.getByText(/0 of \d+ answered/)).toBeVisible();
  await page.getByLabel("Answer for question 1").fill("Hartley");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();

  await expect(page).toHaveURL(/\/practice\/result\//);
  await expect(page.getByRole("heading", { name: /You scored \d+ \/ \d+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Answer review" })).toBeVisible();
  // BKT is Phase 3: until then the review says so instead of showing skill changes
  await expect(page.getByText("Skill tracking is not available yet")).toBeVisible();

  await page.goto("/my-learning");
  await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
  await expect(page.getByText("33% of course")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent quiz results" })).toBeVisible();
  await expect(page.getByText("Recommendations are not available yet.")).toBeVisible();

  await page.goto("/my-learning/history");
  await expect(page.getByRole("link", { name: "Review" }).first()).toBeVisible();
});

test("a resumed quiz restores the answers saved in this browser", async ({ page }) => {
  await registerLearner(page);
  await page.goto("/courses");
  await page.getByRole("button", { name: "Enroll" }).first().click();
  await page.getByRole("link", { name: "Start quiz →" }).click();
  await page.getByLabel("Answer for question 1").fill("Hartley");
  // The player has the same button in its header and its footer; use the footer one
  await page.getByRole("button", { name: "Save and exit" }).last().click();
  await expect(page).toHaveURL(/\/learn\//);

  await page.getByRole("link", { name: "Start quiz →" }).click();
  await expect(page.getByLabel("Answer for question 1")).toHaveValue("Hartley");
});
