import { expect, test } from "@playwright/test";

test("mobile: navigation menu and catalog work at phone width", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Courses" }).click();
  await expect(page.getByRole("heading", { name: /Pick a level/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
