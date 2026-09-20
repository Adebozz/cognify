import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const NOTES_DOCX = path.join(__dirname, "fixtures/photosynthesis-notes.docx");
const NOTES_TXT = path.join(__dirname, "fixtures/notes.txt");

async function uploadNotes(page: Page, file = NOTES_DOCX) {
  await page.locator('input[type="file"]').setInputFiles(file);
}

/** Answer every question in the current phase, choosing option A and a confidence. */
async function answerPhase(page: Page, phase: number, confidence: RegExp = /Confident/) {
  await expect(page.getByText(new RegExp(`^Phase ${phase}:`))).toBeVisible({ timeout: 20_000 });
  for (let q = 1; q <= 5; q++) {
    await expect(page.getByText(`Q${q} / 5`)).toBeVisible();
    await page.locator(".opt").first().click();
    await expect(page.getByText(/✓ Correct!|✗ Not quite/)).toBeVisible();
    await page.getByRole("button", { name: confidence }).click();
    const label = q < 5 ? "Next →" : phase < 3 ? "Next Phase →" : "See Results";
    await page.getByRole("button", { name: label }).click();
  }
}

test.describe("upload screen", () => {
  test("loads with the start button disabled until a file is chosen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Study smarter/ })).toBeVisible();
    const start = page.getByRole("button", { name: /Start Cognify Session/ });
    await expect(start).toBeDisabled();

    await uploadNotes(page);
    await expect(page.getByText("photosynthesis-notes.docx")).toBeVisible();
    await expect(start).toBeEnabled();
  });

  test("rejects unsupported file types with a clear message", async ({ page }) => {
    await page.goto("/");
    await uploadNotes(page, NOTES_TXT);
    await expect(page.getByText(/Please upload a PDF or image file/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Cognify Session/ })).toBeDisabled();
  });

  test("lets the user remove a selected file", async ({ page }) => {
    await page.goto("/");
    await uploadNotes(page);
    await page.getByRole("button", { name: "Remove file" }).click();
    await expect(page.getByText("Drop your study material here")).toBeVisible();
  });

  test("real-AI toggle reveals the optional API key field (masked)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Real AI OFF/ }).click();
    const key = page.getByPlaceholder(/your Anthropic API key/);
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute("type", "password");
  });
});

test.describe("full adaptive session (demo mode)", () => {
  test("completes all three phases and shows results + history", async ({ page }) => {
    test.slow();
    await page.goto("/");
    await uploadNotes(page);
    await page.getByRole("button", { name: /Start Cognify Session/ }).click();

    await answerPhase(page, 1, /Unsure/);
    await answerPhase(page, 2);
    await answerPhase(page, 3);

    await expect(page.locator(".r-score")).toHaveText(/^\d{1,3}%$/);
    await expect(page.getByText(/of 15 correct/)).toBeVisible();
    await expect(page.getByText("Cognify Adaptive Analysis")).toBeVisible();

    // Export produces a JSON download.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export results JSON" }).click();
    expect((await download).suggestedFilename()).toBe("cognify-results.json");

    // History persists across reloads (localStorage).
    await page.reload();
    await expect(page.getByText("Recent sessions")).toBeVisible();
    await expect(page.locator(".sp-label").first()).toHaveText("photosynthesis-notes.docx");
  });

  test("timed mode shows a countdown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Timed mode OFF/ }).click();
    await uploadNotes(page);
    await page.getByRole("button", { name: /Start Cognify Session/ }).click();
    await expect(page.locator(".timer")).toHaveText(/^4\ds$/, { timeout: 20_000 });
  });
});

test.describe("failure handling", () => {
  test("shows the rate-limit message and returns to upload on 429", async ({ page }) => {
    await page.route("**/api/questions", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Daily free AI limit reached (6 generations = 2 full sessions).", code: "rate_limited" }),
      })
    );
    await page.goto("/");
    await page.getByRole("button", { name: /Real AI OFF/ }).click();
    await uploadNotes(page);
    await page.getByRole("button", { name: /Start Cognify Session/ }).click();

    await expect(page.getByText(/Daily free AI limit reached/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Cognify Session/ })).toBeVisible();
  });

  test("handles a server crash that returns HTML instead of JSON", async ({ page }) => {
    await page.route("**/api/questions", (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad Gateway</html>" })
    );
    await page.goto("/");
    await uploadNotes(page);
    await page.getByRole("button", { name: /Start Cognify Session/ }).click();
    await expect(page.getByText(/question generator crashed on the server/)).toBeVisible();
  });

  test("handles a network failure without hanging on the loading screen", async ({ page }) => {
    await page.route("**/api/questions", (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await uploadNotes(page);
    await page.getByRole("button", { name: /Start Cognify Session/ }).click();
    await expect(page.locator(".error-box")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Cognify Session/ })).toBeVisible();
  });

  test("the 'Try sample session' button starts a quiz", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Try sample session" }).click();
    await expect(page.getByText(/^Phase 1:/)).toBeVisible({ timeout: 20_000 });
  });
});
