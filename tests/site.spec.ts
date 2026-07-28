import { expect, test } from "@playwright/test";

const siteRoot = process.env.PLAYWRIGHT_SITE_ROOT ?? "/";

test("desktop research flow and symbolic certificate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(siteRoot);

  await expect(page.locator(".hero-intro h1")).toHaveText(
    "Conjecture Frontier",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel("Language")).toHaveValue("en");
  await expect(
    page.locator(".language-switcher select option:checked"),
  ).toHaveText("English");
  await expect(page.locator(".language-switcher svg")).toHaveCount(0);
  await expect(page.locator(".hero-quote")).toContainText("Terence Tao");
  await expect(page.locator(".frontier-news-timeline a")).toHaveCount(16);
  await expect(page.locator(".frontier-news-timeline a").first()).toContainText(
    "Hessian Conjecture",
  );
  await expect(page.getByText("50", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".task-card")).toHaveCount(5);
  await expect(page.locator("#atlas .section-lead h2")).toHaveText(
    "From the conjecture to the first counterexample",
  );
  await expect(page.locator(".shared-context")).toHaveAttribute("open", "");
  await expect(page.locator(".shared-context .katex").first()).toBeVisible();
  await expect(page.locator(".task-card .tier")).toHaveText([
    "Exploration Level",
    "Constrained Level",
    "Research Level",
    "Research Level",
    "Open-Problem Level",
  ]);
  await expect(page.locator(".task-card").nth(2)).toContainText("Research Level");
  await expect(page.locator(".task-card").nth(3)).toContainText("Research Level");
  await expect(page.locator(".task-question .katex").first()).toBeVisible();
  await page
    .locator(".task-card")
    .first()
    .locator("details summary")
    .first()
    .click();
  await expect(
    page.locator(".task-card").first().locator("details").first().locator(".katex"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy LaTeX source" }).first(),
  ).toBeVisible();

  await page.locator("#results").scrollIntoViewIfNeeded();
  await expect(page.getByText("Outcome type statistics", { exact: true })).toBeVisible();
  await expect(page.locator(".outcome-row")).toHaveCount(8);
  await expect(page.locator(".outcome-row").first().locator("small")).not.toHaveCSS(
    "text-overflow",
    "ellipsis",
  );
  await expect(
    page.getByText("Model × problem outcome matrix", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".matrix-row")).toHaveCount(5);
  await expect(page.locator(".matrix-run:not(.empty)")).toHaveCount(50);
  await expect(page.locator(".matrix-model").first()).toContainText(
    "10 records · 5 problems × 2 types × 1 run",
  );
  await page.locator(".trace-filters select").first().selectOption(
    "gemini-3.1-pro-preview-thinking",
  );
  await page
    .locator(".matrix-row")
    .first()
    .locator(".matrix-run:not(.empty)")
    .first()
    .click();
  await expect(page.locator(".trace-filters select").first()).toHaveValue(
    "claude-opus-4-8-thinking",
  );
  await expect(page.locator(".trace-detail h3")).toHaveText(
    "Claude-Opus-4.8-Thinking",
  );
  await expect(page.locator(".trace-item").first()).toBeVisible();
  await page.locator(".trace-filters select").first().selectOption(
    "gemini-3.1-pro-preview-thinking",
  );
  await page.locator(".trace-filters select").nth(2).selectOption("hint");
  await expect(page.locator(".trace-item")).toHaveCount(5);
  await page.locator(".trace-item").first().click();
  await expect(page.locator(".trace-detail h3")).toHaveText(
    "Gemini-3.1-Pro-Preview-Thinking",
  );
  await expect(page.locator(".result-analysis")).toContainText(
    "DETERMINISTIC OUTCOME ATTRIBUTION",
  );
  await expect(page.locator(".official-status")).toContainText("OFFLINE");
  await page.getByRole("button", { name: "Extracted counterexample" }).click();
  await expect(page.locator(".counterexample-view")).toBeVisible();
  await expect(page.locator(".counterexample-formula-card .katex")).toBeVisible();

  await page.locator("#verify").scrollIntoViewIfNeeded();
  await expect(page.locator(".verdict.pass")).toContainText(
    "Counterexample verified",
  );
  await expect(page.locator(".image-table")).toContainText("-0.25");
  await expect(page.locator(".det-value")).toContainText("-2");

  await page.screenshot({
    path: "/tmp/conjecture-frontier-desktop.png",
    fullPage: true,
  });
});

test("mobile navigation and layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(siteRoot);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".main-nav")).toHaveClass(/nav-open/);
  await page.getByRole("link", { name: "Benchmark", exact: true }).click();
  await expect(page.locator("#benchmark")).toBeInViewport();
  await expect(page.locator(".task-card")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/conjecture-frontier-mobile.png",
    fullPage: true,
  });
});

test("language switch keeps English as the default and exposes Chinese", async ({
  page,
}) => {
  await page.goto(siteRoot);
  await expect(page.getByLabel("Language")).toHaveValue("en");
  await page.getByLabel("Language").selectOption("zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("link", { name: "进展" })).toBeVisible();
  await expect(page.getByRole("link", { name: "题目" })).toBeVisible();
  await expect(page.locator(".hero-intro h1")).toHaveText("猜想前沿");
  await expect(page.getByRole("link", { name: /查看五级问题/ })).toBeVisible();
  await expect(page.locator(".message-form select").nth(1)).toContainText(
    "P1 · 开放构造",
  );
  await expect(page.locator(".message-form select").first()).toContainText(
    "新猜想",
  );
});
