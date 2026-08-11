"use client";

import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Eye,
  Heart,
  Maximize2,
  MessageSquarePlus,
  PencilLine,
  Send,
  ShieldCheck,
  Sparkles,
  Tags,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommunityCategory, CommunitySnapshot, ConjectureData, Language } from "../lib/types";
import { CommunityModerator } from "./community-moderator";
import { MathText } from "./task-section";

type PublicCommunityMessage = CommunitySnapshot["messages"][number];
type MessageLanguage = "en" | "zh";
type OriginalMessageLanguage = MessageLanguage | "other";
type MessageDisplayMode = "default" | MessageLanguage;

const MESSAGES_PER_PAGE = 5;

function normalizeConjectureId(value?: string) {
  return !value || value === "jacobian" ? "jacobian_conjecture" : value;
}

function originalMessageLanguage(item: PublicCommunityMessage): OriginalMessageLanguage {
  if (item.translations?.originalLanguage) return item.translations.originalLanguage;
  return /[\u3400-\u9FFF]/u.test(item.title + item.body) ? "zh" : "en";
}

function capitalizeFirstWord(value: string, language: OriginalMessageLanguage) {
  const index = value.search(/\p{L}/u);
  if (index < 0) return value;
  return value.slice(0, index)
    + value[index].toLocaleUpperCase(
      language === "zh" ? "zh-CN" : language === "en" ? "en-US" : undefined,
    )
    + value.slice(index + 1);
}

const COMMUNITY_CATEGORIES: CommunityCategory[] = [
  "research_question",
  "counterexample_direction",
  "verification_gap",
  "benchmark_feedback",
  "other",
];

const CATEGORY_LABELS: Record<CommunityCategory, { en: string; zh: string }> = {
  research_question: { en: "Research questions", zh: "研究问题" },
  counterexample_direction: { en: "Counterexample directions", zh: "反例方向" },
  verification_gap: { en: "Verification gaps", zh: "验证漏洞" },
  benchmark_feedback: { en: "Benchmark feedback", zh: "评测反馈" },
  other: { en: "Other notes", zh: "其他留言" },
};

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
  const [categoryFilter, setCategoryFilter] = useState<CommunityCategory | "all">("all");
  const [form, setForm] = useState({
    nickname: "",
    email: "",
    conjecture: activeConjectureId,
    title: "",
    body: "",
    task: "general",
    website: "",
  });
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [messagePage, setMessagePage] = useState(0);
  const [messageLanguages, setMessageLanguages] = useState<Record<string, MessageDisplayMode>>({});
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [expandedMessageId, setExpandedMessageId] = useState("");
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

  useEffect(() => {
    if (!expandedMessageId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedMessageId("");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedMessageId]);

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
    setMessagePage(0);
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
          formStartedAt,
        }),
      });
      const result = (await response.json()) as { error?: string; submittedAt?: string };
      if (!response.ok) throw new Error(result.error ?? "submit_failed");
      setStatus("submitted");
      setMessage(
        english
          ? "Submission recorded. It will be screened by a strong AI model and then decided by a human moderator before publication."
          : "留言已记录。内容将先由强模型 AI 初审，再由人工终审确认；通过后才会公开。",
      );
      setForm({
        nickname: "",
        email: "",
        conjecture: activeConjectureId,
        title: "",
        body: "",
        task: "general",
        website: "",
      });
      setFormStartedAt(Date.now());
      setEditorMode("write");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus("error");
      const knownMessage = reason === "rate_limited"
        ? english ? "Submission limit reached. Please try again later." : "提交频率已达上限，请稍后再试。"
        : reason === "invalid_email"
          ? english ? "Enter a valid contact email address." : "请输入有效的联系邮箱。"
        : reason === "duplicate_submission"
          ? english ? "An identical message is already in the review system." : "审核系统中已存在相同留言。"
          : reason === "suspicious_submission" || reason === "invalid_request"
            ? english ? "The submission did not pass the safety checks." : "留言未通过提交安全检查。"
            : english ? "Submission failed. Please try again later." : "提交未成功，请稍后重试。";
      setMessage(knownMessage);
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

  function displayedLanguage(item: PublicCommunityMessage): MessageDisplayMode {
    return messageLanguages[item.id] ?? "default";
  }

  function displayedMessage(item: PublicCommunityMessage) {
    const originalLanguage = originalMessageLanguage(item);
    const selectedLanguage = displayedLanguage(item);
    if (selectedLanguage === "default" || selectedLanguage === originalLanguage) {
      return { title: item.title, body: item.body, language: originalLanguage };
    }
    const translation = item.translations?.[selectedLanguage];
    return translation?.title && translation.body
      ? { ...translation, language: selectedLanguage }
      : { title: item.title, body: item.body, language: originalLanguage };
  }

  function canDisplayLanguage(item: PublicCommunityMessage, target: MessageDisplayMode) {
    return target === "default"
      || target === originalMessageLanguage(item)
      || Boolean(item.translations?.[target]?.title && item.translations?.[target]?.body);
  }

  function setDisplayedLanguage(item: PublicCommunityMessage, target: MessageDisplayMode) {
    if (!canDisplayLanguage(item, target)) return;
    setMessageLanguages((current) => ({ ...current, [item.id]: target }));
  }

  async function copyOriginalMessage(item: PublicCommunityMessage) {
    try {
      await navigator.clipboard.writeText(item.body);
      setCopiedMessageId(item.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => current === item.id ? "" : current);
      }, 1_500);
    } catch {
      setCopiedMessageId("");
    }
  }

  const visibleMessages = snapshot.messages.filter(
    (item) =>
      (conjectureFilter === "all" ||
        normalizeConjectureId(item.conjecture) === conjectureFilter) &&
      (taskFilter === "all" || item.task === taskFilter) &&
      (categoryFilter === "all" || (item.category ?? "other") === categoryFilter),
  );
  const totalMessagePages = Math.max(1, Math.ceil(visibleMessages.length / MESSAGES_PER_PAGE));
  const pageMessages = visibleMessages.slice(
    messagePage * MESSAGES_PER_PAGE,
    (messagePage + 1) * MESSAGES_PER_PAGE,
  );
  const groupedMessages = COMMUNITY_CATEGORIES
    .map((category) => ({
      category,
      total: visibleMessages.filter((item) => (item.category ?? "other") === category).length,
      messages: pageMessages.filter((item) => (item.category ?? "other") === category),
    }))
    .filter((group) => group.messages.length);
  const expandedMessage = snapshot.messages.find((item) => item.id === expandedMessageId);
  const expandedLocalized = expandedMessage ? displayedMessage(expandedMessage) : null;

  useEffect(() => {
    setMessagePage(0);
  }, [conjectureFilter, taskFilter, categoryFilter]);

  useEffect(() => {
    setMessagePage((current) => Math.min(current, totalMessagePages - 1));
  }, [totalMessagePages]);

  function languageControls(item: PublicCommunityMessage) {
    const selected = displayedLanguage(item);
    return (
      <div className="message-language-toggle" aria-label={english ? "Message language" : "留言语言"}>
        {(["default", "en", "zh"] as const).map((target) => (
          <button
            type="button"
            key={target}
            className={selected === target ? "active" : ""}
            disabled={!canDisplayLanguage(item, target)}
            onClick={() => setDisplayedLanguage(item, target)}
            aria-pressed={selected === target}
            title={target === "default"
              ? english ? "Show original message" : "显示原始留言"
              : target.toUpperCase()}
          >
            {target === "default" ? "DEF" : target.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  function renderMessageCard(item: PublicCommunityMessage) {
    const normalizedConjecture = normalizeConjectureId(item.conjecture);
    const timestamp = item.submittedAt ?? item.createdAt;
    const localized = displayedMessage(item);
    return (
      <article key={item.id} className="message-item">
        <div className="message-card-heading">
          <h4>{capitalizeFirstWord(localized.title, localized.language)}</h4>
          <div className="message-card-actions">
            {languageControls(item)}
            <button
              type="button"
              className={copiedMessageId === item.id ? "copied" : ""}
              onClick={() => void copyOriginalMessage(item)}
              aria-label={english ? "Copy original message" : "复制留言原文"}
              title={english ? "Copy original Markdown" : "复制原始 Markdown"}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              onClick={() => setExpandedMessageId(item.id)}
              aria-label={english ? "Expand message" : "放大留言"}
              title={english ? "Expand message" : "放大留言"}
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        <div className="message-card-meta">
          <span className="message-author">— {item.nickname}</span>
          <div className="message-tags">
            <span className="message-conjecture">{conjectureLabel(normalizedConjecture)}</span>
            <span className="message-task">{taskLabel(normalizedConjecture, item.task)}</span>
          </div>
        </div>
        <div className="message-content" tabIndex={0}>
          <MathText>{localized.body}</MathText>
        </div>
        <footer>
          <div>
            <time dateTime={timestamp} title={timestamp}>
              {new Date(timestamp).toLocaleString(
                english ? "en-US" : "zh-CN",
                { dateStyle: "medium", timeStyle: "medium" },
              )}
            </time>
            <span className="message-review-badges">
              {item.aiScreened ? <b><Bot size={12} />AI SCREENED</b> : null}
              {item.humanApproved ? <b><UserCheck size={12} />HUMAN APPROVED</b> : null}
            </span>
          </div>
          <button type="button" onClick={() => void likeMessage(item.id)}>
            <Heart size={14} /> {item.likes}
          </button>
        </footer>
      </article>
    );
  }

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

      <div className="community-review-pipeline" aria-label={english ? "Message review workflow" : "留言审核流程"}>
        {[
          { icon: Send, index: "01", en: "Interactive submission", zh: "互动提交", enNote: "Markdown research note", zhNote: "Markdown 研究留言" },
          { icon: Database, index: "02", en: "Secure record", zh: "安全记录", enNote: "UTC timestamp · abuse controls", zhNote: "UTC 时间戳 · 防滥用" },
          { icon: Bot, index: "03", en: "Strong-model review", zh: "强模型初审", enNote: "Safety · relevance · category", zhNote: "安全 · 相关性 · 分类" },
          { icon: UserCheck, index: "04", en: "Human decision", zh: "人工终审", enNote: "Explicit approval required", zhNote: "必须明确人工通过" },
          { icon: Tags, index: "05", en: "Categorized publication", zh: "分类公开", enNote: "Only approved messages", zhNote: "仅展示通过留言" },
        ].map((step) => (
          <div key={step.index}>
            <span>{step.index}</span>
            <step.icon size={18} />
            <b>{english ? step.en : step.zh}</b>
            <small>{english ? step.enNote : step.zhNote}</small>
          </div>
        ))}
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
            <label>
              <span>{english ? "Category" : "分类"}</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CommunityCategory | "all")}
              >
                <option value="all">{english ? "All categories" : "所有分类"}</option>
                {COMMUNITY_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {english ? CATEGORY_LABELS[category].en : CATEGORY_LABELS[category].zh}
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
          ) : groupedMessages.length ? (
            <div className="message-list">
              <div className="message-list-scroll">
                {groupedMessages.map((group) => (
                  <section className="message-category-group" key={group.category}>
                    <div className="message-category-head">
                      <h4>{english ? CATEGORY_LABELS[group.category].en : CATEGORY_LABELS[group.category].zh}</h4>
                      <span>{String(group.total).padStart(2, "0")}</span>
                    </div>
                    {group.messages.map(renderMessageCard)}
                  </section>
                ))}
              </div>
              <nav className="message-pagination" aria-label={english ? "Message pages" : "留言分页"}>
                <button
                  type="button"
                  disabled={messagePage === 0}
                  onClick={() => setMessagePage((current) => Math.max(0, current - 1))}
                  aria-label={english ? "Previous message page" : "上一页留言"}
                >
                  <ChevronLeft size={15} />
                </button>
                <div
                  className="message-page-track"
                  role="progressbar"
                  aria-label={english ? "Message page progress" : "留言页进度"}
                  aria-valuemin={1}
                  aria-valuemax={totalMessagePages}
                  aria-valuenow={messagePage + 1}
                >
                  <span style={{ width: `${((messagePage + 1) / totalMessagePages) * 100}%` }} />
                </div>
                <span className="message-page-count">{messagePage + 1} / {totalMessagePages}</span>
                <button
                  type="button"
                  disabled={messagePage >= totalMessagePages - 1}
                  onClick={() => setMessagePage((current) => Math.min(totalMessagePages - 1, current + 1))}
                  aria-label={english ? "Next message page" : "下一页留言"}
                >
                  <ChevronRight size={15} />
                </button>
              </nav>
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
          <label className="community-honeypot" aria-hidden="true">
            <span>Website</span>
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
            />
          </label>
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
            <span>{english ? "Email" : "联系邮箱"}</span>
            <input
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              aria-label={english ? "Email" : "联系邮箱"}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder={english ? "name@institution.edu" : "name@institution.edu"}
              aria-describedby="community-email-privacy"
            />
            <small className="message-field-note" id="community-email-privacy">
              {english
                ? "Used only for moderation and possible follow-up. Never published or included in AI review."
                : "仅用于审核和必要的后续联系；不会公开，也不会发送给 AI 初审。"}
            </small>
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
              ? "The server records an exact UTC timestamp and applies origin, payload, rate, fingerprint, duplicate, honeypot, and content checks. Contact email stays private. AI never publishes automatically; human approval is mandatory."
              : "服务器记录精确 UTC 时间，并执行来源、载荷、频率、匿名指纹、重复内容、蜜罐与文本安全检查。联系邮箱保持私有；AI 不会自动发布，必须人工明确通过。"}
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
      <CommunityModerator
        apiUrl={apiUrl}
        language={language}
        refreshPublicMessages={() => refresh(sort)}
      />
      {expandedMessage && expandedLocalized ? (
        <div
          className="message-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpandedMessageId("");
          }}
        >
          <article
            className="message-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`expanded-message-${expandedMessage.id}`}
          >
            <header className="message-modal-head">
              <div>
                <span className="micro-label">{english ? "COMMUNITY MESSAGE" : "社区留言"}</span>
                <h3 id={`expanded-message-${expandedMessage.id}`}>
                  {capitalizeFirstWord(expandedLocalized.title, expandedLocalized.language)}
                </h3>
              </div>
              <div className="message-modal-actions">
                {languageControls(expandedMessage)}
                <button
                  type="button"
                  className={copiedMessageId === expandedMessage.id ? "copied" : ""}
                  onClick={() => void copyOriginalMessage(expandedMessage)}
                  aria-label={english ? "Copy original message" : "复制留言原文"}
                  title={english ? "Copy original Markdown" : "复制原始 Markdown"}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedMessageId("")}
                  aria-label={english ? "Close expanded message" : "关闭放大留言"}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="message-modal-meta">
              <span className="message-author">— {expandedMessage.nickname}</span>
              <div className="message-tags">
                <span className="message-conjecture">{conjectureLabel(expandedMessage.conjecture)}</span>
                <span className="message-task">{taskLabel(expandedMessage.conjecture, expandedMessage.task)}</span>
              </div>
            </div>
            <div className="message-modal-scroll" tabIndex={0}>
              <MathText>{expandedLocalized.body}</MathText>
            </div>
            <footer className="message-modal-footer">
              <time dateTime={expandedMessage.submittedAt ?? expandedMessage.createdAt}>
                {new Date(expandedMessage.submittedAt ?? expandedMessage.createdAt).toLocaleString(
                  english ? "en-US" : "zh-CN",
                  { dateStyle: "medium", timeStyle: "medium" },
                )}
              </time>
              <span>{english ? "Scroll to read the complete message" : "滚动阅读完整留言"}</span>
            </footer>
          </article>
        </div>
      ) : null}
    </section>
  );
}
