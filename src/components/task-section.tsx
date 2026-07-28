"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Heart,
  Lightbulb,
  Network,
  Sigma,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { BenchmarkData, Language, Task } from "../lib/types";

function constraintLabels(task: Task, english: boolean) {
  const dimension = task.constraints.dimension;
  const common = english
    ? [
        `ℂ${dimension === 3 ? "³" : "²"} polynomial map`,
        "det J_F ∈ ℂ×",
        "Algebraic coefficients",
      ]
    : [
        `ℂ${dimension === 3 ? "³" : "²"} 多项式映射`,
        "det J_F ∈ ℂ×",
        "代数系数",
      ];

  const taskSpecific: Record<Task["key"], string[]> = english
    ? {
        P1: ["No degree bound", "≥ 2-point collision", "Novel up to equivalence"],
        P2: ["deg F ≤ 7", "≥ 2-point collision", "Novel up to equivalence"],
        P3: ["deg F < 7", "≥ 2-point collision", "Record target"],
        P4: [
          "generic fiber degree = 4 target",
          "deg F ≤ 11",
          "4-point fiber witness",
          "Beat known degree 12",
        ],
        P5: ["No degree bound", "≥ 2-point collision", "Open frontier"],
      }
    : {
        P1: ["无次数上限", "至少二点碰撞", "模等价意义下新颖"],
        P2: ["deg F ≤ 7", "至少二点碰撞", "模等价意义下新颖"],
        P3: ["deg F < 7", "至少二点碰撞", "纪录目标"],
        P4: [
          "一般纤维度数 = 4 研究目标",
          "deg F ≤ 11",
          "四点纤维见证",
          "突破已知 12 次",
        ],
        P5: ["无次数上限", "至少二点碰撞", "开放前沿"],
      };

  return [...common, ...taskSpecific[task.key]];
}

export function TaskSection({
  data,
  likes,
  likedTasks,
  onLike,
  communityOnline,
  language,
}: {
  data: BenchmarkData;
  likes: Record<Task["key"], number>;
  likedTasks: Task["key"][];
  onLike: (task: Task["key"]) => Promise<"liked" | "unliked" | "error">;
  communityOnline: boolean;
  language: Language;
}) {
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const english = language === "en";

  async function copySource(key: string, source: string) {
    await navigator.clipboard.writeText(source);
    setCopied(key);
    window.setTimeout(
      () => setCopied((current) => (current === key ? "" : current)),
      1400,
    );
  }

  async function handleLike(task: Task["key"]) {
    const result = await onLike(task);
    setNotice((current) => ({
      ...current,
      [task]:
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
        <h2>{english ? "Five problems, one capability curve" : "五级问题，一条能力曲线"}</h2>
        <p>
          {english
            ? "The benchmark moves from unconstrained construction in three variables to lower-degree, higher-fiber, and open two-dimensional frontiers. Every task shares one mathematical premise while isolating a different research capability."
            : "从无约束三维构造，到仍处研究前沿的二维问题。所有题目共享同一背景，但分别施加新颖性、次数或纤维大小约束。"}
        </p>
      </div>

      <details className="shared-context" open>
        <summary>
          <span>
            <Network size={19} />{" "}
            {english ? "Shared mathematical context" : "所有题目的共享背景"}
          </span>
          <ChevronDown size={19} />
        </summary>
        <div>
          <MathText>{data.dataset.context}</MathText>
          <button
            className="copy-mini"
            onClick={() =>
              void copySource("shared-context", data.dataset.context)
            }
          >
            <Copy size={15} />{" "}
            {copied === "shared-context"
              ? english
                ? "Copied"
                : "已复制"
              : english
                ? "Copy source prompt"
                : "复制原文"}
          </button>
        </div>
      </details>

      <div className="task-scale" aria-label="Task difficulty scale">
        <span>{english ? "Open exploration" : "开放搜索"}</span>
        <i />
        <span>{english ? "Structural constraints" : "结构约束"}</span>
        <i />
        <span>{english ? "Research frontier" : "数学前沿"}</span>
      </div>

      <div className="task-list">
        {data.dataset.tasks.map((task, index) => {
          const title = english ? task.title : task.titleZh;
          const subtitle = english ? task.subtitle : task.subtitleZh;
          const tierLabel = english ? task.tierLabel : task.tierLabelZh;
          const capability = english ? task.capability : task.capabilityZh;
          const significance = english
            ? task.significance
            : task.significanceZh;
          const constraints = constraintLabels(task, english);
          return (
            <article className="task-card" key={task.id}>
              <div className="task-index">{task.key}</div>
              <div className="task-main">
                <div className="task-heading">
                  <div>
                    <span className="tier">{tierLabel}</span>
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
                  <MathText>
                    {english ? task.question : task.questionZh}
                  </MathText>
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

                <div className="task-details-grid">
                  <details>
                    <summary>
                      <span>{english ? "Problem prompt" : "英文原题"}</span>
                      <ChevronDown size={17} />
                    </summary>
                    <MathText>{task.question}</MathText>
                    <button
                      className="detail-copy"
                      onClick={() =>
                        void copySource(`${task.key}-question`, task.question)
                      }
                    >
                      <Copy size={14} />{" "}
                      {copied === `${task.key}-question`
                        ? english
                          ? "Copied"
                          : "已复制"
                        : english
                          ? "Copy LaTeX source"
                          : "复制 LaTeX 源码"}
                    </button>
                  </details>
                  <details>
                    <summary>
                      <span>
                        <Lightbulb size={16} />{" "}
                        {english ? "Hint & boundary" : "提示与边界"}
                      </span>
                      <ChevronDown size={17} />
                    </summary>
                    <MathText>{task.hint}</MathText>
                    <button
                      className="detail-copy"
                      onClick={() =>
                        void copySource(`${task.key}-hint`, task.hint)
                      }
                    >
                      <Copy size={14} />{" "}
                      {copied === `${task.key}-hint`
                        ? english
                          ? "Copied"
                          : "已复制"
                        : english
                          ? "Copy LaTeX source"
                          : "复制 LaTeX 源码"}
                    </button>
                  </details>
                </div>
              </div>
              <div className="task-actions">
                <button
                  className={likedTasks.includes(task.key) ? "liked" : ""}
                  onClick={() => void handleLike(task.key)}
                  disabled={!communityOnline}
                  title={
                    communityOnline
                      ? english
                        ? likedTasks.includes(task.key)
                          ? "Unfollow this research problem"
                          : "Follow this research problem"
                        : likedTasks.includes(task.key)
                          ? "取消关注这个研究问题"
                          : "关注这个研究问题"
                      : english
                        ? "Community backend unavailable"
                        : "社区后端暂不可用"
                  }
                >
                  <Heart
                    size={18}
                    fill={
                      likedTasks.includes(task.key) ? "currentColor" : "none"
                    }
                  />
                  <b>{likes[task.key]}</b>
                  <span>
                    {notice[task.key] ??
                      (likedTasks.includes(task.key)
                        ? english
                          ? "Following"
                          : "已关注"
                        : english
                          ? "Follow"
                          : "关注")}
                  </span>
                </button>
                <span className="task-order">
                  {String(index + 1).padStart(2, "0")} / 05
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <p className="novelty-footnote">
        {english ? (
          <>
            P1–P2 require a genuinely new counterexample. The offline program
            verifies the submitted algebraic certificate but does not decide
            global algebraic inequivalence; novelty is reported separately as{" "}
            <code>not_machine_verified</code>. For P4, it verifies the
            four-point witness and degree bound, while exact generic fiber
            degree remains <code>not_machine_verified</code>. Neither boundary
            is delegated to an LLM judge.
          </>
        ) : (
          <>
            注：P1–P2 的“新反例”要求目前不能由离线程序完全判定；程序只验证代数证书，
            新颖性状态单独标记为 <code>not_machine_verified</code>。P4
            可核验四点纤维见证与次数上限，但精确的一般纤维度数仍标记为{" "}
            <code>not_machine_verified</code>；两者均不以语言模型代判。
          </>
        )}
      </p>
    </section>
  );
}

function MathText({ children }: { children: string }) {
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
