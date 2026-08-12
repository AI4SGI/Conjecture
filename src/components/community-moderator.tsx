"use client";

import {
  Bot,
  Check,
  Database,
  Download,
  KeyRound,
  Pencil,
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
    finishReason?: string;
    maxTokens?: number;
    queuedAt?: string;
    attemptStartedAt?: string;
    attemptCompletedAt?: string;
    attemptCount?: number;
    requestStage?: "queued" | "configuration" | "requesting" | "completed" | "failed";
    error?: string;
  };
  humanReview?: {
    status: "approved" | "rejected";
    reviewer: string;
    category?: CommunityCategory;
    note: string;
    reviewedAt: string;
    aiOverride?: boolean;
    aiStatusAtDecision?: "pending" | "completed" | "failed";
    aiErrorAtDecision?: string;
    revision?: number;
    previousStatus?: ModerationMessage["status"] | "pending";
    action?: "initial" | "updated";
  };
  humanReviewHistory?: Array<NonNullable<ModerationMessage["humanReview"]>>;
}

interface StorageSummary {
  backend: string;
  storedCount: number;
  applicationCapacity: number;
  automaticDeletion: boolean;
}

interface AdminResponse {
  ok?: boolean;
  error?: string;
  messages?: ModerationMessage[];
  storage?: StorageSummary;
  aiReview?: ModerationMessage["aiReview"];
  aiConfiguration?: AiConfiguration;
  aiRuntime?: AiRuntime;
  schemaVersion?: number;
  exportedAt?: string;
  total?: number;
  offset?: number;
  nextOffset?: number | null;
}

interface AiConfiguration {
  configured: boolean;
  compatible: boolean;
  apiKeyConfigured: boolean;
  baseUrlConfigured: boolean;
  modelConfigured: boolean;
  model: string;
  endpoint?: {
    protocol: string;
    hostname: string;
    configuredHostname?: string;
    hostnameOverrideApplied?: boolean;
    port: string;
    path: string;
  };
  warning?: string;
  issue?: string;
}

interface AiRuntime {
  queuedCount: number;
  alarmScheduledAt: string | null;
  automaticSubmissions: string;
  manualRetries: string;
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
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration | null>(null);
  const [aiRuntime, setAiRuntime] = useState<AiRuntime | null>(null);
  const [editingReviewId, setEditingReviewId] = useState("");

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
    const result = await response.json() as AdminResponse;
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
      setStorage(result.storage ?? null);
      setAiConfiguration(result.aiConfiguration ?? null);
      setAiRuntime(result.aiRuntime ?? null);
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
        overrideAiFailure: status === "approved" && item.aiReview?.status === "failed",
        allowRevision: ["approved", "rejected"].includes(item.status),
      });
      setEditingReviewId("");
      await loadQueue(queueView);
      await refreshPublicMessages();
      setNotice(
        status === "approved"
          ? english ? "Human approval recorded; the message is now public." : "已记录人工通过，留言现已公开。"
          : english ? "Human rejection recorded; any public copy has been withdrawn." : "已记录人工拒绝；公开留言已撤回。",
      );
    } catch (error) {
      setState("error");
      setNotice(
        error instanceof Error && error.message === "ai_review_required"
          ? english ? "AI review is still running. Wait for it to finish before approving." : "AI 初审仍在运行，请等待完成后再通过。"
          : error instanceof Error && ["ai_review_override_required", "override_note_required"].includes(error.message)
            ? english ? "A human override approval requires a private note of at least 12 characters." : "人工覆盖通过必须填写至少 12 个字符的内部审核备注。"
          : error instanceof Error && error.message === "revision_note_required"
            ? english ? "Updating a completed decision requires a private audit note of at least 12 characters." : "更新已完成审核时，必须填写至少 12 个字符的内部审计备注。"
          : english ? "The moderation decision failed." : "人工审核操作失败。",
      );
    }
  }

  async function retryAi(item: ModerationMessage) {
    setState("loading");
    setNotice(
      english
        ? "AI review is running now. Keep this tab open; the final result or exact error will appear here."
        : "AI 初审正在执行。请保持此标签页打开，最终结果或具体错误会直接显示在这里。",
    );
    try {
      const result = await adminRequest({ action: "retry_ai_review", id: item.id });
      await loadQueue();
      if (result.aiReview?.status === "completed") {
        setNotice(
          english
            ? "AI review completed. Its recommendation is ready for human moderation."
            : "AI 初审已完成，建议结果现可供人工终审。",
        );
      } else {
        setState("error");
        setNotice(
          english
            ? `AI review failed: ${result.aiReview?.error ?? "unknown error"}`
            : `AI 初审失败：${result.aiReview?.error ?? "未知错误"}`,
        );
      }
    } catch (error) {
      setState("error");
      const reason = error instanceof Error ? error.message : "request_failed";
      setNotice(
        english
          ? `Could not run AI review: ${reason}`
          : `无法执行 AI 初审：${reason}`,
      );
    }
  }

  async function exportBackup() {
    setState("loading");
    setNotice("");
    try {
      const allMessages: ModerationMessage[] = [];
      let offset = 0;
      let exportedAt = new Date().toISOString();
      let total = 0;
      do {
        const result = await adminRequest({
          action: "admin_export",
          offset,
          limit: 250,
        });
        allMessages.push(...(result.messages ?? []));
        exportedAt = result.exportedAt ?? exportedAt;
        total = result.total ?? allMessages.length;
        offset = result.nextOffset ?? -1;
      } while (offset >= 0);
      const payload = {
        schemaVersion: 2,
        exportedAt,
        backend: storage?.backend ?? "Cloudflare Durable Object (SQLite-backed storage)",
        automaticDeletion: false,
        total,
        messages: allMessages,
      };
      const objectUrl = URL.createObjectURL(new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json" },
      ));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `community-private-backup-${exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setState("ready");
      setNotice(
        english
          ? `Private backup exported (${allMessages.length} messages). Store it securely.`
          : `私有备份已导出（${allMessages.length} 条留言），请安全保存。`,
      );
    } catch {
      setState("error");
      setNotice(english ? "Could not export the private backup." : "无法导出私有备份。");
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
          {storage ? (
            <div className="moderator-storage-summary">
              <div>
                <Database size={15} />
                <span>
                  {english
                    ? `${storage.storedCount.toLocaleString()} / ${storage.applicationCapacity.toLocaleString()} stored · automatic deletion off`
                    : `已存储 ${storage.storedCount.toLocaleString()} / ${storage.applicationCapacity.toLocaleString()} 条 · 不自动删除`}
                </span>
              </div>
              <button type="button" onClick={() => void exportBackup()} disabled={state === "loading"}>
                <Download size={14} />
                {english ? "Export private backup" : "导出私有备份"}
              </button>
            </div>
          ) : null}
          {aiConfiguration ? (
            <div className={"moderator-ai-diagnostics " + (aiConfiguration.compatible ? "compatible" : "incompatible")}>
              <div className="moderator-ai-diagnostics-head">
                <Bot size={15} />
                <strong>{english ? "AI runtime diagnostics" : "AI 运行诊断"}</strong>
                <span>{aiConfiguration.compatible ? "READY" : "BLOCKED"}</span>
              </div>
              <dl>
                <div><dt>{english ? "API key secret" : "API 密钥 Secret"}</dt><dd>{aiConfiguration.apiKeyConfigured ? "configured" : "missing"}</dd></div>
                <div><dt>{english ? "Model" : "模型"}</dt><dd>{aiConfiguration.model}</dd></div>
                <div><dt>{english ? "Effective endpoint" : "实际端点"}</dt><dd>{aiConfiguration.endpoint ? `${aiConfiguration.endpoint.protocol}://${aiConfiguration.endpoint.hostname}:${aiConfiguration.endpoint.port}${aiConfiguration.endpoint.path}` : "—"}</dd></div>
                <div><dt>{english ? "Background queue" : "后台队列"}</dt><dd>{aiRuntime ? `${aiRuntime.queuedCount} · alarm ${aiRuntime.alarmScheduledAt ?? "none"}` : "—"}</dd></div>
                <div className="wide"><dt>{english ? "Configuration note" : "配置说明"}</dt><dd>{aiConfiguration.issue ?? aiConfiguration.warning ?? "none"}</dd></div>
              </dl>
              {!aiConfiguration.compatible ? (
                <p>
                  {english
                    ? "Cloudflare Workers cannot fetch an IP-literal AI URL. Configure COMMUNITY_AI_BASE_URL with a DNS hostname; the API key value remains hidden."
                    : "Cloudflare Workers 无法请求使用裸 IP 的 AI URL。请把 COMMUNITY_AI_BASE_URL 配置为带 DNS 主机名的地址；API 密钥值始终隐藏。"}
                </p>
              ) : null}
              {aiConfiguration.warning ? (
                <p className="warning">
                  {english
                    ? `The configured IP hostname ${aiConfiguration.endpoint?.configuredHostname ?? ""} is being replaced with the verified DNS hostname shown above. Move the gateway to HTTPS before production use.`
                    : `配置中的 IP 主机名 ${aiConfiguration.endpoint?.configuredHostname ?? ""} 已替换为上方经验证的 DNS 主机名。正式生产使用前应把网关迁移到 HTTPS。`}
                </p>
              ) : null}
            </div>
          ) : null}
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
              const aiFailed = item.aiReview?.status === "failed";
              const awaitingDecision = item.status === "ai_pending" || item.status === "human_pending";
              const editingRevision = editingReviewId === item.id;
              const overrideReady = aiFailed && decision.note.trim().length >= 12;
              const revisionReady = !editingRevision || decision.note.trim().length >= 12;
              const approvalReady = editingRevision ? revisionReady : aiComplete || overrideReady;
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
                    <div><dt>{english ? "AI suggested category" : "AI 建议分类"}</dt><dd>{item.aiReview?.category ?? "—"}</dd></div>
                    <div><dt>{english ? "Summary" : "摘要"}</dt><dd>{item.aiReview?.summary || "—"}</dd></div>
                    <div><dt>{english ? "Rationale" : "理由"}</dt><dd>{item.aiReview?.rationale || "—"}</dd></div>
                    <div><dt>{english ? "Risk flags" : "风险标记"}</dt><dd>{item.aiReview?.riskFlags?.join(", ") || "none"}</dd></div>
                    <div><dt>{english ? "Finish reason" : "结束原因"}</dt><dd>{item.aiReview?.finishReason ?? "—"}</dd></div>
                    <div><dt>max_tokens</dt><dd>{item.aiReview?.maxTokens?.toLocaleString() ?? "—"}</dd></div>
                    <div><dt>{english ? "Request stage" : "请求阶段"}</dt><dd>{item.aiReview?.requestStage ?? "—"}</dd></div>
                    <div><dt>{english ? "Attempt" : "尝试次数"}</dt><dd>{item.aiReview?.attemptCount ?? "—"}</dd></div>
                    <div><dt>{english ? "Attempt started" : "尝试开始"}</dt><dd>{item.aiReview?.attemptStartedAt ? new Date(item.aiReview.attemptStartedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                    <div><dt>{english ? "Attempt completed" : "尝试结束"}</dt><dd>{item.aiReview?.attemptCompletedAt ? new Date(item.aiReview.attemptCompletedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                    <div className="wide"><dt>{english ? "AI error" : "AI 错误"}</dt><dd>{item.aiReview?.error || "—"}</dd></div>
                    <div><dt>{english ? "Reviewed at" : "初审时间"}</dt><dd>{item.aiReview?.reviewedAt ? new Date(item.aiReview.reviewedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                  </dl>
                  {awaitingDecision || editingRevision ? (
                    <>
                      {aiFailed ? (
                        <p className="ai-failure-override-note">
                          {english
                            ? "AI review failed. You may retry it, reject this message immediately, or choose a public category and add a private note of at least 12 characters to approve with a recorded human override."
                            : "AI 初审失败。你可以重试、直接拒绝；也可以选择公开分类并填写至少 12 个字符的内部备注，以有审计记录的人工覆盖方式通过。"}
                        </p>
                      ) : null}
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
                            placeholder={editingRevision ? (english ? "Required: explain why the completed decision is changing (12+ characters)" : "必填：说明修改已完成审核的原因（至少 12 个字符）") : undefined}
                          />
                        </label>
                      </div>
                      <footer>
                        {aiFailed && awaitingDecision ? (
                          <button type="button" disabled={state === "loading"} onClick={() => void retryAi(item)}>
                            <RotateCcw size={14} />{english ? "Retry AI review" : "重试 AI 初审"}
                          </button>
                        ) : null}
                        {editingRevision ? (
                          <button type="button" disabled={state === "loading"} onClick={() => setEditingReviewId("")}>
                            {english ? "Cancel update" : "取消修改"}
                          </button>
                        ) : null}
                        <button type="button" className="reject" disabled={state === "loading" || !revisionReady} onClick={() => void decide(item, "rejected")}>
                          <X size={14} />{editingRevision ? (english ? "Update to rejected" : "更新为不通过") : (english ? "Reject" : "拒绝")}
                        </button>
                        <button type="button" className="approve" disabled={!approvalReady || state === "loading"} onClick={() => void decide(item, "approved")}>
                          <Check size={14} />{editingRevision
                            ? english ? "Update to approved" : "更新为通过"
                            : aiFailed
                              ? english ? "Approve with override" : "人工覆盖通过"
                              : english ? "Approve and publish" : "通过并公开"}
                        </button>
                      </footer>
                    </>
                  ) : (
                    <>
                      <dl className="human-review-record">
                        <div><dt>{english ? "Human decision" : "人工结论"}</dt><dd>{item.humanReview?.status ?? item.status}</dd></div>
                        <div><dt>{english ? "Reviewer" : "审核人"}</dt><dd>{item.humanReview?.reviewer ?? "—"}</dd></div>
                        <div><dt>{english ? "Final category" : "最终分类"}</dt><dd>{item.humanReview?.category ?? item.category ?? "—"}</dd></div>
                        <div><dt>{english ? "Reviewed at" : "终审时间"}</dt><dd>{item.humanReview?.reviewedAt ? new Date(item.humanReview.reviewedAt).toLocaleString(english ? "en-US" : "zh-CN") : "—"}</dd></div>
                        <div><dt>{english ? "Revision" : "审核版本"}</dt><dd>{item.humanReview?.revision ?? item.humanReviewHistory?.length ?? 1}</dd></div>
                        <div className="wide"><dt>{english ? "Private review note" : "内部审核备注"}</dt><dd>{item.humanReview?.note || "—"}</dd></div>
                        {item.humanReview?.aiOverride ? (
                          <div className="wide"><dt>{english ? "AI failure override" : "AI 失败人工覆盖"}</dt><dd>{item.humanReview.aiErrorAtDecision || "recorded"}</dd></div>
                        ) : null}
                      </dl>
                      {(item.humanReviewHistory?.length ?? 0) > 1 ? (
                        <details className="human-review-history">
                          <summary>{english ? `View ${item.humanReviewHistory!.length} audit decisions` : `查看 ${item.humanReviewHistory!.length} 条审核记录`}</summary>
                          <ol>
                            {item.humanReviewHistory!.map((review, index) => (
                              <li key={`${review.reviewedAt}-${index}`}>
                                <b>#{review.revision ?? index + 1} · {review.status}</b>
                                <span>{review.reviewer} · {new Date(review.reviewedAt).toLocaleString(english ? "en-US" : "zh-CN")}</span>
                                <p>{review.note || "—"}</p>
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                      <footer>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingReviewId(item.id);
                            setDecisions((current) => ({
                              ...current,
                              [item.id]: {
                                category: item.humanReview?.category ?? item.category ?? "other",
                                note: "",
                              },
                            }));
                          }}
                        >
                          <Pencil size={14} />{english ? "Update human review" : "更新人工审核"}
                        </button>
                      </footer>
                    </>
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
