"use client";

import {
  Check,
  KeyRound,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import type { CommunityCategory, Language } from "../lib/types";
import { MathText } from "./task-section";

interface ModerationMessage {
  id: string;
  nickname: string;
  contactEmail?: string;
  title: string;
  body: string;
  conjecture: string;
  task: string;
  category?: CommunityCategory;
  status: "ai_pending" | "human_pending" | "approved" | "rejected";
  submittedAt?: string;
  submittedDate?: string;
  submittedTime?: string;
  source?: { country: string; fingerprint: string };
  aiReview?: {
    status: "pending" | "completed" | "failed";
    model: string;
    verdict?: "allow" | "human_attention" | "reject";
    category?: CommunityCategory;
    riskFlags: string[];
    summary?: string;
    rationale?: string;
    reviewedAt?: string;
    error?: string;
  };
  humanReview?: {
    status: "approved" | "rejected";
    reviewer: string;
    category?: CommunityCategory;
    note: string;
    reviewedAt: string;
  };
}

const CATEGORIES: CommunityCategory[] = [
  "research_question",
  "counterexample_direction",
  "verification_gap",
  "benchmark_feedback",
  "other",
];

const CATEGORY_LABELS: Record<CommunityCategory, { en: string; zh: string }> = {
  research_question: { en: "Research question", zh: "研究问题" },
  counterexample_direction: { en: "Counterexample direction", zh: "反例方向" },
  verification_gap: { en: "Verification gap", zh: "验证漏洞" },
  benchmark_feedback: { en: "Benchmark feedback", zh: "评测反馈" },
  other: { en: "Other", zh: "其他" },
};

export function CommunityModerator({
  apiUrl,
  language,
  refreshPublicMessages,
}: {
  apiUrl: string | null;
  language: Language;
  refreshPublicMessages: () => Promise<void>;
}) {
  const english = language === "en";
  const [open, setOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [messages, setMessages] = useState<ModerationMessage[]>([]);
  const [queueView, setQueueView] = useState<"pending" | "reviewed">("pending");
  const [decisions, setDecisions] = useState<
    Record<string, { category: CommunityCategory; note: string }>
  >({});
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notice, setNotice] = useState("");

  async function adminRequest(body: Record<string, unknown>) {
    if (!apiUrl || !adminKey) throw new Error("missing_admin_key");
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json() as {
      error?: string;
      messages?: ModerationMessage[];
    };
    if (!response.ok) throw new Error(result.error ?? "request_failed");
    return result;
  }

  async function loadQueue(view = queueView) {
    setState("loading");
    setNotice("");
    try {
      const result = await adminRequest({ action: "admin_queue", view });
      const queue = result.messages ?? [];
      setMessages(queue);
      setDecisions((current) => {
        const next = { ...current };
        for (const item of queue) {
          next[item.id] ??= {
            category: item.category ?? item.aiReview?.category ?? "other",
            note: "",
          };
        }
        return next;
      });
      setState("ready");
    } catch (error) {
      setState("error");
      setNotice(
        error instanceof Error && error.message === "unauthorized"
          ? english ? "Invalid moderator key." : "审核密钥无效。"
          : english ? "Could not load the moderation queue." : "无法载入审核队列。",
      );
    }
  }

  function changeQueueView(view: "pending" | "reviewed") {
    setQueueView(view);
    setMessages([]);
    if (adminKey) void loadQueue(view);
  }

  async function decide(item: ModerationMessage, status: "approved" | "rejected") {
    setState("loading");
    setNotice("");
    const decision = decisions[item.id] ?? {
      category: item.aiReview?.category ?? "other",
      note: "",
    };
    try {
      await adminRequest({
        action: "moderate",
        id: item.id,
        status,
        category: decision.category,
        note: decision.note,
        reviewer: reviewer || "Human moderator",
      });
      await loadQueue(queueView);
      await refreshPublicMessages();
      setNotice(
        status === "approved"
          ? english ? "Human approval recorded; the message is now public." : "已记录人工通过，留言现已公开。"
          : english ? "Human rejection recorded." : "已记录人工拒绝。",
      );
    } catch (error) {
      setState("error");
      setNotice(
        error instanceof Error && error.message === "ai_review_required"
          ? english ? "AI review must finish before a human decision." : "必须先完成 AI 初审，才能进行人工终审。"
          : english ? "The moderation decision failed." : "人工审核操作失败。",
      );
    }
  }

  async function retryAi(item: ModerationMessage) {
    setState("loading");
    setNotice("");
    try {
      await adminRequest({ action: "retry_ai_review", id: item.id });
      await loadQueue();
      setNotice(english ? "AI review was queued again." : "已重新排队进行 AI 初审。");
    } catch {
      setState("error");
      setNotice(english ? "Could not restart AI review." : "无法重新启动 AI 初审。");
    }
  }

  return (
    <div className="moderator-console">
      <button
        type="button"
        className="moderator-console-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <KeyRound size={15} />
        {english ? "Human moderator console" : "人工审核台"}
      </button>
      {open ? (
        <div className="moderator-console-panel">
          <div className="moderator-auth">
            <label>
              <span>{english ? "Moderator key" : "审核密钥"}</span>
              <input
                type="password"
                autoComplete="off"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
              />
            </label>
            <label>
              <span>{english ? "Reviewer name" : "审核人"}</span>
              <input
                maxLength={40}
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                placeholder={english ? "Recorded in the private audit log" : "记录于内部审核日志"}
              />
            </label>
            <button type="button" onClick={() => void loadQueue(queueView)} disabled={!apiUrl || !adminKey || state === "loading"}>
              <RefreshCw size={14} />
              {queueView === "pending"
                ? english ? "Load pending queue" : "载入待审队列"
                : english ? "Load review history" : "载入审核历史"}
            </button>
          </div>
          <p className="moderator-privacy-note">
            <ShieldCheck size={14} />
            {english
              ? "The key stays only in this browser tab. Contact emails, AI recommendations, and private audit metadata are never shown on the public board."
              : "密钥仅保留在当前浏览器标签页；联系邮箱、AI 建议和内部审计元数据不会展示到公开留言区。"}
          </p>
          <div className="moderation-view-toggle" aria-label={english ? "Moderation records" : "审核记录"}>
            <button
              type="button"
              className={queueView === "pending" ? "active" : ""}
              onClick={() => changeQueueView("pending")}
            >
              {english ? "Pending review" : "待审核"}
            </button>
            <button
              type="button"
              className={queueView === "reviewed" ? "active" : ""}
              onClick={() => changeQueueView("reviewed")}
            >
              {english ? "Review history" : "审核历史"}
            </button>
          </div>
          {notice ? <p className={state === "error" ? "moderator-notice error" : "moderator-notice"}>{notice}</p> : null}
          {state === "ready" && !messages.length ? (
            <p className="moderator-empty">
              {queueView === "pending"
                ? english ? "No messages are waiting for review." : "当前没有待审核留言。"
                : english ? "No completed moderation records yet." : "当前没有已完成的审核记录。"}
            </p>
          ) : null}
          <div className="moderation-queue">
            {messages.map((item) => {
              const decision = decisions[item.id] ?? {
                category: item.aiReview?.category ?? "other",
                note: "",
              };
              const aiComplete = item.aiReview?.status === "completed";
              const awaitingDecision = item.status === "ai_pending" || item.status === "human_pending";
              return (
                <article className="moderation-card" key={item.id}>
                  <header>
                    <div>
                      <span className={"ai-verdict " + (item.aiReview?.verdict ?? item.aiReview?.status ?? "pending")}>
                        AI · {item.aiReview?.verdict ?? item.aiReview?.status ?? "pending"}
                      </span>
                      {!awaitingDecision ? (
                        <span className={"human-verdict " + item.status}>
                          {english ? "HUMAN" : "人工"} · {item.status}
                        </span>
                      ) : null}
                      <span>{item.conjecture} · {item.task}</span>
                    </div>
                    <time dateTime={item.submittedAt}>
                      {item.submittedAt ? new Date(item.submittedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}
                    </time>
                  </header>
                  <div className="original-submission-label">
                    {english ? "Original submission" : "原始留言"}
                  </div>
                  <h4>{item.title}</h4>
                  <dl className="submission-private-detail">
                    <div><dt>{english ? "Name" : "署名"}</dt><dd>{item.nickname}</dd></div>
                    <div>
                      <dt>{english ? "Private email" : "私有邮箱"}</dt>
                      <dd>{item.contactEmail ? <a href={"mailto:" + item.contactEmail}>{item.contactEmail}</a> : "—"}</dd>
                    </div>
                    <div><dt>{english ? "Source" : "来源"}</dt><dd>{item.source ? `${item.source.country} · ${item.source.fingerprint}` : "—"}</dd></div>
                    <div><dt>{english ? "Message ID" : "留言 ID"}</dt><dd>{item.id}</dd></div>
                  </dl>
                  <div className="moderation-message"><MathText>{item.body}</MathText></div>
                  <details className="moderation-raw-message">
                    <summary>{english ? "View raw Markdown" : "查看原始 Markdown"}</summary>
                    <pre>{item.body}</pre>
                  </details>
                  <dl className="ai-review-detail">
                    <div><dt>{english ? "AI model" : "AI 模型"}</dt><dd>{item.aiReview?.model ?? "—"}</dd></div>
                    <div><dt>{english ? "Suggested category" : "建议分类"}</dt><dd>{item.aiReview?.category ?? "—"}</dd></div>
                    <div><dt>{english ? "Summary" : "摘要"}</dt><dd>{item.aiReview?.summary || item.aiReview?.error || "—"}</dd></div>
                    <div><dt>{english ? "Rationale" : "理由"}</dt><dd>{item.aiReview?.rationale || "—"}</dd></div>
                    <div><dt>{english ? "Risk flags" : "风险标记"}</dt><dd>{item.aiReview?.riskFlags?.join(", ") || "none"}</dd></div>
                    <div><dt>{english ? "Reviewed at" : "初审时间"}</dt><dd>{item.aiReview?.reviewedAt ? new Date(item.aiReview.reviewedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                  </dl>
                  {awaitingDecision ? (
                    <>
                      <div className="human-decision-fields">
                        <label>
                          <span>{english ? "Public category" : "公开分类"}</span>
                          <select
                            value={decision.category}
                            onChange={(event) => setDecisions((current) => ({
                              ...current,
                              [item.id]: {
                                ...decision,
                                category: event.target.value as CommunityCategory,
                              },
                            }))}
                          >
                            {CATEGORIES.map((category) => (
                              <option value={category} key={category}>
                                {english ? CATEGORY_LABELS[category].en : CATEGORY_LABELS[category].zh}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{english ? "Private review note" : "内部审核备注"}</span>
                          <textarea
                            rows={2}
                            maxLength={600}
                            value={decision.note}
                            onChange={(event) => setDecisions((current) => ({
                              ...current,
                              [item.id]: { ...decision, note: event.target.value },
                            }))}
                          />
                        </label>
                      </div>
                      <footer>
                        {!aiComplete ? (
                          <button type="button" disabled={state === "loading"} onClick={() => void retryAi(item)}>
                            <RotateCcw size={14} />{english ? "Retry AI review" : "重试 AI 初审"}
                          </button>
                        ) : null}
                        <button type="button" className="reject" disabled={!aiComplete || state === "loading"} onClick={() => void decide(item, "rejected")}>
                          <X size={14} />{english ? "Reject" : "拒绝"}
                        </button>
                        <button type="button" className="approve" disabled={!aiComplete || state === "loading"} onClick={() => void decide(item, "approved")}>
                          <Check size={14} />{english ? "Approve and publish" : "通过并公开"}
                        </button>
                      </footer>
                    </>
                  ) : (
                    <dl className="human-review-record">
                      <div><dt>{english ? "Human decision" : "人工结论"}</dt><dd>{item.humanReview?.status ?? item.status}</dd></div>
                      <div><dt>{english ? "Reviewer" : "审核人"}</dt><dd>{item.humanReview?.reviewer ?? "—"}</dd></div>
                      <div><dt>{english ? "Final category" : "最终分类"}</dt><dd>{item.humanReview?.category ?? item.category ?? "—"}</dd></div>
                      <div><dt>{english ? "Reviewed at" : "终审时间"}</dt><dd>{item.humanReview?.reviewedAt ? new Date(item.humanReview.reviewedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                      <div className="wide"><dt>{english ? "Private review note" : "内部审核备注"}</dt><dd>{item.humanReview?.note || "—"}</dd></div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
