import { DurableObject } from "cloudflare:workers";

type TaskKey = "P1" | "P2" | "P3" | "P4" | "P5";
type MessageStatus = "pending" | "approved" | "rejected";

interface CommunityMessage {
  id: string;
  nickname: string;
  title: string;
  body: string;
  conjecture: "jacobian" | "new";
  task: TaskKey | "general";
  status: MessageStatus;
  likes: number;
  createdAt: string;
}

interface CommunitySnapshot {
  taskLikes: Record<TaskKey, number>;
  likedTasks: TaskKey[];
  messages: CommunityMessage[];
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

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanText(input: unknown, max: number) {
  return String(input ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

export class CommunityStore extends DurableObject<CloudflareEnv> {
  async snapshot(
    sort: "recent" | "popular",
    clientKey: string,
  ): Promise<CommunitySnapshot> {
    const taskLikes =
      (await this.ctx.storage.get<Record<TaskKey, number>>("taskLikes")) ??
      EMPTY_LIKES;
    const messages =
      (await this.ctx.storage.get<CommunityMessage[]>("messages")) ?? [];
    const approved = messages.filter((message) => message.status === "approved");
    approved.sort((a, b) =>
      sort === "popular"
        ? b.likes - a.likes || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
    );
    const likedTasks =
      clientKey.length >= 8
        ? (
            await Promise.all(
              TASKS.map(async (task) => [
                task,
                Boolean(
                  await this.ctx.storage.get(
                    `vote:task:${task}:${clientKey}`,
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
      pendingCount: messages.filter((message) => message.status === "pending")
        .length,
    };
  }

  async likeTask(body: Record<string, unknown>) {
    const task = cleanText(body.task, 2) as TaskKey;
    const clientKey = cleanText(body.clientKey, 80);
    if (!TASKS.includes(task) || clientKey.length < 8) {
      return json({ error: "invalid_request" }, 400);
    }

    const voteKey = `vote:task:${task}:${clientKey}`;
    const likes =
      (await this.ctx.storage.get<Record<TaskKey, number>>("taskLikes")) ??
      structuredClone(EMPTY_LIKES);
    if (await this.ctx.storage.get(voteKey)) {
      likes[task] = Math.max(0, likes[task] - 1);
      await this.ctx.storage.put("taskLikes", likes);
      await this.ctx.storage.delete(voteKey);
      return json({ ok: true, task, likes: likes[task], liked: false });
    }

    likes[task] += 1;
    await this.ctx.storage.put({
      taskLikes: likes,
      [voteKey]: true,
    });
    return json({ ok: true, task, likes: likes[task], liked: true });
  }

  async submitMessage(body: Record<string, unknown>) {
    const nickname = cleanText(body.nickname, 40);
    const title = cleanText(body.title, 120);
    const messageBody = cleanText(body.body, 1800);
    const conjecture: "jacobian" | "new" =
      cleanText(body.conjecture, 24) === "new" ? "new" : "jacobian";
    const rawTask = cleanText(body.task, 8);
    const task = (TASKS.includes(rawTask as TaskKey)
      ? rawTask
      : "general") as TaskKey | "general";
    const clientKey = cleanText(body.clientKey, 80);
    if (
      nickname.length < 2 ||
      title.length < 4 ||
      messageBody.length < 12 ||
      clientKey.length < 8
    ) {
      return json({ error: "invalid_request" }, 400);
    }

    const day = new Date().toISOString().slice(0, 10);
    const rateKey = `submit:${day}:${clientKey}`;
    const submissions = (await this.ctx.storage.get<number>(rateKey)) ?? 0;
    if (submissions >= 5) {
      return json({ error: "rate_limited" }, 429);
    }

    const messages =
      (await this.ctx.storage.get<CommunityMessage[]>("messages")) ?? [];
    const message: CommunityMessage = {
      id: crypto.randomUUID(),
      nickname,
      title,
      body: messageBody,
      conjecture,
      task,
      status: "pending",
      likes: 0,
      createdAt: new Date().toISOString(),
    };
    messages.unshift(message);
    await this.ctx.storage.put({
      messages: messages.slice(0, 500),
      [rateKey]: submissions + 1,
    });
    return json({ ok: true, id: message.id, status: "pending" }, 201);
  }

  async likeMessage(body: Record<string, unknown>) {
    const id = cleanText(body.id, 80);
    const clientKey = cleanText(body.clientKey, 80);
    if (!id || clientKey.length < 8) {
      return json({ error: "invalid_request" }, 400);
    }
    const voteKey = `vote:message:${id}:${clientKey}`;
    if (await this.ctx.storage.get(voteKey)) {
      return json({ error: "already_liked" }, 409);
    }

    const messages =
      (await this.ctx.storage.get<CommunityMessage[]>("messages")) ?? [];
    const message = messages.find(
      (candidate) => candidate.id === id && candidate.status === "approved",
    );
    if (!message) return json({ error: "not_found" }, 404);
    message.likes += 1;
    await this.ctx.storage.put({ messages, [voteKey]: true });
    return json({ ok: true, id, likes: message.likes });
  }

  async moderate(request: Request, body: Record<string, unknown>) {
    const supplied = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!this.env.COMMUNITY_ADMIN_KEY || supplied !== this.env.COMMUNITY_ADMIN_KEY) {
      return json({ error: "unauthorized" }, 401);
    }
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 16) as MessageStatus;
    if (!id || !["approved", "rejected"].includes(status)) {
      return json({ error: "invalid_request" }, 400);
    }
    const messages =
      (await this.ctx.storage.get<CommunityMessage[]>("messages")) ?? [];
    const message = messages.find((candidate) => candidate.id === id);
    if (!message) return json({ error: "not_found" }, 404);
    message.status = status;
    await this.ctx.storage.put("messages", messages);
    return json({ ok: true, id, status });
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
        return this.likeTask(body);
      case "submit_message":
        return this.submitMessage(body);
      case "like_message":
        return this.likeMessage(body);
      case "moderate":
        return this.moderate(request, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  }
}
