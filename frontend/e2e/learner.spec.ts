import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("dashboard reproduces the seeded learner state and BKT recommendations", async ({ page }) => {
  await loginAs(page, "Learner");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("38% of course")).toBeVisible();
  await expect(page.getByText("Overall 5.5")).toBeVisible();
  const upNext = page.locator("section", { has: page.getByRole("heading", { name: "Up next" }) });
  await expect(upNext.getByText("True / False / Not Given", { exact: true })).toBeVisible();
  await expect(upNext.getByText("Practice set 2.3", { exact: true })).toBeVisible();
  await expect(upNext.getByText("Describing line graphs", { exact: true })).toBeVisible();
  await expect(upNext.getByText(/below 0\.65/).first()).toBeVisible();
});

test("main flow: lesson → mark complete → resume practice set → submit → review", async ({ page }) => {
  await loginAs(page, "Learner");
  await page.getByRole("link", { name: "Resume lesson" }).click();
  await expect(page.getByRole("heading", { name: "True / False / Not Given", level: 1 })).toBeVisible();
  await expect(page.getByText("12 of 32 lessons complete")).toBeVisible();

  // play the lesson video and check captions appear
  await page.getByRole("button", { name: /Play video|Resume video/ }).click();
  await expect(page.getByText(/Hello and welcome/)).toBeVisible();

  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByText("13 of 32 lessons complete")).toBeVisible();

  await page.getByRole("link", { name: "Start practice set →" }).click();
  await expect(page.getByText("4 of 6 answered")).toBeVisible(); // resumed attempt
  await page.getByRole("radiogroup").nth(3).getByRole("radio", { name: "NOT GIVEN" }).click();
  await page.getByLabel("Answer for question 6").fill("warmer");
  await expect(page.getByText("6 of 6 answered")).toBeVisible();
  await page.getByRole("button", { name: "Submit answers" }).click();

  await expect(page).toHaveURL(/\/practice\/result\//);
  await expect(page.getByRole("heading", { name: "You scored 5 / 6" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How your skills changed" })).toBeVisible();
  await expect(page.getByText("True / False / Not Given").first()).toBeVisible();
  await expect(page.getByText("Paragraph A says councils").first()).toBeVisible(); // explanation for the wrong answer
});

test("low score creates a remediation gate before the next lesson", async ({ page }) => {
  await loginAs(page, "Learner");
  await page.goto("/learn/intermediate/int-r3");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByText("13 of 32 lessons complete")).toBeVisible();
  await page.goto("/practice/ps-int-r3");
  const groups = page.getByRole("radiogroup");
  await groups.nth(0).getByRole("radio", { name: "TRUE" }).click();
  await groups.nth(1).getByRole("radio", { name: "TRUE" }).click();
  await groups.nth(2).getByRole("radio", { name: "FALSE" }).click();
  await groups.nth(3).getByRole("radio", { name: "TRUE" }).click();
  await groups.nth(4).getByRole("radio").first().click();
  await page.getByLabel("Answer for question 6").fill("colder");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "You scored 0 / 6" })).toBeVisible();
  await expect(page.getByText(/Review before “Matching headings”/)).toBeVisible();
  await expect(page.getByText("Targeted next steps")).toBeVisible();

  await page.goto("/learn/intermediate/int-r4");
  await expect(page.getByText("Review recommended before this lesson")).toBeVisible();
  await page.getByRole("button", { name: "Continue anyway" }).click();
  await expect(page.getByText("Review recommended before this lesson")).toBeHidden();
});

test("catalogue search, filter and pagination", async ({ page }) => {
  await page.goto("/courses");
  await page.getByRole("searchbox").fill("headings");
  await expect(page.getByText(/lessons? match “headings”/)).toBeVisible();
  await expect(page.getByText("Matching headings").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Speaking", exact: true }).click();
  await expect(page.getByText(/22 lessons in Speaking/)).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
});

test("discussion: post a question and report a post", async ({ page }) => {
  await loginAs(page, "Learner");
  await page.goto("/learn/intermediate/int-r3?tab=discussion");
  await expect(page.getByRole("tab", { name: "Discussion (3)" })).toBeVisible();
  await page.getByLabel("Ask a question or share a tip").fill("Is NOT GIVEN ever the answer to the first question?");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Is NOT GIVEN ever the answer to the first question?")).toBeVisible();
  await page.getByRole("button", { name: "Report" }).first().click();
  await page.getByLabel("Off-topic").check();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("a moderator will review this")).toBeVisible();
});
