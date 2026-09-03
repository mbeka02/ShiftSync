import { expect, test, type Browser, type Page } from "@playwright/test";

const password = "ShiftSyncDemo!2026";

function monday(offsetWeeks = 0) {
  const date = new Date();
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1 + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in to ShiftSync" }).click();
  await expect(page).toHaveURL(/\/schedule/);
}

async function signedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  return { context, page };
}

test.describe.serial("Evaluator scenarios", () => {
  test("Sunday Night Chaos — emergency coverage is explicit and audited", async ({ page }) => {
    await login(page, "manager.east@shiftsync.local");
    const shift = page.locator('[data-skill="Bartender"][data-open-headcount="1"]').first();
    await shift.getByRole("button", { name: /Assign staff/ }).click();
    await expect(page.getByText("Audited emergency coverage")).toBeVisible();
    await page.getByRole("dialog").locator("button", { hasText: "Luis Ortiz" }).first().click();
    await page.getByLabel("Emergency reason").fill("Evaluator scenario: last-minute call-out");
    await page.getByRole("button", { name: "Assign emergency coverage" }).click();
    await expect(page.getByText("Emergency coverage assigned")).toBeVisible();
  });

  test("Overtime Trap — preview and report expose the threshold evidence", async ({ page }) => {
    await login(page, "manager.east@shiftsync.local");
    await page.goto(`/schedule?week=${monday(1)}`);
    const overtimeShift = page.locator('[data-skill="Server"][data-open-headcount="1"]').first();
    await overtimeShift.getByRole("button", { name: /Assign staff/ }).click();
    await page.getByRole("dialog").locator("button", { hasText: "Maria Chen" }).first().click();
    await expect(page.getByText("Weekly hours", { exact: true })).toBeVisible();
    await expect(page.getByText(/overtime/i).first()).toBeVisible();
    await page.goto("/analytics");
    const overtimeReport = page.getByLabel("Weekly threshold sequence");
    await expect(overtimeReport.getByRole("heading", { name: "Weekly threshold sequence" })).toBeVisible();
    await expect(overtimeReport.getByText("Devon Price", { exact: true })).toBeVisible();
    await expect(overtimeReport.getByText("52h total", { exact: true })).toBeVisible();
  });

  test("Timezone Tangle — location context changes the displayed IANA timezone", async ({ page }) => {
    await login(page, "admin@shiftsync.local");
    await page.getByLabel("Active location").locator("select").selectOption({ label: "Pacific Pier" });
    await expect(page.getByText("America/Los_Angeles").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pacific Pier" })).toBeVisible();
  });

  test("Simultaneous Assignment — two managers cannot take the same final slot", async ({ browser }) => {
    test.setTimeout(180_000);
    const manager = await signedInPage(browser, "manager.east@shiftsync.local");
    const admin = await signedInPage(browser, "admin@shiftsync.local");
    try {
      const pages = [manager.page, admin.page];
      const href = `/schedule?week=${monday(1)}`;
      await Promise.all(pages.map((page) => page.goto(href)));

      const candidates = ["Omar Hassan", "Priya Shah"];
      const assignButtons = [];
      for (const [index, page] of pages.entries()) {
        await page.locator('[data-skill="Host"][data-open-headcount="1"]').first().getByRole("button", { name: /Assign staff/ }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: new RegExp(`^${candidates[index]} Eligible`) }).click();
        const assignButton = dialog.getByRole("button", { name: `Assign ${candidates[index]}` });
        await expect(assignButton).toBeEnabled();
        assignButtons.push(assignButton);
      }

      const outcomePromises = pages.map(async (page) => {
        const success = page.getByText("Staff assigned", { exact: true });
        const conflict = page.getByText("Assignment not saved", { exact: true });
        return Promise.race([
          success.waitFor().then(() => "success" as const),
          conflict.waitFor().then(() => "conflict" as const),
        ]);
      });
      await Promise.all(assignButtons.map((button) => button.click()));

      const outcomes = await Promise.all(outcomePromises);
      expect(outcomes.sort()).toEqual(["conflict", "success"]);
    } finally {
      await Promise.all([manager.context.close(), admin.context.close()]);
    }
  });

  test("Fairness Complaint — expected and actual premium allocation is inspectable", async ({ page }) => {
    await login(page, "manager.east@shiftsync.local");
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Expected versus actual premium allocation" })).toBeVisible();
    await expect(page.getByText("Opportunity-normalized evidence")).toBeVisible();
    await expect(page.getByRole("button", { name: /Inspect .* premium shifts/ }).first()).toBeVisible();
  });

  test("Coverage lifecycle and Regret Swap preserve the original assignment until approval", async ({ browser }) => {
    const jordan = await signedInPage(browser, "coverage@shiftsync.local");
    await jordan.page.goto(`/schedule?week=${monday(1)}`);
    const mariaDrop = jordan.page.locator("article", { hasText: "Maria Chen is looking for coverage" });
    await mariaDrop.getByRole("button", { name: "Claim shift" }).click();
    await expect(jordan.page.getByText("Shift claimed")).toBeVisible();

    const manager = await signedInPage(browser, "manager.east@shiftsync.local");
    await manager.page.goto(`/schedule?week=${monday(1)}`);
    const readyDrop = manager.page.locator("article", { hasText: "Maria Chen → Jordan Lee" });
    await readyDrop.getByRole("button", { name: "Approve transfer" }).click();
    await manager.page.getByRole("dialog").getByRole("button", { name: "Approve transfer" }).click();
    await expect(manager.page.getByText("Coverage approved")).toBeVisible();

    const casey = await signedInPage(browser, "casey@shiftsync.local");
    await casey.page.goto(`/schedule?week=${monday(1)}`);
    await casey.page.getByRole("button", { name: "Cancel request" }).click();
    await casey.page.getByRole("dialog").getByRole("button", { name: "Cancel request" }).click();
    await expect(casey.page.getByText("Coverage request cancelled")).toBeVisible();
    await Promise.all([jordan.context.close(), manager.context.close(), casey.context.close()]);
  });
});
