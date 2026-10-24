import { expect, type Page } from "@playwright/test";

export async function loginAs(page: Page, role: "Learner" | "Instructor" | "Admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  const home = role === "Learner" ? "/my-learning" : role === "Instructor" ? "/instructor" : "/admin";
  await expect(page).toHaveURL(new RegExp(home));
}

export async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem("ieltstudy.token"));
}
