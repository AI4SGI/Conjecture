"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Eye,
  Heart,
  MessageSquarePlus,
  PencilLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommunitySnapshot, ConjectureData, Language } from "../lib/types";
import { MathText } from "./task-section";

function normalizeConjectureId(value?: string) {
  return !value || value === "jacobian" ? "jacobian_conjecture" : value;
}

export function CommunityBoard({
  apiUrl,
  snapshot,
  online,
  refresh,
  getClientKey,
  language,
  conjectures,
  activeConjectureId,
}: {
  apiUrl: string | null;
  snapshot: CommunitySnapshot;
  online: boolean;
  refresh: (sort?: string) => Promise<void>;
  getClientKey: () => string;
  language: Language;
  conjectures: ConjectureData[];
  activeConjectureId: string;
}) {
  const english = language === "en";
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [conjectureFilter, setConjectureFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [form, setForm] = useState({
    nickname: "",
    conjecture: activeConjectureId,
    title: "",
    body: "",
    task: "general",
  });
  const [status, setStatus] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const selectedConjecture = conjectures.find((item) => item.id === form.conjecture) ?? conjectures[0];
  const selectedTasks = selectedConjecture?.benchmarkData.dataset.tasks ?? [];
  const filterTasks = useMemo(() => {
    const source = conjectureFilter === "all"
      ? conjectures.flatMap((item) => item.benchmarkData.dataset.tasks)
      : conjectures.find((item) => item.id === conjectureFilter)?.benchmarkData.dataset.tasks ?? [];
    return [...new Map(source.map((task) => [task.key, task])).values()];
  }, [conjectureFilter, conjectures]);

  useEffect(() => {
    setForm((current) => ({ ...current, conjecture: activeConjectureId, task: "general" }));
  }, [activeConjectureId]);

  function conjectureLabel(id?: string) {
    const normalized = normalizeConjectureId(id);
    if (normalized === "new") return english ? "New conjecture" : "新猜想";
    const match = conjectures.find((item) => item.id === normalized);
    return match ? (english ? match.title : match.titleZh) : normalized;
  }

  function taskLabel(conjectureId: string | undefined, task: string) {
    if (task === "general") return english ? "General discussion" : "一般讨论";
    const normalized = normalizeConjectureId(conjectureId);
    const match = conjectures
      .find((item) => item.id === normalized)
      ?.benchmarkData.dataset.tasks.find((candidate) => candidate.key === task);
    return match ? `${task} · ${english ? match.title : match.titleZh}` : task;
  }

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
        conjecture: activeConjectureId,
        title: "",
        body: "",
        task: "general",
      });
      setEditorMode("write");
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
        normalizeConjectureId(item.conjecture) === conjectureFilter) &&
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
                onChange={(event) => {
                  setConjectureFilter(event.target.value);
                  setTaskFilter("all");
                }}
              >
                <option value="all">{english ? "All conjectures" : "所有猜想"}</option>
                {conjectures.map((item) => <option value={item.id} key={item.id}>{english ? item.title : item.titleZh}</option>)}
              </select>
            </label>
            <label>
              <span>{english ? "Task" : "任务"}</span>
              <select
                value={taskFilter}
                onChange={(event) => setTaskFilter(event.target.value)}
              >
                <option value="all">{english ? "All tasks" : "所有任务"}</option>
                <option value="general">{english ? "General discussion" : "一般讨论"}</option>
                {filterTasks.map((task) => <option value={task.key} key={task.key}>{conjectureFilter === "all" ? task.key : `${task.key} · ${english ? task.title : task.titleZh}`}</option>)}
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
              {visibleMessages.map((item) => {
                const normalizedConjecture = normalizeConjectureId(item.conjecture);
                return <article key={item.id} className="message-item">
                  <header>
                    <div className="message-tags">
                      <span className="message-conjecture">
                        {conjectureLabel(normalizedConjecture)}
                      </span>
                      <span className="message-task">
                        {taskLabel(normalizedConjecture, item.task)}
                      </span>
                    </div>
                    <time>
                      {new Date(item.createdAt).toLocaleDateString(
                        english ? "en-US" : "zh-CN",
                      )}
                    </time>
                  </header>
                  <h4>{item.title}</h4>
                  <div className="message-content"><MathText>{item.body}</MathText></div>
                  <footer>
                    <span>— {item.nickname}</span>
                    <button onClick={() => void likeMessage(item.id)}>
                      <Heart size={14} /> {item.likes}
                    </button>
                  </footer>
                </article>;
              })}
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
                  task: "general",
                }))
              }
            >
              {conjectures.map((item) => <option value={item.id} key={item.id}>{english ? item.title : item.titleZh}</option>)}
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
              <option value="general">{english ? "General discussion" : "一般讨论"}</option>
              {selectedTasks.map((task) => <option value={task.key} key={task.key}>{task.key} · {english ? task.title : task.titleZh}</option>)}
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
          <div className="message-editor">
            <div className="message-editor-head">
              <div><span>{english ? "Message" : "内容"}</span><small>{english ? "Markdown and LaTeX are supported" : "支持 Markdown 与 LaTeX"}</small></div>
              <div className="message-editor-tabs" role="tablist" aria-label={english ? "Message editor mode" : "留言编辑模式"}>
                <button type="button" className={editorMode === "write" ? "active" : ""} onClick={() => setEditorMode("write")} aria-pressed={editorMode === "write"}><PencilLine size={14} />{english ? "Write" : "编辑"}</button>
                <button type="button" className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")} aria-pressed={editorMode === "preview"}><Eye size={14} />{english ? "Preview" : "预览"}</button>
              </div>
            </div>
            {editorMode === "write" ? (
              <textarea
                required
                aria-label={english ? "Message" : "内容"}
                minLength={12}
                maxLength={1800}
                rows={9}
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder={english ? "Describe the motivation, constraints, and how the idea could be verified. Use Markdown for lists, links, code, or equations." : "建议写明动机、约束和可以怎样验证；可使用 Markdown 添加列表、链接、代码或公式。"}
              />
            ) : (
              <div className="message-preview" role="tabpanel">
                {form.body.trim() ? <MathText>{form.body}</MathText> : <p>{english ? "Nothing to preview yet." : "暂无可预览内容。"}</p>}
              </div>
            )}
          </div>
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
