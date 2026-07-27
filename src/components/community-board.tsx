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
import type { CommunitySnapshot } from "../lib/types";

export function CommunityBoard({
  apiUrl,
  snapshot,
  online,
  refresh,
  getClientKey,
}: {
  apiUrl: string | null;
  snapshot: CommunitySnapshot;
  online: boolean;
  refresh: (sort?: string) => Promise<void>;
  getClientKey: () => string;
}) {
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [form, setForm] = useState({
    nickname: "",
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
      setMessage("社区后端尚未连接。");
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
      setMessage("已进入审核队列；通过后会出现在公开留言板。");
      setForm({ nickname: "", title: "", body: "", task: "general" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus("error");
      setMessage(
        reason === "rate_limited"
          ? "今天的提交次数已达上限。"
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

  return (
    <section className="community section-shell" id="community">
      <div className="section-lead">
        <span className="section-index">05 / COMMUNITY</span>
        <h2>把值得追的问题留下来</h2>
        <p>
          提交你认为遗漏的约束、反例方向或验证漏洞。留言先进入后台审核；
          被持续关注的问题可成为下一版评测候选。
        </p>
      </div>

      <div className="community-grid">
        <div className="message-board">
          <div className="message-board-head">
            <div>
              <h3>公开留言</h3>
              <span>
                <ShieldCheck size={14} /> 仅显示审核通过内容
              </span>
            </div>
            <div className="sort-toggle" aria-label="留言排序">
              <button
                className={sort === "recent" ? "active" : ""}
                onClick={() => void changeSort("recent")}
              >
                <Clock3 size={13} /> 最新
              </button>
              <button
                className={sort === "popular" ? "active" : ""}
                onClick={() => void changeSort("popular")}
              >
                <Heart size={13} /> 热度
              </button>
            </div>
          </div>

          {!online ? (
            <div className="community-empty">
              <ShieldCheck />
              <h4>社区后端暂未连接</h4>
              <p>数学内容与评测结果不受影响；部署环境恢复后会自动重新连接。</p>
            </div>
          ) : snapshot.messages.length ? (
            <div className="message-list">
              {snapshot.messages.map((item) => (
                <article key={item.id} className="message-item">
                  <header>
                    <span className="message-task">
                      {item.task === "general" ? "GENERAL" : item.task}
                    </span>
                    <time>
                      {new Date(item.createdAt).toLocaleDateString("zh-CN")}
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
              <h4>等第一条经过审核的问题</h4>
              <p>这里不预置虚构讨论。提交后，内容经审核通过才会公开。</p>
            </div>
          )}
        </div>

        <form className="message-form" onSubmit={submit}>
          <div className="message-form-head">
            <MessageSquarePlus />
            <div>
              <span className="micro-label">SUBMIT A QUESTION</span>
              <h3>提交研究留言</h3>
            </div>
          </div>
          <label>
            <span>署名</span>
            <input
              required
              minLength={2}
              maxLength={40}
              value={form.nickname}
              onChange={(event) =>
                setForm((current) => ({ ...current, nickname: event.target.value }))
              }
              placeholder="你的名字或研究代号"
            />
          </label>
          <label>
            <span>关联任务</span>
            <select
              value={form.task}
              onChange={(event) =>
                setForm((current) => ({ ...current, task: event.target.value }))
              }
            >
              <option value="general">一般讨论</option>
              <option value="P1">P1 · 开放构造</option>
              <option value="P2">P2 · 七次边界</option>
              <option value="P3">P3 · 六次压缩</option>
              <option value="P4">P4 · 四点纤维</option>
              <option value="P5">P5 · 二维前沿</option>
            </select>
          </label>
          <label>
            <span>标题</span>
            <input
              required
              minLength={4}
              maxLength={120}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="一句话说清问题"
            />
          </label>
          <label>
            <span>内容</span>
            <textarea
              required
              minLength={12}
              maxLength={1800}
              rows={7}
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              placeholder="建议写明动机、约束和可以怎样验证。"
            />
          </label>
          <p className="moderation-note">
            <ShieldCheck size={14} />
            每个匿名浏览器每天最多提交 3 条；审核可拒绝重复、无可验证性或偏离主题的内容。
          </p>
          <button className="submit-message" disabled={!online || status === "submitting"}>
            {status === "submitting" ? "提交中…" : "提交审核"}
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
