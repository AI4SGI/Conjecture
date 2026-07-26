import { expect, test } from "@playwright/test";

test("desktop research flow and symbolic certificate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /局部可逆/ }),
  ).toBeVisible();
  await expect(page.getByText("50", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".task-card")).toHaveCount(5);

  await page.locator("#results").scrollIntoViewIfNeeded();
  await expect(page.getByText("结果类型剖面", { exact: true })).toBeVisible();
  await expect(page.locator(".outcome-row")).toHaveCount(8);
  await expect(page.getByText("模型 × 任务结果矩阵", { exact: true })).toBeVisible();
  await expect(page.locator(".matrix-row")).toHaveCount(5);
  await expect(page.locator(".matrix-run:not(.empty)")).toHaveCount(50);
  await page.locator(".matrix-run.pass").click();
  await expect(page.locator(".trace-detail h3")).toContainText("Gemini");
  await expect(page.locator(".trace-item").first()).toBeVisible();
  await page.locator(".filter-bar select").first().selectOption(
    "gemini-3.1-pro-preview-thinking",
  );
  await page.locator(".filter-bar select").nth(1).selectOption("hint");
  await expect(page.locator(".trace-item")).toHaveCount(5);
  await page.locator(".trace-item").first().click();
  await expect(page.locator(".trace-detail h3")).toContainText("Gemini");
  await expect(page.locator(".result-analysis")).toContainText("确定性结果归因");

  await page.locator("#verify").scrollIntoViewIfNeeded();
  await expect(page.locator(".verdict.pass")).toContainText("证书成立");
  await expect(page.locator(".image-table")).toContainText("-0.25");
  await expect(page.locator(".det-value")).toContainText("-2");

  await page.screenshot({
    path: "/tmp/jacobian-frontier-desktop.png",
    fullPage: true,
  });
});

test("mobile navigation and layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.locator(".main-nav")).toHaveClass(/nav-open/);
  await page.getByRole("link", { name: "任务", exact: true }).click();
  await expect(page.locator("#benchmark")).toBeInViewport();
  await expect(page.locator(".task-card")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/jacobian-frontier-mobile.png",
    fullPage: true,
  });
});
