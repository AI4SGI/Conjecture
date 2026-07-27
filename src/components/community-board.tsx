"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Heart,
  MessageSquarePlus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { CommunitySnapshot, Language } from "../lib/types";

const TASK_LABELS = {
  general: "General discussion",
  P1: "P1 · Open construction",
  P2: "P2 · Degree-seven boundary",
  P3: "P3 · Degree-six compression",
  P4: "P4 · Four-point fiber",
  P5: "P5 · Dimension-two frontier",
} as const;

export function CommunityBoard({
  apiUrl,
  snapshot,
  online,
  refresh,
  getClientKey,
  language,
}: {
  apiUrl: string | null;
  snapshot: CommunitySnapshot;
  online: boolean;
  refresh: (sort?: string) => Promise<void>;
  getClientKey: () => string;
  language: Language;
}) {
  const english = language === "en";
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [conjectureFilter, setConjectureFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [form, setForm] = useState({
    nickname: "",
    conjecture: "jacobian",
    title: "",
    body: "",
    task: "general",
  });
  const [status, setStatus] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function changeSort(value: "recent" | "popular") {
    setSort(value);
    await refresh(value);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!apiUrl) {
      setStatus("error");
      setMessage(
        english
          ? "The community backend is not connected."
          : "社区后端尚未连接。",
      );
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_message",
          ...form,
          clientKey: getClientKey(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "submit_failed");
      setStatus("submitted");
      setMessage(
        english
          ? "Submitted for moderation. Approved messages will appear on the public board."
          : "已进入审核队列；通过后会出现在公开留言板。",
      );
      setForm({
        nickname: "",
        conjecture: "jacobian",
        title: "",
        body: "",
        task: "general",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus("error");
      setMessage(
        reason === "rate_limited"
          ? english
            ? "This browser has reached today’s submission limit."
            : "今天的提交次数已达上限。"
          : english
            ? "Submission failed. Please try again later."
            : "提交未成功，请稍后重试。",
      );
    }
  }

  async function likeMessage(id: string) {
    if (!apiUrl) return;
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "like_message",
        id,
        clientKey: getClientKey(),
      }),
    });
    await refresh(sort);
  }

  const visibleMessages = snapshot.messages.filter(
    (item) =>
      (conjectureFilter === "all" ||
        (item.conjecture ?? "jacobian") === conjectureFilter) &&
      (taskFilter === "all" || item.task === taskFilter),
  );

  return (
    <section className="community section-shell" id="community">
      <div className="section-lead">
        <span className="section-index">05 / COMMUNITY</span>
        <h2>
          {english ? "Keep the questions worth pursuing" : "把值得追的问题留下来"}
        </h2>
        <p>
          {english
            ? "Share a missing constraint, a counterexample direction, or a possible verification gap. Every message is moderated before publication; durable questions can inform the next benchmark release."
            : "提交你认为遗漏的约束、反例方向或验证漏洞。留言先进入后台审核；被持续关注的问题可成为下一版评测候选。"}
        </p>
      </div>

      <div className="community-grid">
        <div className="message-board">
          <div className="message-board-head">
            <div>
              <h3>{english ? "Public messages" : "公开留言"}</h3>
              <span>
                <ShieldCheck size={16} />{" "}
                {english ? "Only approved messages are shown" : "仅显示审核通过内容"}
              </span>
            </div>
            <div
              className="sort-toggle"
              aria-label={english ? "Sort messages" : "留言排序"}
            >
              <button
                className={sort === "recent" ? "active" : ""}
                onClick={() => void changeSort("recent")}
              >
                <Clock3 size={15} /> {english ? "Recent" : "最新"}
              </button>
              <button
                className={sort === "popular" ? "active" : ""}
                onClick={() => void changeSort("popular")}
              >
                <Heart size={15} /> {english ? "Popular" : "热度"}
              </button>
            </div>
          </div>

          <div className="community-filters" aria-label="Message filters">
            <label>
              <span>{english ? "Conjecture" : "猜想"}</span>
              <select
                value={conjectureFilter}
                onChange={(event) => setConjectureFilter(event.target.value)}
              >
                <option value="all">{english ? "All conjectures" : "所有猜想"}</option>
                <option value="jacobian">
                  {english ? "Jacobian conjecture" : "雅可比猜想"}
                </option>
              </select>
            </label>
            <label>
              <span>{english ? "Task" : "任务"}</span>
              <select
                value={taskFilter}
                onChange={(event) => setTaskFilter(event.target.value)}
              >
                <option value="all">{english ? "All tasks" : "所有任务"}</option>
                {Object.entries(TASK_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {english
                      ? label
                      : value === "general"
                        ? "一般讨论"
                        : value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!online ? (
            <div className="community-empty">
              <ShieldCheck />
              <h4>
                {english
                  ? "Community backend unavailable"
                  : "社区后端暂未连接"}
              </h4>
              <p>
                {english
                  ? "The mathematics and benchmark results remain available. This panel reconnects automatically when the deployment backend returns."
                  : "数学内容与评测结果不受影响；部署环境恢复后会自动重新连接。"}
              </p>
            </div>
          ) : visibleMessages.length ? (
            <div className="message-list">
              {visibleMessages.map((item) => (
                <article key={item.id} className="message-item">
                  <header>
                    <div className="message-tags">
                      <span className="message-conjecture">
                        {english ? "JACOBIAN" : "雅可比猜想"}
                      </span>
                      <span className="message-task">
                        {item.task === "general" ? "GENERAL" : item.task}
                      </span>
                    </div>
                    <time>
                      {new Date(item.createdAt).toLocaleDateString(
                        english ? "en-US" : "zh-CN",
                      )}
                    </time>
                  </header>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                  <footer>
                    <span>— {item.nickname}</span>
                    <button onClick={() => void likeMessage(item.id)}>
                      <Heart size={14} /> {item.likes}
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="community-empty">
              <Sparkles />
              <h4>
                {english
                  ? "Waiting for the first approved question"
                  : "等第一条经过审核的问题"}
              </h4>
              <p>
                {english
                  ? "No discussion is fabricated here. A submission becomes public only after moderation."
                  : "这里不预置虚构讨论。提交后，内容经审核通过才会公开。"}
              </p>
            </div>
          )}
        </div>

        <form className="message-form" onSubmit={submit}>
          <div className="message-form-head">
            <MessageSquarePlus />
            <div>
              <span className="micro-label">SUBMIT A QUESTION</span>
              <h3>{english ? "Submit a research note" : "提交研究留言"}</h3>
            </div>
          </div>
          <label>
            <span>{english ? "Name" : "署名"}</span>
            <input
              required
              minLength={2}
              maxLength={40}
              value={form.nickname}
              onChange={(event) =>
                setForm((current) => ({ ...current, nickname: event.target.value }))
              }
              placeholder={
                english ? "Your name or research alias" : "你的名字或研究代号"
              }
            />
          </label>
          <label>
            <span>{english ? "Related conjecture" : "关联猜想"}</span>
            <select
              value={form.conjecture}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  conjecture: event.target.value,
                }))
              }
            >
              <option value="jacobian">
                {english ? "Jacobian conjecture" : "雅可比猜想"}
              </option>
            </select>
          </label>
          <label>
            <span>{english ? "Related task" : "关联任务"}</span>
            <select
              value={form.task}
              onChange={(event) =>
                setForm((current) => ({ ...current, task: event.target.value }))
              }
            >
              {Object.entries(TASK_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {english
                    ? label
                    : value === "general"
                      ? "一般讨论"
                      : `${value} · 任务`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{english ? "Title" : "标题"}</span>
            <input
              required
              minLength={4}
              maxLength={120}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder={
                english ? "State the question in one sentence" : "一句话说清问题"
              }
            />
          </label>
          <label>
            <span>{english ? "Message" : "内容"}</span>
            <textarea
              required
              minLength={12}
              maxLength={1800}
              rows={7}
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              placeholder={
                english
                  ? "Describe the motivation, constraints, and how the idea could be verified."
                  : "建议写明动机、约束和可以怎样验证。"
              }
            />
          </label>
          <p className="moderation-note">
            <ShieldCheck size={16} />
            {english
              ? "Each anonymous browser may submit up to five messages per day. Moderation may reject duplicates, unverifiable claims, or off-topic content."
              : "每个匿名浏览器每天最多提交 5 条；审核可拒绝重复、无可验证性或偏离主题的内容。"}
          </p>
          <button className="submit-message" disabled={!online || status === "submitting"}>
            {status === "submitting"
              ? english
                ? "Submitting…"
                : "提交中…"
              : english
                ? "Submit for review"
                : "提交审核"}
            <ArrowUpRight size={15} />
          </button>
          {message && (
            <p className={status === "submitted" ? "form-status success" : "form-status error"}>
              {status === "submitted" && <CheckCircle2 size={14} />}
              {message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
