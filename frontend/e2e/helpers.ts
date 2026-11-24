import { expect, type Page } from "@playwright/test";

/**
 * These tests run against the real backend and Advanced service (start both first: `npm run dev`
 * in `../backend` and `../advanced`) with the seed data loaded. Learners are created fresh through the sign-up page.
 * Instructor and admin tests log in with the seed accounts, so they need the backend's
 * SEED_PASSWORD in the environment; without it they are skipped.
 */
export const SEED_PASSWORD = process.env.SEED_PASSWORD;

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

/** Signs up a new learner through the UI. The app then opens the placement quiz. */
export async function registerLearner(page: Page, name = "Test Learner") {
  const email = uniqueEmail("e2e");
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/placement/);
  return email;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

/** Logs in and waits until the app has left the login page (the token is stored by then). */
export async function loginAs(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem("ieltstudy.token"));
}
