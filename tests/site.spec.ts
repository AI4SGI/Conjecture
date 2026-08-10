import { expect, test } from "@playwright/test";
import frontierNews from "../src/data/frontier-news.json";

const siteRoot = process.env.PLAYWRIGHT_SITE_ROOT ?? "/";

test("three conjectures share one data-driven research interface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(siteRoot);

  await expect(page.locator(".hero-intro h1")).toHaveText("Open problems, finite certificates");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".conjecture-selector button")).toHaveCount(3);
  await expect(page.locator(".conjecture-selector button").nth(0)).toContainText("Proposed in 1939");
  await expect(page.locator(".conjecture-selector button").nth(1)).toContainText("Proposed in 1993");
  await expect(page.locator(".conjecture-selector button").nth(2)).toContainText("Open since antiquity");
  await expect(page.locator(".frontier-news-timeline a")).toHaveCount(frontierNews.length);
  await expect(page.locator(".frontier-news-timeline")).toContainText("all ten research-level proof problems");

  await expect(page.locator(".hero-case-copy h2")).toHaveText("Jacobian Conjecture");
  await expect(page.locator(".task-card")).toHaveCount(5);
  await expect(page.locator(".results-section")).toHaveCSS("background-color", "rgb(21, 24, 23)");
  await expect(page.locator(".benchmark-matrix .matrix-row")).toHaveCount(5);
  await expect(page.locator(".benchmark-matrix .matrix-run:not(.empty)")).toHaveCount(50);
  expect(await page.locator(".outcome-grid .outcome-row").count()).toBeGreaterThan(0);
  await expect(page.locator(".model-table.detailed .model-row")).toHaveCount(6);
  await expect(page.locator(".trace-filters label")).toHaveCount(4);
  await expect(page.locator(".trace-filters")).toContainText("Model");
  await expect(page.locator(".trace-filters")).toContainText("Problem");
  await expect(page.locator(".trace-filters")).toContainText("Hint");
  await expect(page.locator(".trace-filters")).toContainText("Run");
  await page.locator(".matrix-run.pass").first().click();
  await expect(page.locator(".trace-detail-head")).toContainText("temperature");
  await expect(page.locator(".trace-detail-head")).toContainText("top_p");
  await expect(page.locator(".trace-detail-head")).toContainText("max_tokens");
  await expect(page.locator(".record-mini-metrics")).toContainText("Inference");
  await expect(page.locator(".record-mini-metrics")).toContainText("Verification");
  await expect(page.locator(".trace-tabs button")).toHaveCount(5);
  await page.getByRole("button", { name: "Extracted output" }).click();
  await expect(page.locator(".output-section-heading").first()).toContainText("VISUALIZED OUTPUT");
  await expect(page.locator(".counterexample-formula-card")).toContainText("RECONSTRUCTED MAP");
  await expect(page.locator(".output-section-heading.original")).toContainText("ORIGINAL OUTPUT FORMAT");
  await page.locator("#results").getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator("#results").getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect(page.locator("#interactive-verifier")).toBeVisible();
  await expect(page.locator(".data-provenance")).not.toContainText("/mnt/");

  await page.locator(".conjecture-selector button").nth(1).click();
  await expect(page.locator(".hero-case-copy h2")).toHaveText("Beal Conjecture");
  await expect(page).toHaveURL(/conjecture=beal-conjecture/);
  await expect(page.locator(".task-card")).toHaveCount(2);
  await expect(page.locator(".results-section .filter-bar label")).toHaveCount(2);
  await expect(page.locator(".trace-filters label")).toHaveCount(3);
  await expect(page.locator(".benchmark-matrix .matrix-row")).toHaveCount(1);
  await expect(page.locator(".benchmark-matrix .matrix-run:not(.empty)")).toHaveCount(1);
  await expect(page.locator(".lab-task-tabs button")).toHaveCount(2);
  await expect(page.locator(".verifier-source-link")).toContainText("eval/eval_number_theory_001_beal_conjecture.py");
  await expect(page.locator("#interactive-verifier")).toHaveCount(0);
  await page.locator(".trace-item").first().click();
  await expect(page.locator(".trace-detail h3")).toHaveText("GPT-5.2");
  await page.getByRole("button", { name: "Extracted output" }).click();
  await expect(page.locator(".arithmetic-stat-grid")).toContainText("432");
  await page.getByRole("button", { name: "Evaluation details" }).click();
  await expect(page.locator(".evaluation-conditions")).toContainText("absolute difference=432");

  await page.locator(".conjecture-selector button").nth(2).click();
  await expect(page.locator(".hero-case-copy h2")).toHaveText("Odd Perfect Number Problem");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Extracted output" }).click();
  await expect(page.locator(".counterexample-point-card")).toContainText("DIVISOR-SUM CHECK");
  await expect(page.locator(".arithmetic-stat-grid")).toContainText("426027470778");
  await expect(page.locator(".lab-task-tabs")).toHaveCount(0);
  await expect(page.locator(".condition-trace")).toContainText("sigma(N)=426027470778");
  await expect(page.locator(".verifier-source-link")).toContainText("eval/eval_number_theory_002_odd_perfect_number.py");

  await page.screenshot({ path: "/tmp/opbench-three-conjectures.png", fullPage: true });
});

test("mobile navigation and selector remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(siteRoot);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".main-nav")).toHaveClass(/nav-open/);
  await page.getByRole("link", { name: "Benchmark", exact: true }).click();
  await expect(page.locator("#benchmark")).toBeInViewport();
  await page.locator(".conjecture-selector button").nth(1).click();
  await expect(page.locator(".task-card")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "/tmp/opbench-mobile.png", fullPage: true });
});

test("language switch localizes dynamic conjecture content", async ({ page }) => {
  await page.goto(siteRoot);
  await page.getByLabel("Language").selectOption("zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator(".hero-intro h1")).toHaveText("开放问题，有限证书");
  await page.locator(".conjecture-selector button").nth(2).click();
  await expect(page.locator(".hero-case-copy h2")).toHaveText("奇完全数问题");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(page.locator("#verify .section-lead h2")).toHaveText("素数幂证书与精确约数和");
});
