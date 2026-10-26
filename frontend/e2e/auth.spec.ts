import { expect, test } from "@playwright/test";
import { login, registerLearner, uniqueEmail } from "./helpers";

test("sign-up shows the backend's validation errors, then lands on the placement quiz", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Learner");
  await page.getByLabel("Email").fill(uniqueEmail("e2e"));
  await page.getByLabel("Password").fill("short");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/at least 8 characters/)).toBeVisible();
  await page.getByLabel("Password").fill("e2e-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/placement/);
});

test("placement quiz: start, answer, submit, then review (it can't be retaken)", async ({ page }) => {
  await registerLearner(page);
  await page.getByRole("button", { name: "Start the quiz" }).click();
  await expect(page.getByText("0 of 30 answered")).toBeVisible();
  await page.getByLabel("Answer for question 1").fill("Hartley");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();

  await expect(page).toHaveURL(/\/practice\/result\//);
  await expect(page.getByRole("heading", { name: /You scored \d+ \/ 30/ })).toBeVisible();
  await expect(page.getByText("Placement quiz", { exact: false }).first()).toBeVisible();

  await page.goto("/placement");
  await expect(page.getByText("You've already taken the placement quiz")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the quiz" })).toHaveCount(0);
});

test("a wrong password shows the backend's message", async ({ page }) => {
  await login(page, uniqueEmail("nobody"), "wrong-password-1");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("role-based access: a learner cannot open admin or studio pages", async ({ page }) => {
  await registerLearner(page);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/my-learning/);
  await page.goto("/instructor");
  await expect(page).toHaveURL(/my-learning/);
});

test("logged-out visitors are asked to log in to see the catalog", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByText("Log in to see the courses")).toBeVisible();
});
