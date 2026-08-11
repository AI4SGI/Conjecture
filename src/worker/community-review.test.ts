import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCommunityAiReview,
  reviewCommunityMessage,
} from "./community-review";
import {
  communityRequestFingerprint,
  normalizeCommunityContactEmail,
} from "./community-security";

describe("community AI review contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only the fixed verdict, category, and risk taxonomies", () => {
    const review = parseCommunityAiReview(JSON.stringify({
      verdict: "allow",
      category: "verification_gap",
      risk_flags: ["unverifiable_claim", "made_up_flag"],
      summary: "A concise summary.",
      rationale: "Relevant but the mathematical claim needs human verification.",
      original_language: "en",
      title_en: "",
      title_zh: "一个值得检查的条件",
      body_en: "",
      body_zh: "保留 **Markdown** 和 $x^2$。",
    }));
    expect(review).toEqual({
      verdict: "allow",
      category: "verification_gap",
      riskFlags: ["unverifiable_claim"],
      summary: "A concise summary.",
      rationale: "Relevant but the mathematical claim needs human verification.",
      translations: {
        originalLanguage: "en",
        zh: {
          title: "一个值得检查的条件",
          body: "保留 **Markdown** 和 $x^2$。",
        },
      },
    });
  });

  it("stores only English translation fields for a Chinese original", () => {
    const review = parseCommunityAiReview(JSON.stringify({
      verdict: "allow",
      category: "research_question",
      risk_flags: [],
      original_language: "zh",
      title_en: "Can this condition be verified?",
      body_en: "Preserve $x^2$ and **Markdown**.",
      title_zh: "",
      body_zh: "",
    }));
    expect(review.translations).toEqual({
      originalLanguage: "zh",
      en: {
        title: "Can this condition be verified?",
        body: "Preserve $x^2$ and **Markdown**.",
      },
    });
  });

  it("stores both translations for an original in another language", () => {
    const review = parseCommunityAiReview(JSON.stringify({
      verdict: "allow",
      category: "other",
      risk_flags: [],
      original_language: "other",
      title_en: "A mathematical question",
      body_en: "English translation.",
      title_zh: "一个数学问题",
      body_zh: "中文翻译。",
    }));
    expect(review.translations).toEqual({
      originalLanguage: "other",
      en: { title: "A mathematical question", body: "English translation." },
      zh: { title: "一个数学问题", body: "中文翻译。" },
    });
  });

  it("fails conservatively when the model returns unknown labels", () => {
    const review = parseCommunityAiReview(JSON.stringify({
      verdict: "publish_now",
      category: "secret_category",
      risk_flags: "none",
    }));
    expect(review.verdict).toBe("human_attention");
    expect(review.category).toBe("other");
    expect(review.riskFlags).toEqual([]);
  });

  it("fails closed when any private AI setting is missing", async () => {
    await expect(reviewCommunityMessage({
      COMMUNITY_AI_BASE_URL: "https://review.invalid/v1",
      COMMUNITY_AI_MODEL_NAME: "",
      COMMUNITY_AI_API_KEY: "private-test-key",
    }, {
      nickname: "Researcher",
      title: "A verification question",
      body: "Could the offline verifier expose this intermediate condition?",
      conjecture: "jacobian_conjecture",
      task: "P1",
    })).rejects.toThrow("ai_review_not_configured");
  });

  it("uses the full Gemini thinking budget and accepts structured text content", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: [{
            type: "text",
            text: JSON.stringify({
              verdict: "allow",
              category: "research_question",
              risk_flags: [],
              original_language: "en",
              title_zh: "一个问题",
              body_zh: "一条可验证的留言。",
            }),
          }],
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const review = await reviewCommunityMessage({
      COMMUNITY_AI_BASE_URL: "https://review.example/v1/chat/completions",
      COMMUNITY_AI_MODEL_NAME: "gemini-3.5-flash-thinking",
      COMMUNITY_AI_API_KEY: "private-test-key",
    }, {
      nickname: "Researcher",
      title: "A verification question",
      body: "Could the offline verifier expose this intermediate condition?",
      conjecture: "jacobian_conjecture",
      task: "P1",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(init.body)) as { max_tokens: number };
    expect(url).toBe("https://review.example/v1/chat/completions");
    expect(requestBody.max_tokens).toBe(65_536);
    expect(review.status).toBe("completed");
    expect(review.finishReason).toBe("stop");
    expect(review.maxTokens).toBe(65_536);
  });

  it("records the finish reason when a provider returns empty content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "" } }],
    }), { status: 200 })));
    await expect(reviewCommunityMessage({
      COMMUNITY_AI_BASE_URL: "https://review.example/v1",
      COMMUNITY_AI_MODEL_NAME: "gemini-3.5-flash-thinking",
      COMMUNITY_AI_API_KEY: "private-test-key",
    }, {
      nickname: "Researcher",
      title: "A verification question",
      body: "Could the offline verifier expose this intermediate condition?",
      conjecture: "jacobian_conjecture",
      task: "P1",
    })).rejects.toThrow("ai_review_empty_content_finish_length");
  });

  it("keeps a safe upstream error detail for moderator diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "model_not_found", message: "Unknown review model" },
    }), { status: 404 })));
    await expect(reviewCommunityMessage({
      COMMUNITY_AI_BASE_URL: "https://review.example/v1",
      COMMUNITY_AI_MODEL_NAME: "gemini-3.5-flash-thinking",
      COMMUNITY_AI_API_KEY: "private-test-key",
    }, {
      nickname: "Researcher",
      title: "A verification question",
      body: "Could the offline verifier expose this intermediate condition?",
      conjecture: "jacobian_conjecture",
      task: "P1",
    })).rejects.toThrow("ai_review_http_404:model_not_found:Unknown review model");
  });
});

describe("community request fingerprint", () => {
  it("is deterministic, pseudonymous, and salt-dependent", async () => {
    const request = new Request("https://example.test/api/community", {
      headers: {
        "CF-Connecting-IP": "203.0.113.8",
        "User-Agent": "Community test agent",
      },
    });
    const first = await communityRequestFingerprint(request, "salt-a");
    const repeated = await communityRequestFingerprint(request, "salt-a");
    const changed = await communityRequestFingerprint(request, "salt-b");
    expect(first).toMatch(/^[a-f0-9]{40}$/);
    expect(repeated).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).not.toContain("203.0.113.8");
  });

  it("normalizes a contact email and rejects malformed addresses", () => {
    expect(normalizeCommunityContactEmail(" Researcher@Example.ORG "))
      .toBe("researcher@example.org");
    expect(normalizeCommunityContactEmail("not-an-email")).toBeNull();
    expect(normalizeCommunityContactEmail("name@-example.org")).toBeNull();
    expect(normalizeCommunityContactEmail("name@example")).toBeNull();
  });
});
