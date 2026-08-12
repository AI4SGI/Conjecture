"use client";

import { Check, ChevronDown, Copy, Heart, Lightbulb, Network, Sigma } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { BenchmarkData, ConjectureData, Language } from "../lib/types";

export function TaskSection({
  data,
  content,
  conjectureId,
  likes,
  likedTasks,
  onLike,
  communityOnline,
  language,
}: {
  data: BenchmarkData;
  content: ConjectureData["benchmark"];
  conjectureId: string;
  likes: Record<string, number>;
  likedTasks: string[];
  onLike: (conjectureId: string, task: string) => Promise<"liked" | "unliked" | "error">;
  communityOnline: boolean;
  language: Language;
}) {
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const english = language === "en";

  async function copySource(key: string, source: string) {
    await navigator.clipboard.writeText(source);
    setCopied(key);
    window.setTimeout(() => setCopied((value) => (value === key ? "" : value)), 1400);
  }

  async function handleLike(task: string) {
    const target = `${conjectureId}:${task}`;
    const result = await onLike(conjectureId, task);
    setNotice((current) => ({
      ...current,
      [target]:
        result === "liked"
          ? english
            ? "Following"
            : "已关注"
          : result === "unliked"
            ? english
              ? "Follow"
              : "关注"
            : english
              ? "Try later"
              : "稍后重试",
    }));
  }

  return (
    <section className="benchmark section-shell" id="benchmark">
      <div className="section-lead">
        <span className="section-index">02 / BENCHMARK</span>
        <h2>{english ? content.title : content.titleZh}</h2>
        <p>{english ? content.body : content.bodyZh}</p>
      </div>

      <details className="shared-context" open>
        <summary>
          <span>
            <Network size={19} /> {english ? content.contextLabel : content.contextLabelZh}
          </span>
          <ChevronDown size={19} />
        </summary>
        <div>
          <MathText>{data.dataset.context}</MathText>
          <button
            className="copy-mini"
            onClick={() => void copySource("shared-context", data.dataset.context)}
          >
            <Copy size={15} /> {copied === "shared-context" ? (english ? "Copied" : "已复制") : english ? "Copy source" : "复制原文"}
          </button>
        </div>
      </details>

      <div className="hint-policy-note">
        <Lightbulb size={17} />
        <span>{english ? content.hintNote : content.hintNoteZh}</span>
      </div>

      <div className="task-list">
        {data.dataset.tasks.map((task, index) => {
          const title = english ? task.title : task.titleZh;
          const subtitle = english ? task.subtitle : task.subtitleZh;
          const tier = english ? task.tier : task.tierZh;
          const capability = english ? task.capability : task.capabilityZh;
          const significance = english ? task.significance : task.significanceZh;
          const constraints = english
            ? task.verificationConditions ?? []
            : task.verificationConditionsZh ?? task.verificationConditions ?? [];
          const followKey = `${conjectureId}:${task.key}`;
          return (
            <article className="task-card" key={task.id}>
              <div className="task-index">{task.key}</div>
              <div className="task-main">
                <div className="task-heading">
                  <div>
                    <span className="tier">{tier}</span>
                    <h3>{title}</h3>
                    <p>{subtitle}</p>
                  </div>
                  <div className="capability">
                    <Sigma size={18} />
                    <span>{english ? "Capability" : "考察能力"}</span>
                    <b>{capability}</b>
                  </div>
                </div>

                <div className="task-question">
                  <MathText>{english ? task.question : task.questionZh}</MathText>
                </div>

                <div className="constraint-row">
                  {constraints.map((constraint) => (
                    <span key={constraint}>
                      <Check size={15} /> {constraint}
                    </span>
                  ))}
                </div>

                <div className="task-significance">
                  <span>{english ? "Why it matters" : "为什么重要"}</span>
                  <p>{significance}</p>
                </div>

                <div className={`task-details-grid ${task.hint ? "" : "single"}`}>
                  <details>
                    <summary>
                      <span>{english ? "Full problem prompt" : "完整英文题目"}</span>
                      <ChevronDown size={17} />
                    </summary>
                    <MathText>{task.question}</MathText>
                    <button className="detail-copy" onClick={() => void copySource(`${task.key}-question`, task.question)}>
                      <Copy size={14} /> {copied === `${task.key}-question` ? (english ? "Copied" : "已复制") : english ? "Copy LaTeX source" : "复制 LaTeX 源码"}
                    </button>
                  </details>
                  {task.hint ? (
                    <details>
                      <summary>
                        <span><Lightbulb size={16} /> {english ? "Hint & boundary" : "提示与边界"}</span>
                        <ChevronDown size={17} />
                      </summary>
                      <MathText>{task.hint}</MathText>
                      <button className="detail-copy" onClick={() => void copySource(`${task.key}-hint`, task.hint)}>
                        <Copy size={14} /> {copied === `${task.key}-hint` ? (english ? "Copied" : "已复制") : english ? "Copy LaTeX source" : "复制 LaTeX 源码"}
                      </button>
                    </details>
                  ) : null}
                </div>
              </div>
              <div className="task-actions">
                <button
                  className={likedTasks.includes(followKey) ? "liked" : ""}
                  onClick={() => void handleLike(task.key)}
                  disabled={!communityOnline}
                  title={communityOnline ? (english ? "Follow this research problem" : "关注这个研究问题") : english ? "Community backend unavailable" : "社区后端暂不可用"}
                >
                  <Heart size={18} fill={likedTasks.includes(followKey) ? "currentColor" : "none"} />
                  <b>{likes[followKey] ?? 0}</b>
                  <span>{notice[followKey] ?? (likedTasks.includes(followKey) ? (english ? "Following" : "已关注") : english ? "Follow" : "关注")}</span>
                </button>
                <span className="task-order">
                  {String(index + 1).padStart(2, "0")} / {String(data.dataset.taskCount).padStart(2, "0")}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <p className="novelty-footnote">{english ? content.footer : content.footerZh}</p>
    </section>
  );
}

export function MathText({ children }: { children: string }) {
  const normalized = children
    .replaceAll(String.raw`\[`, "\n$$\n")
    .replaceAll(String.raw`\]`, "\n$$\n")
    .replaceAll(String.raw`\(`, "$")
    .replaceAll(String.raw`\)`, "$");
  return (
    <div className="prompt-math">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
