import { DurableObject } from "cloudflare:workers";
import {
  COMMUNITY_CATEGORIES,
  type CommunityAiReview,
  type CommunityCategory,
  type CommunityMessageTranslations,
  reviewCommunityMessage,
} from "./community-review";
import { normalizeCommunityContactEmail } from "./community-security";

type TaskKey = "P1" | "P2" | "P3" | "P4" | "P5";
type MessageStatus =
  | "ai_pending"
  | "human_pending"
  | "approved"
  | "rejected";

interface StoredCommunityMessage {
  id: string;
  nickname: string;
  contactEmail?: string;
  title: string;
  body: string;
  conjecture: string;
  task: string;
  category?: CommunityCategory;
  status: MessageStatus | "pending";
  likes: number;
  createdAt: string;
  submittedAt?: string;
  submittedDate?: string;
  submittedTime?: string;
  publishedAt?: string;
  contentFingerprint?: string;
  source?: {
    fingerprint: string;
    country: string;
  };
  aiReview?: CommunityAiReview;
  humanReview?: {
    status: "approved" | "rejected";
    reviewer: string;
    category?: CommunityCategory;
    note: string;
    reviewedAt: string;
    aiOverride?: boolean;
    aiStatusAtDecision?: CommunityAiReview["status"];
    aiErrorAtDecision?: string;
  };
}

interface PublicCommunityMessage {
  id: string;
  nickname: string;
  title: string;
  body: string;
  conjecture: string;
  task: string;
  category: CommunityCategory;
  status: "approved";
  likes: number;
  createdAt: string;
  submittedAt: string;
  publishedAt?: string;
  aiScreened: boolean;
  humanApproved: boolean;
  translations?: CommunityMessageTranslations;
}

interface CommunitySnapshot {
  taskLikes: Record<TaskKey, number>;
  likedTasks: TaskKey[];
  messages: PublicCommunityMessage[];
  pendingCount: number;
}

const TASKS: TaskKey[] = ["P1", "P2", "P3", "P4", "P5"];
const EMPTY_LIKES: Record<TaskKey, number> = {
  P1: 0,
  P2: 0,
  P3: 0,
  P4: 0,
  P5: 0,
};
const MESSAGE_INDEX_KEY = "messageIndex:v2";
const MESSAGE_PREFIX = "message:v2:";
const AI_REVIEW_QUEUE_KEY = "aiReviewQueue:v1";
const MAX_MESSAGES = 10_000;
const DEFAULT_ALLOWED_TARGETS: Record<string, string[]> = {
  new: ["general"],
  jacobian_conjecture: ["general", "P1", "P2", "P3", "P4", "P5"],
  number_theory_001_beal_conjecture: ["general", "P1"],
  number_theory_002_odd_perfect_number: ["general", "P1"],
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanText(input: unknown, max: number) {
  return String(input ?? "")
    .replace(/<\/?(?:script|iframe|object|embed|style|form|input|button|meta|link)[^>]*>/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function secureEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function sourceFingerprint(request: Request) {
  const value = request.headers.get("X-Community-Fingerprint") ?? "unknown";
  return /^[a-f0-9]{32,64}$/.test(value) ? value : "unknown";
}

function sourceCountry(request: Request) {
  const value = request.headers.get("X-Community-Country") ?? "ZZ";
  return /^[A-Z]{2}$/.test(value) ? value : "ZZ";
}

function publicMessage(message: StoredCommunityMessage): PublicCommunityMessage {
  const submittedAt = message.submittedAt ?? message.createdAt;
  return {
    id: message.id,
    nickname: message.nickname,
    title: message.title,
    body: message.body,
    conjecture: message.conjecture,
    task: message.task,
    category: message.category ?? message.aiReview?.category ?? "other",
    status: "approved",
    likes: message.likes,
    createdAt: submittedAt,
    submittedAt,
    publishedAt: message.publishedAt,
    aiScreened: message.aiReview?.status === "completed",
    humanApproved: message.humanReview?.status === "approved",
    translations: message.aiReview?.translations,
  };
}

function normalizeLegacyMessage(message: StoredCommunityMessage) {
  const submittedAt = message.submittedAt ?? message.createdAt;
  const date = new Date(submittedAt);
  return {
    ...message,
    status: message.status === "pending" ? "ai_pending" as const : message.status,
    submittedAt,
    submittedDate: message.submittedDate ?? date.toISOString().slice(0, 10),
    submittedTime: message.submittedTime ?? date.toISOString().slice(11, 19) + "Z",
    aiReview: message.aiReview ?? (
      message.status === "pending"
        ? {
            status: "failed" as const,
            model: "unavailable",
            riskFlags: [],
            error: "legacy_message_requires_ai_review",
          }
        : undefined
    ),
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function contentIsSuspicious(title: string, body: string, nickname: string) {
  const combined = [nickname, title, body].join("\n");
  const urlCount = (combined.match(/(?:https?:\/\/|www\.)/gi) ?? []).length;
  return urlCount > 3
    || body.split("\n").length > 80
    || /(javascript|data):/i.test(combined)
    || /(.)\1{24,}/u.test(combined)
    || /[\u202A-\u202E\u2066-\u2069]/u.test(combined);
}

export class CommunityStore extends DurableObject<CloudflareEnv> {
  private async messageIndex() {
    const current = await this.ctx.storage.get<string[]>(MESSAGE_INDEX_KEY);
    if (current) return current;
    const legacy =
      (await this.ctx.storage.get<StoredCommunityMessage[]>("messages")) ?? [];
    const normalized = legacy.map(normalizeLegacyMessage);
    for (let offset = 0; offset < normalized.length; offset += 50) {
      const values: Record<string, StoredCommunityMessage> = {};
      for (const message of normalized.slice(offset, offset + 50)) {
        values[MESSAGE_PREFIX + message.id] = message;
      }
      if (Object.keys(values).length) await this.ctx.storage.put(values);
    }
    const index = normalized.map((message) => message.id);
    await this.ctx.storage.put(MESSAGE_INDEX_KEY, index);
    if (legacy.length) await this.ctx.storage.delete("messages");
    return index;
  }

  private async loadMessages() {
    const index = await this.messageIndex();
    const messages: StoredCommunityMessage[] = [];
    for (let offset = 0; offset < index.length; offset += 100) {
      const keys = index.slice(offset, offset + 100).map((id) => MESSAGE_PREFIX + id);
      const stored = await this.ctx.storage.get<StoredCommunityMessage>(keys);
      for (const id of index.slice(offset, offset + 100)) {
        const message = stored.get(MESSAGE_PREFIX + id);
        if (message) messages.push(normalizeLegacyMessage(message));
      }
    }
    return messages;
  }

  private async loadMessage(id: string) {
    const message = await this.ctx.storage.get<StoredCommunityMessage>(MESSAGE_PREFIX + id);
    return message ? normalizeLegacyMessage(message) : undefined;
  }

  private async saveMessage(message: StoredCommunityMessage) {
    await this.ctx.storage.put(MESSAGE_PREFIX + message.id, message);
  }

  private async addMessage(message: StoredCommunityMessage) {
    const index = await this.messageIndex();
    if (index.length >= MAX_MESSAGES && !index.includes(message.id)) {
      throw new Error("message_capacity_reached");
    }
    const next = [message.id, ...index.filter((id) => id !== message.id)];
    await this.ctx.storage.put({
      [MESSAGE_PREFIX + message.id]: message,
      [MESSAGE_INDEX_KEY]: next,
    });
  }

  private allowedTargets() {
    try {
      const parsed = JSON.parse(
        this.env.COMMUNITY_ALLOWED_TARGETS ?? "",
      ) as Record<string, string[]>;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length) {
        return parsed;
      }
    } catch {
      // Fall through to the checked-in allowlist.
    }
    return DEFAULT_ALLOWED_TARGETS;
  }

  private authorized(request: Request) {
    const supplied = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");
    return secureEqual(supplied, this.env.COMMUNITY_ADMIN_KEY);
  }

  private async consumeSubmissionQuota(
    clientKey: string,
    fingerprint: string,
    now: Date,
  ) {
    const day = now.toISOString().slice(0, 10);
    const hour = now.toISOString().slice(0, 13);
    const limits = [
      { key: "submit:client:" + day + ":" + clientKey, limit: 5 },
      { key: "submit:fingerprint-day:" + day + ":" + fingerprint, limit: 8 },
      { key: "submit:fingerprint-hour:" + hour + ":" + fingerprint, limit: 3 },
    ];
    const counts = await Promise.all(
      limits.map(async ({ key }) => (await this.ctx.storage.get<number>(key)) ?? 0),
    );
    if (counts.some((count, index) => count >= limits[index].limit)) return false;
    const updates: Record<string, number> = {};
    limits.forEach(({ key }, index) => {
      updates[key] = counts[index] + 1;
    });
    await this.ctx.storage.put(updates);
    return true;
  }

  private async runAiReview(id: string) {
    const submittedMessage = await this.loadMessage(id);
    if (!submittedMessage || ["approved", "rejected"].includes(submittedMessage.status)) return;
    let aiReview: CommunityAiReview;
    try {
      aiReview = await reviewCommunityMessage(this.env, {
        nickname: submittedMessage.nickname,
        title: submittedMessage.title,
        body: submittedMessage.body,
        conjecture: submittedMessage.conjecture,
        task: submittedMessage.task,
      });
    } catch (error) {
      const model = this.env.COMMUNITY_AI_MODEL_NAME ?? "unconfigured";
      aiReview = {
        status: "failed",
        model,
        riskFlags: [],
        reviewedAt: new Date().toISOString(),
        maxTokens: model.toLowerCase().startsWith("gemini") ? 65_536 : 128_000,
        error: cleanText(error instanceof Error ? error.message : "ai_review_failed", 300),
      };
    }
    const latest = await this.loadMessage(id);
    if (!latest || ["approved", "rejected"].includes(latest.status)) return;
    latest.aiReview = aiReview;
    if (aiReview.status === "completed") {
      latest.category = aiReview.category;
      latest.status = "human_pending";
    } else {
      latest.status = "ai_pending";
    }
    await this.saveMessage(latest);
  }

  private async enqueueAiReview(id: string) {
    const queue = (await this.ctx.storage.get<string[]>(AI_REVIEW_QUEUE_KEY)) ?? [];
    if (!queue.includes(id)) {
      await this.ctx.storage.put(AI_REVIEW_QUEUE_KEY, [...queue, id]);
    }
    if (await this.ctx.storage.getAlarm() === null) {
      await this.ctx.storage.setAlarm(Date.now() + 100);
    }
  }

  async alarm() {
    const queue = (await this.ctx.storage.get<string[]>(AI_REVIEW_QUEUE_KEY)) ?? [];
    const id = queue[0];
    if (!id) return;
    await this.runAiReview(id);
    const latestQueue = (await this.ctx.storage.get<string[]>(AI_REVIEW_QUEUE_KEY)) ?? [];
    const remaining = latestQueue.filter((queuedId) => queuedId !== id);
    await this.ctx.storage.put(AI_REVIEW_QUEUE_KEY, remaining);
    if (remaining.length) {
      await this.ctx.storage.setAlarm(Date.now() + 250);
    }
  }

  async snapshot(
    sort: "recent" | "popular",
    clientKey: string,
  ): Promise<CommunitySnapshot> {
    const taskLikes =
      (await this.ctx.storage.get<Record<TaskKey, number>>("taskLikes")) ??
      EMPTY_LIKES;
    const messages = await this.loadMessages();
    const approved = messages
      .filter((message) => message.status === "approved")
      .map(publicMessage);
    approved.sort((left, right) =>
      sort === "popular"
        ? right.likes - left.likes || right.submittedAt.localeCompare(left.submittedAt)
        : right.submittedAt.localeCompare(left.submittedAt),
    );
    const likedTasks =
      /^[a-zA-Z0-9-]{8,80}$/.test(clientKey)
        ? (
            await Promise.all(
              TASKS.map(async (task) => [
                task,
                Boolean(
                  await this.ctx.storage.get(
                    "vote:task:" + task + ":" + clientKey,
                  ),
                ),
              ] as const),
            )
          )
            .filter(([, liked]) => liked)
            .map(([task]) => task)
        : [];
    return {
      taskLikes,
      likedTasks,
      messages: approved,
      pendingCount: messages.filter(
        (message) => !["approved", "rejected"].includes(message.status),
      ).length,
    };
  }

  async likeTask(request: Request, body: Record<string, unknown>) {
    const task = cleanText(body.task, 3) as TaskKey;
    const clientKey = cleanText(body.clientKey, 80);
    const fingerprint = sourceFingerprint(request);
    if (!TASKS.includes(task) || !/^[a-zA-Z0-9-]{8,80}$/.test(clientKey)) {
      return json({ error: "invalid_request" }, 400);
    }
    const voteKey = "vote:task:" + task + ":" + clientKey;
    const fingerprintVoteKey = "vote:task-fingerprint:" + task + ":" + fingerprint;
    const likes =
      (await this.ctx.storage.get<Record<TaskKey, number>>("taskLikes")) ??
      structuredClone(EMPTY_LIKES);
    if (await this.ctx.storage.get(voteKey)) {
      likes[task] = Math.max(0, likes[task] - 1);
      await this.ctx.storage.put("taskLikes", likes);
      await this.ctx.storage.delete([voteKey, fingerprintVoteKey]);
      return json({ ok: true, task, likes: likes[task], liked: false });
    }
    if (await this.ctx.storage.get(fingerprintVoteKey)) {
      return json({ error: "already_liked" }, 409);
    }
    likes[task] += 1;
    await this.ctx.storage.put({
      taskLikes: likes,
      [voteKey]: true,
      [fingerprintVoteKey]: true,
    });
    return json({ ok: true, task, likes: likes[task], liked: true });
  }

  async submitMessage(request: Request, body: Record<string, unknown>) {
    if (cleanText(body.website, 200)) {
      return json({ ok: true, id: crypto.randomUUID(), status: "ai_pending" }, 201);
    }
    const now = new Date();
    const formStartedAt = Number(body.formStartedAt);
    const elapsed = now.getTime() - formStartedAt;
    if (!Number.isFinite(formStartedAt) || elapsed < 800 || elapsed > 86_400_000) {
      return json({ error: "suspicious_submission" }, 400);
    }

    const nickname = cleanText(body.nickname, 40);
    const contactEmail = normalizeCommunityContactEmail(body.email);
    const title = cleanText(body.title, 120);
    const messageBody = cleanText(body.body, 1800);
    const conjecture = cleanText(body.conjecture, 80);
    const task = cleanText(body.task, 8);
    const clientKey = cleanText(body.clientKey, 80);
    const allowedTargets = this.allowedTargets();
    if (!contactEmail) return json({ error: "invalid_email" }, 400);
    if (
      nickname.length < 2
      || title.length < 4
      || messageBody.length < 12
      || !/^[a-zA-Z0-9-]{8,80}$/.test(clientKey)
      || !(allowedTargets[conjecture]?.includes(task)
        || (task === "general" && /^[a-z0-9][a-z0-9_-]{1,79}$/i.test(conjecture)))
      || contentIsSuspicious(title, messageBody, nickname)
    ) {
      return json({ error: "invalid_request" }, 400);
    }

    if ((await this.messageIndex()).length >= MAX_MESSAGES) {
      return json({
        error: "message_capacity_reached",
        detail: "No existing messages were deleted. A moderator must archive or expand storage before accepting more.",
      }, 503);
    }

    const fingerprint = sourceFingerprint(request);
    if (!await this.consumeSubmissionQuota(clientKey, fingerprint, now)) {
      return json({ error: "rate_limited" }, 429);
    }
    const contentFingerprint = await sha256(
      [conjecture, task, title.toLowerCase(), messageBody.toLowerCase()]
        .join("\n")
        .replace(/\s+/g, " "),
    );
    if (await this.ctx.storage.get("content:" + contentFingerprint)) {
      return json({ error: "duplicate_submission" }, 409);
    }

    const submittedAt = now.toISOString();
    const message: StoredCommunityMessage = {
      id: crypto.randomUUID(),
      nickname,
      contactEmail,
      title,
      body: messageBody,
      conjecture,
      task,
      status: "ai_pending",
      likes: 0,
      createdAt: submittedAt,
      submittedAt,
      submittedDate: submittedAt.slice(0, 10),
      submittedTime: submittedAt.slice(11, 19) + "Z",
      contentFingerprint,
      source: {
        fingerprint,
        country: sourceCountry(request),
      },
      aiReview: {
        status: "pending",
        model: this.env.COMMUNITY_AI_MODEL_NAME ?? "unconfigured",
        riskFlags: [],
      },
    };
    await this.addMessage(message);
    await this.ctx.storage.put("content:" + contentFingerprint, message.id);
    await this.enqueueAiReview(message.id);
    return json({
      ok: true,
      id: message.id,
      status: "ai_pending",
      submittedAt,
      workflow: ["ai_review", "human_review", "publication"],
    }, 201);
  }

  async likeMessage(request: Request, body: Record<string, unknown>) {
    const id = cleanText(body.id, 80);
    const clientKey = cleanText(body.clientKey, 80);
    const fingerprint = sourceFingerprint(request);
    if (!id || !/^[a-zA-Z0-9-]{8,80}$/.test(clientKey)) {
      return json({ error: "invalid_request" }, 400);
    }
    const voteKey = "vote:message:" + id + ":" + clientKey;
    const fingerprintVoteKey = "vote:message-fingerprint:" + id + ":" + fingerprint;
    if (
      await this.ctx.storage.get(voteKey)
      || await this.ctx.storage.get(fingerprintVoteKey)
    ) {
      return json({ error: "already_liked" }, 409);
    }
    const message = await this.loadMessage(id);
    if (!message || message.status !== "approved") {
      return json({ error: "not_found" }, 404);
    }
    message.likes += 1;
    await this.saveMessage(message);
    await this.ctx.storage.put({
      [voteKey]: true,
      [fingerprintVoteKey]: true,
    });
    return json({ ok: true, id, likes: message.likes });
  }

  async adminQueue(request: Request, body: Record<string, unknown>) {
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);
    const view = cleanText(body.view, 16) === "reviewed" ? "reviewed" : "pending";
    const messages = (await this.loadMessages())
      .filter((message) => view === "reviewed"
        ? ["approved", "rejected"].includes(message.status)
        : !["approved", "rejected"].includes(message.status))
      .sort((left, right) =>
        (right.submittedAt ?? right.createdAt)
          .localeCompare(left.submittedAt ?? left.createdAt),
      )
      .map(({ contentFingerprint: _contentFingerprint, source, ...message }) => ({
        ...message,
        source: source
          ? {
              country: source.country,
              fingerprint: source.fingerprint.slice(0, 10) + "…",
            }
          : undefined,
      }));
    const storedCount = (await this.messageIndex()).length;
    return json({
      messages,
      count: messages.length,
      storage: {
        backend: "Cloudflare Durable Object (SQLite-backed storage)",
        storedCount,
        applicationCapacity: MAX_MESSAGES,
        automaticDeletion: false,
      },
    });
  }

  async adminExport(request: Request, body: Record<string, unknown>) {
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);
    const requestedOffset = Number(body.offset);
    const requestedLimit = Number(body.limit);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(250, Math.max(1, requestedLimit))
      : 100;
    const messages = await this.loadMessages();
    const page = messages.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return json({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      backend: "Cloudflare Durable Object (SQLite-backed storage)",
      automaticDeletion: false,
      total: messages.length,
      offset,
      messages: page,
      nextOffset: nextOffset < messages.length ? nextOffset : null,
    });
  }

  async retryAiReview(request: Request, body: Record<string, unknown>) {
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);
    const id = cleanText(body.id, 80);
    const message = await this.loadMessage(id);
    if (!message || ["approved", "rejected"].includes(message.status)) {
      return json({ error: "not_found" }, 404);
    }
    message.status = "ai_pending";
    message.aiReview = {
      status: "pending",
      model: this.env.COMMUNITY_AI_MODEL_NAME ?? "unconfigured",
      riskFlags: [],
    };
    await this.saveMessage(message);
    await this.enqueueAiReview(id);
    return json({ ok: true, id, status: "ai_pending" });
  }

  async moderate(request: Request, body: Record<string, unknown>) {
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 16) as "approved" | "rejected";
    if (!id || !["approved", "rejected"].includes(status)) {
      return json({ error: "invalid_request" }, 400);
    }
    const message = await this.loadMessage(id);
    if (!message) return json({ error: "not_found" }, 404);
    if (["approved", "rejected"].includes(message.status)) {
      return json({ error: "already_moderated" }, 409);
    }
    const note = cleanText(body.note, 600);
    const aiFailed = message.aiReview?.status === "failed";
    const overrideAiFailure = body.overrideAiFailure === true;
    if (status === "approved" && message.aiReview?.status !== "completed" && !aiFailed) {
      return json({ error: "ai_review_required" }, 409);
    }
    if (status === "approved" && aiFailed && !overrideAiFailure) {
      return json({ error: "ai_review_override_required" }, 409);
    }
    if (status === "approved" && aiFailed && note.length < 12) {
      return json({ error: "override_note_required" }, 400);
    }
    const requestedCategory = cleanText(body.category, 40) as CommunityCategory;
    const category = COMMUNITY_CATEGORIES.includes(requestedCategory)
      ? requestedCategory
      : message.aiReview?.category ?? "other";
    const reviewedAt = new Date().toISOString();
    message.status = status;
    message.category = category;
    message.humanReview = {
      status,
      reviewer: cleanText(body.reviewer, 40) || "moderator",
      category,
      note,
      reviewedAt,
      ...(aiFailed && overrideAiFailure
        ? {
            aiOverride: true,
            aiStatusAtDecision: "failed" as const,
            aiErrorAtDecision: message.aiReview?.error,
          }
        : {}),
    };
    if (status === "approved") message.publishedAt = reviewedAt;
    await this.saveMessage(message);
    return json({
      ok: true,
      id,
      status,
      category,
      reviewedAt,
      aiOverride: aiFailed && overrideAiFailure,
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const sort = url.searchParams.get("sort") === "popular" ? "popular" : "recent";
      const clientKey = cleanText(url.searchParams.get("clientKey"), 80);
      return json(await this.snapshot(sort, clientKey));
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    switch (body.action) {
      case "like_task":
        return this.likeTask(request, body);
      case "submit_message":
        return this.submitMessage(request, body);
      case "like_message":
        return this.likeMessage(request, body);
      case "admin_queue":
        return this.adminQueue(request, body);
      case "admin_export":
        return this.adminExport(request, body);
      case "retry_ai_review":
        return this.retryAiReview(request, body);
      case "moderate":
        return this.moderate(request, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  }
}
