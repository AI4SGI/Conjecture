import { expect, test } from "@playwright/test";
import frontierNews from "../src/data/frontier-news.json";

const siteRoot = process.env.PLAYWRIGHT_SITE_ROOT ?? "/";

test("three conjectures share one data-driven research interface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(siteRoot);

  await expect(page.locator(".hero-intro h1")).toHaveText("Open problems, finite certificates");
  await expect(page.locator(".github-cta b")).toHaveText("1");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".conjecture-selector button")).toHaveCount(3);
  await expect(page.locator(".conjecture-selector button").nth(0)).toContainText("Proposed in 1939");
  await expect(page.locator(".conjecture-selector button").nth(1)).toContainText("Proposed in 1993");
  await expect(page.locator(".conjecture-selector button").nth(2)).toContainText("Open since antiquity");
  await expect(page.locator(".frontier-news-timeline a")).toHaveCount(frontierNews.length);
  await expect(page.locator(".frontier-news-timeline")).toContainText("all ten research-level proof problems");

  await expect(page.locator(".hero-case-copy h2")).toHaveText("Jacobian Conjecture");
  await expect(page.locator(".community-review-pipeline > div")).toHaveCount(5);
  await expect(page.locator(".community-review-pipeline")).toContainText("Strong-model review");
  await expect(page.locator(".community-review-pipeline")).toContainText("Human decision");
  await expect(page.locator("#atlas .section-lead h2")).toHaveText("From the conjecture to the first counterexample");
  await expect(page.locator(".jacobian-frontier-card")).toContainText("The first known 3D construction");
  await expect(page.locator(".jacobian-frontier-card")).toContainText("LOCAL CERTIFICATE");
  await expect(page.locator(".jacobian-frontier-card")).toContainText("GLOBAL CERTIFICATE");
  const atlasColumns = await page.locator(".data-atlas-grid > *").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
  expect(Math.abs(atlasColumns[0] - atlasColumns[1])).toBeLessThan(2);
  await expect(page.locator(".data-atlas-grid .timeline-panel")).toHaveCSS("background-color", "rgb(233, 229, 218)");
  await expect(page.locator(".atlas-side-card")).toHaveCSS("background-color", "rgb(21, 24, 23)");
  await expect(page.locator(".task-card")).toHaveCount(5);
  await expect(page.locator(".task-actions button")).toHaveCount(5);
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
  await expect(page.locator("#verify .section-lead h2")).toHaveText(
    "Test a candidate counterexample interactively",
  );
  await expect(page.locator('#verify [data-verifier="jacobian"]')).toBeVisible();
  await expect(page.locator("#verify")).toContainText("3-variable polynomial verifier");
  await expect(page.locator("#verify .interactive-scope")).toContainText("NO LLM JUDGE");
  await expect(page.locator("#verify .interactive-scope")).toContainText("NO NOVELTY JUDGMENT");
  await expect(page.locator("#interactive-verifier")).toHaveCount(0);
  await expect(page.locator(".symbolic-contract-grid")).toHaveCount(0);
  await expect(page.locator(".lab-task-tabs")).toHaveCount(0);
  await expect(page.getByText("Machine-readable output contract")).toHaveCount(0);
  await expect(page.getByText(/04B \/ INTERACTIVE VERIFIER/)).toHaveCount(0);
  await expect(page.locator(".data-provenance")).not.toContainText("/mnt/");

  await page.locator(".conjecture-selector button").nth(1).click();
  await expect(page.locator(".hero-case-copy h2")).toHaveText("Beal Conjecture");
  await expect(page).toHaveURL(/conjecture=beal-conjecture/);
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(page.locator("#benchmark")).not.toContainText("Residual Minimization");
  await expect(page.locator("#results")).not.toContainText("optimization target");
  await expect(page.locator(".atlas-side-card")).toContainText("The coprime perfect-power frontier");
  await expect(page.locator(".atlas-frontier-facts")).toContainText("FINITE VERDICT");
  await expect(page.locator(".results-section .filter-bar label")).toHaveCount(2);
  await expect(page.locator(".trace-filters label")).toHaveCount(3);
  await expect(page.locator(".benchmark-matrix .matrix-row")).toHaveCount(1);
  await expect(page.locator(".benchmark-matrix .matrix-run:not(.empty)")).toHaveCount(1);
  await expect(page.locator("#verify .section-lead h2")).toHaveText(
    "Test a candidate solution interactively",
  );
  await expect(page.locator('#verify [data-verifier="beal"]')).toBeVisible();
  await expect(page.locator('#verify [data-verifier="beal"] input')).toHaveCount(6);
  await expect(page.locator(".task-actions button")).toHaveCount(1);
  await expect(page.locator("#verify .interactive-scope a")).toHaveAttribute(
    "href",
    /eval_number_theory_001_beal_conjecture\.py/,
  );
  await expect(page.locator("#references .reference-item")).toHaveCount(5);
  await expect(page.locator("#references")).toContainText("The Beal Conjecture");
  await expect(page.locator("#references")).not.toContainText("This list is maintained");
  await expect(page.locator("#global-reach .traffic-map-panel svg")).toBeVisible();
  await expect(page.locator("#global-reach")).toContainText("cumulative visits");
  await expect(page.locator('#global-reach [data-country="CN"]')).toHaveCount(1);
  await expect(page.locator('#global-reach [data-country="TW"]')).toHaveCount(0);

  const relatedConjecture = page.getByLabel("Related conjecture");
  const relatedTask = page.getByLabel("Related task");
  await expect(relatedConjecture.locator("option")).toHaveCount(4);
  await expect(relatedConjecture.locator("option").first()).toHaveText("New Conjecture or Problem");
  await expect(relatedTask.locator("option")).toHaveCount(2);
  await relatedConjecture.selectOption("new");
  await expect(relatedTask.locator("option")).toHaveCount(1);
  await relatedConjecture.selectOption("jacobian_conjecture");
  await expect(relatedTask.locator("option")).toHaveCount(6);
  await relatedConjecture.selectOption("number_theory_002_odd_perfect_number");
  await expect(relatedTask.locator("option")).toHaveCount(2);
  await expect(page.locator(".message-editor-head")).toContainText("Markdown and LaTeX are supported");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.locator("#community-email-privacy")).toContainText("Never published or included in AI review");
  await expect(page.locator(".community-filters label")).toHaveCount(3);
  await expect(page.getByLabel("Category").locator("option")).toHaveCount(6);
  await expect(page.locator(".moderation-note")).toContainText("human approval is mandatory");
  await page.getByRole("button", { name: "Human moderator console" }).click();
  await expect(page.getByLabel("Moderator key")).toBeVisible();
  await expect(page.getByLabel("Reviewer name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pending review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review history" })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("A **bold** note with $x^2$. ");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".message-preview strong")).toHaveText("bold");
  await expect(page.locator(".lab-task-tabs")).toHaveCount(0);
  await expect(page.locator("#interactive-verifier")).toHaveCount(0);
  await page.getByRole("button", { name: "Verify all Beal constraints" }).click();
  await expect(page.locator("#verify .interactive-condition-list > div")).toHaveCount(5);
  await expect(page.locator("#verify .interactive-condition-list > .pass")).toHaveCount(4);
  await expect(page.locator("#verify .interactive-condition-list > .fail")).toHaveCount(1);
  await expect(page.locator("#verify .exact-stat-grid")).toContainText("432");
  await page.locator(".trace-item").first().click();
  await expect(page.locator(".trace-detail h3")).toHaveText("GPT-5.2");
  await page.getByRole("button", { name: "Extracted output" }).click();
  await expect(page.locator(".arithmetic-stat-grid")).toContainText("432");
  await page.getByRole("button", { name: "Evaluation details" }).click();
  await expect(page.locator(".evaluation-conditions")).toContainText("absolute difference=432");

  await page.locator(".conjecture-selector button").nth(2).click();
  await expect(page.locator(".hero-case-copy h2")).toHaveText("Odd Perfect Number Problem");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(page.locator(".task-actions button")).toHaveCount(1);
  await expect(page.locator(".atlas-side-card")).toContainText("A hypothetical integer under severe constraints");
  await expect(page.locator(".atlas-frontier-facts")).toContainText("LOWER BOUND");
  await page.getByRole("button", { name: "Extracted output" }).click();
  await expect(page.locator(".counterexample-point-card")).toContainText("DIVISOR-SUM CHECK");
  await expect(page.locator(".arithmetic-stat-grid")).toContainText("426027470778");
  await expect(page.locator("#verify .section-lead h2")).toHaveText(
    "Test a candidate odd perfect number interactively",
  );
  await expect(page.locator('#verify [data-verifier="odd-perfect"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Verify factorization and divisor sum" })
    .click();
  await expect(page.locator("#verify .interactive-condition-list > div")).toHaveCount(3);
  await expect(page.locator("#verify .interactive-condition-list > .pass")).toHaveCount(2);
  await expect(page.locator("#verify .interactive-condition-list > .fail")).toHaveCount(1);
  await expect(page.locator("#verify .exact-stat-grid")).toContainText("426027470778");
  await expect(page.locator("#verify .interactive-scope a")).toHaveAttribute(
    "href",
    /eval_number_theory_002_odd_perfect_number\.py/,
  );

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
  await expect(page.locator(".task-card")).toHaveCount(1);
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
  await expect(page.locator("#verify .section-lead h2")).toHaveText("交互验证候选奇完全数");
  await expect(page.locator("#verify .interactive-scope")).toContainText("不使用 LLM judge");
  await expect(page.locator(".community-review-pipeline")).toContainText("强模型初审");
  await expect(page.locator(".community-review-pipeline")).toContainText("人工终审");
});

test("approved community messages are timestamped and grouped by review category", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/community?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        taskLikes: { "jacobian_conjecture:P1": 3 },
        likedTasks: [],
        pendingCount: 1,
        traffic: { total: 20, countries: { CN: 10, TW: 3, US: 7 } },
        messages: Array.from({ length: 6 }, (_, index) => {
          const originalLanguage = index === 1 ? "zh" : index === 2 ? "other" : "en";
          const title = index === 0
            ? "a condition worth checking"
            : index === 1
              ? "一个中文原始问题"
              : index === 2
                ? "una pregunta matemática"
                : `follow-up condition ${index + 1}`;
          const body = index === 0
            ? "Please verify the **collision certificate** exactly."
            : index === 1
              ? "这是包含 **原始中文** 的留言。"
              : index === 2
                ? "Este es el **mensaje original**."
                : `Verification note ${index + 1}.`;
          const translations = originalLanguage === "zh"
            ? {
                originalLanguage,
                en: {
                  title: "An original Chinese question",
                  body: "This is a message containing **original Chinese**.",
                },
              }
            : originalLanguage === "other"
              ? {
                  originalLanguage,
                  en: { title: "A mathematical question", body: "This is the **original message**." },
                  zh: { title: "一个数学问题", body: "这是 **原始留言**。" },
                }
              : {
                  originalLanguage,
                  zh: {
                    title: index === 0 ? "一个值得检查的条件" : `后续条件 ${index + 1}`,
                    body: index === 0
                      ? "请精确验证 **碰撞证书**。"
                      : `验证留言 ${index + 1}。`,
                  },
                };
          return {
            id: `reviewed-message-${index + 1}`,
            nickname: index === 0 ? "Finite Verifier" : `Researcher ${index + 1}`,
            title,
            body,
            conjecture: "jacobian_conjecture",
            task: "P1",
            category: "verification_gap",
            status: "approved",
            likes: 2,
            createdAt: "2026-08-11T03:04:05.000Z",
            submittedAt: "2026-08-11T03:04:05.000Z",
            aiScreened: true,
            humanApproved: true,
            translations,
          };
        }),
      }),
    });
  });
  await page.goto(siteRoot);
  await expect(page.locator('#global-reach [data-country="CN"]')).toHaveAttribute("data-visits", "13");
  await expect(page.locator('#global-reach [data-country="TW"]')).toHaveCount(0);
  await expect(page.locator("#global-reach .traffic-leaders li").first()).toContainText("China");
  await expect(page.locator("#global-reach .traffic-leaders li").first()).toContainText("13");
  await expect(page.locator(".message-category-head")).toContainText("Verification gaps");
  await expect(page.locator(".message-category-head")).toContainText("06");
  await expect(page.locator(".message-item")).toHaveCount(5);
  const firstMessage = page.locator(".message-item").first();
  await expect(firstMessage.locator(".message-card-heading h4")).toHaveText("A condition worth checking");
  await expect(firstMessage.locator(".message-author")).toContainText("Finite Verifier");
  await expect(firstMessage.locator(".message-tags > span")).toHaveCount(2);
  await expect(firstMessage.locator("time")).toContainText(/2026/);
  await expect(firstMessage.locator("time")).toContainText(/:04:05/);
  await expect(firstMessage.locator(".message-review-badges")).toContainText("AI SCREENED");
  await expect(firstMessage.locator(".message-review-badges")).toContainText("HUMAN APPROVED");
  await expect(firstMessage.locator(".message-content strong")).toHaveText("collision certificate");
  await expect(firstMessage.getByRole("button", { name: "DEF", exact: true })).toHaveAttribute("aria-pressed", "true");

  await firstMessage.getByRole("button", { name: "EN", exact: true }).click();
  await expect(firstMessage.locator(".message-card-heading h4")).toHaveText("A condition worth checking");
  await expect(firstMessage.locator(".message-content strong")).toHaveText("collision certificate");
  await expect(firstMessage.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");

  const copyButton = firstMessage.getByRole("button", { name: "Copy original message" });
  await copyButton.click();
  await expect(copyButton).toHaveClass(/copied/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Please verify the **collision certificate** exactly.");

  await firstMessage.getByRole("button", { name: "ZH", exact: true }).click();
  await expect(firstMessage.locator(".message-card-heading h4")).toHaveText("一个值得检查的条件");
  await expect(firstMessage.locator(".message-content strong")).toHaveText("碰撞证书");
  await firstMessage.getByRole("button", { name: "DEF", exact: true }).click();
  await expect(firstMessage.locator(".message-card-heading h4")).toHaveText("A condition worth checking");
  await expect(firstMessage.locator(".message-content strong")).toHaveText("collision certificate");
  await firstMessage.getByRole("button", { name: "ZH", exact: true }).click();
  await firstMessage.getByRole("button", { name: "Expand message" }).click();
  const modal = page.locator(".message-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("heading", { name: "一个值得检查的条件" })).toBeVisible();
  await expect(modal.locator(".message-modal-scroll strong")).toHaveText("碰撞证书");
  await modal.getByRole("button", { name: "EN", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "A condition worth checking" })).toBeVisible();
  await modal.getByRole("button", { name: "Close expanded message" }).click();
  await expect(modal).toBeHidden();

  const chineseMessage = page.locator(".message-item").nth(1);
  await expect(chineseMessage.locator(".message-card-heading h4")).toHaveText("一个中文原始问题");
  await chineseMessage.getByRole("button", { name: "ZH", exact: true }).click();
  await expect(chineseMessage.locator(".message-content strong")).toHaveText("原始中文");
  await chineseMessage.getByRole("button", { name: "EN", exact: true }).click();
  await expect(chineseMessage.locator(".message-card-heading h4")).toHaveText("An original Chinese question");
  await chineseMessage.getByRole("button", { name: "DEF", exact: true }).click();
  await expect(chineseMessage.locator(".message-card-heading h4")).toHaveText("一个中文原始问题");

  const otherLanguageMessage = page.locator(".message-item").nth(2);
  await expect(otherLanguageMessage.locator(".message-card-heading h4")).toHaveText("Una pregunta matemática");
  await otherLanguageMessage.getByRole("button", { name: "EN", exact: true }).click();
  await expect(otherLanguageMessage.locator(".message-card-heading h4")).toHaveText("A mathematical question");
  await otherLanguageMessage.getByRole("button", { name: "ZH", exact: true }).click();
  await expect(otherLanguageMessage.locator(".message-card-heading h4")).toHaveText("一个数学问题");
  await otherLanguageMessage.getByRole("button", { name: "DEF", exact: true }).click();
  await expect(otherLanguageMessage.locator(".message-content strong")).toHaveText("mensaje original");

  await expect(page.getByRole("progressbar", { name: "Message page progress" })).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Next message page" }).click();
  await expect(page.locator(".message-item")).toHaveCount(1);
  await expect(page.locator(".message-page-count")).toHaveText("2 / 2");
  await page.locator("#community").screenshot({ path: "/tmp/opbench-community-review.png" });
});

test("human moderation remains operable after an AI review failure", async ({ page }) => {
  let moderated = false;
  let moderationBody: Record<string, unknown> | undefined;
  const failedMessage = {
    id: "failed-ai-message",
    nickname: "Independent Checker",
    contactEmail: "checker@example.org",
    title: "A candidate condition for manual review",
    body: "Please inspect this **finite verification condition** manually.",
    conjecture: "new",
    task: "general",
    status: "ai_pending",
    likes: 0,
    createdAt: "2026-08-11T03:04:05.000Z",
    submittedAt: "2026-08-11T03:04:05.000Z",
    submittedDate: "2026-08-11",
    submittedTime: "03:04:05Z",
    source: { country: "ZZ", fingerprint: "0123456789…" },
    aiReview: {
      status: "failed",
      model: "gemini-3.5-flash-thinking",
      riskFlags: [],
      reviewedAt: "2026-08-11T03:05:05.000Z",
      maxTokens: 65_536,
      error: "ai_review_http_404:model_not_found:Unknown review model",
    },
  };

  await page.route("**/api/community*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          taskLikes: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
          likedTasks: [],
          pendingCount: moderated ? 0 : 1,
          messages: [],
        }),
      });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    if (body.action === "admin_queue") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: moderated ? [] : [failedMessage],
          count: moderated ? 0 : 1,
          storage: {
            backend: "Cloudflare Durable Object (SQLite-backed storage)",
            storedCount: 1,
            applicationCapacity: 10_000,
            automaticDeletion: false,
          },
          aiConfiguration: {
            configured: true,
            compatible: false,
            apiKeyConfigured: true,
            baseUrlConfigured: true,
            modelConfigured: true,
            model: "gemini-3.5-flash-thinking",
            endpoint: {
              protocol: "http",
              hostname: "35.220.164.252",
              port: "3888",
              path: "/v1/chat/completions",
            },
            issue: "ai_review_base_url_ip_literal_unsupported_by_cloudflare_workers_use_dns_hostname",
          },
          aiRuntime: {
            queuedCount: 0,
            alarmScheduledAt: null,
            automaticSubmissions: "durable_object_alarm",
            manualRetries: "connected_request",
          },
        }),
      });
      return;
    }
    if (body.action === "admin_export") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 2,
          exportedAt: "2026-08-11T03:06:05.000Z",
          total: 1,
          offset: 0,
          nextOffset: null,
          messages: [failedMessage],
        }),
      });
      return;
    }
    if (body.action === "retry_ai_review") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          status: "ai_pending",
          aiReview: failedMessage.aiReview,
        }),
      });
      return;
    }
    if (body.action === "moderate") {
      moderationBody = body;
      moderated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, aiOverride: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(siteRoot);
  await page.getByRole("button", { name: "Human moderator console" }).click();
  await page.getByLabel("Moderator key").fill("test-admin-key");
  await page.getByLabel("Reviewer name").fill("Browser test moderator");
  await page.getByRole("button", { name: "Load pending queue" }).click();

  const card = page.locator(".moderation-card");
  await expect(card).toContainText("AI · failed");
  await expect(card).toContainText("ai_review_http_404:model_not_found");
  await expect(card).toContainText("65,536");
  await expect(card.getByRole("button", { name: "Reject" })).toBeEnabled();
  await expect(card.getByRole("button", { name: "Approve with override" })).toBeDisabled();
  await expect(page.locator(".moderator-storage-summary")).toContainText("automatic deletion off");
  await expect(page.locator(".moderator-ai-diagnostics")).toContainText("BLOCKED");
  await expect(page.locator(".moderator-ai-diagnostics")).toContainText("IP-literal");
  await expect(page.locator(".moderator-ai-diagnostics")).toContainText("35.220.164.252:3888");

  await card.getByRole("button", { name: "Retry AI review" }).click();
  await expect(page.locator(".moderator-notice")).toContainText(
    "AI review failed: ai_review_http_404:model_not_found",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export private backup" }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe("community-private-backup-2026-08-11.json");

  await card.getByLabel("Public category").selectOption("verification_gap");
  await card.getByLabel("Private review note").fill(
    "I independently checked the safety and relevance of this message.",
  );
  await expect(card.getByRole("button", { name: "Approve with override" })).toBeEnabled();
  await card.getByRole("button", { name: "Approve with override" }).click();
  await expect(page.locator(".moderator-notice")).toContainText("message is now public");
  expect(moderationBody).toMatchObject({
    status: "approved",
    category: "verification_gap",
    reviewer: "Browser test moderator",
    overrideAiFailure: true,
  });
});

test("completed human reviews can withdraw and republish a message", async ({ page }) => {
  let status: "approved" | "rejected" = "approved";
  const moderationBodies: Array<Record<string, unknown>> = [];
  const history: Array<{
    status: "approved" | "rejected";
    reviewer: string;
    category: string;
    note: string;
    reviewedAt: string;
    revision: number;
    action: "initial" | "updated";
  }> = [{
    status: "approved",
    reviewer: "First moderator",
    category: "research_question",
    note: "Initial review completed.",
    reviewedAt: "2026-08-11T04:00:00.000Z",
    revision: 1,
    action: "initial",
  }];

  await page.route("**/api/community*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          taskLikes: {},
          likedTasks: [],
          pendingCount: 0,
          traffic: { total: 9, countries: { CN: 9 } },
          messages: status === "approved" ? [{
            id: "review-update-message",
            nickname: "Researcher",
            title: "A reversible moderation test",
            body: "This message is controlled by the latest human decision.",
            conjecture: "jacobian_conjecture",
            task: "P1",
            category: "research_question",
            status: "approved",
            likes: 0,
            createdAt: "2026-08-11T03:00:00.000Z",
            aiScreened: true,
            humanApproved: true,
          }] : [],
        }),
      });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    if (body.action === "admin_queue") {
      const currentReview = history.at(-1)!;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [{
            id: "review-update-message",
            nickname: "Researcher",
            contactEmail: "researcher@example.org",
            title: "A reversible moderation test",
            body: "This message is controlled by the latest human decision.",
            conjecture: "jacobian_conjecture",
            task: "P1",
            category: currentReview.category,
            status,
            submittedAt: "2026-08-11T03:00:00.000Z",
            aiReview: {
              status: "completed",
              model: "gemini-3.5-flash-thinking",
              verdict: "allow",
              category: "research_question",
              riskFlags: [],
            },
            humanReview: currentReview,
            humanReviewHistory: history,
          }],
          storage: { backend: "Cloudflare Durable Object", storedCount: 1, applicationCapacity: 10_000, automaticDeletion: false },
        }),
      });
      return;
    }
    if (body.action === "moderate") {
      moderationBodies.push(body);
      status = body.status as "approved" | "rejected";
      history.push({
        status,
        reviewer: String(body.reviewer),
        category: String(body.category),
        note: String(body.note),
        reviewedAt: new Date().toISOString(),
        revision: history.length + 1,
        action: "updated",
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(siteRoot);
  await page.getByRole("button", { name: "Human moderator console" }).click();
  await page.getByLabel("Moderator key").fill("test-admin-key");
  await page.getByRole("button", { name: "Review history" }).click();
  const card = page.locator(".moderation-card");
  await card.getByRole("button", { name: "Update human review" }).click();
  await card.getByLabel("Private review note").fill("Withdrawn after a corrected human assessment.");
  await card.getByRole("button", { name: "Update to rejected" }).click();
  await expect(page.locator(".moderator-notice")).toContainText("withdrawn");
  expect(moderationBodies[0]).toMatchObject({ status: "rejected", allowRevision: true });

  await card.getByRole("button", { name: "Update human review" }).click();
  await card.getByLabel("Private review note").fill("Republished after an independent second assessment.");
  await card.getByRole("button", { name: "Update to approved" }).click();
  await expect(page.locator(".moderator-notice")).toContainText("now public");
  expect(moderationBodies[1]).toMatchObject({ status: "approved", allowRevision: true });
  await expect(card.locator(".human-review-record")).toContainText("3");
});
