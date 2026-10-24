import { expect, test } from "@playwright/test";

test("register → placement quiz → recommended level", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Learner");
  await page.getByLabel("Email").fill(`test${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible(); // validation
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/placement/);
  await page.getByRole("button", { name: "Start the quiz" }).click();
  await expect(page.getByText("0 of 30 answered")).toBeVisible();
  await page.getByLabel("Answer for question 1").fill("algae");
  await page.getByLabel("Answer for question 2").fill("sunlight");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("heading", { name: /Estimated Band/ })).toBeVisible();
  await expect(page.getByText("We recommend")).toBeVisible();
});

test("forgot and reset password", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("learner@ieltstudy.dev");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByRole("link", { name: "Open the reset link" }).click();
  await page.getByLabel("New password", { exact: true }).fill("NewPassw0rd");
  await page.getByLabel("Confirm new password").fill("NewPassw0rd");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@ieltstudy.dev");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByLabel("Password").fill("NewPassw0rd");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/my-learning/);
});

test("role-based access: a learner cannot open admin or studio pages", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Learner/ }).click();
  await expect(page).toHaveURL(/my-learning/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/my-learning/);
  await page.goto("/instructor");
  await expect(page).toHaveURL(/my-learning/);
});
