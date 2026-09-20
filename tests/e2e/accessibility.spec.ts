import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

// Fails the build on serious/critical WCAG 2.1 AA violations.
async function seriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`);
}

test("upload screen has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  expect(await seriousViolations(page)).toEqual([]);
});

test("quiz screen has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/photosynthesis-notes.docx"));
  await page.getByRole("button", { name: /Start Cognify Session/ }).click();
  await page.locator(".opt").first().click();
  expect(await seriousViolations(page)).toEqual([]);
});

test("file input is reachable and labelled for keyboard/screen-reader users", async ({ page }) => {
  await page.goto("/");
  const input = page.locator('input[type="file"]');
  await expect(input).toBeAttached();
  // The <input> sits inside a <label>, which gives it an accessible name.
  await expect(input).toHaveAccessibleName(/Drop your study material here/);
});
