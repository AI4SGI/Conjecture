"use client";

import { Check, ChevronDown, Copy, Heart, Lightbulb, Network, Sigma } from "lucide-react";
import { useState } from "react";
import type { BenchmarkData, Task } from "../lib/types";

export function TaskSection({
  data,
  likes,
  onLike,
  communityOnline,
}: {
  data: BenchmarkData;
  likes: Record<Task["key"], number>;
  onLike: (task: Task["key"]) => Promise<"liked" | "duplicate" | "error">;
  communityOnline: boolean;
}) {
  const [notice, setNotice] = useState<Record<string, string>>({});

  async function handleLike(task: Task["key"]) {
    const result = await onLike(task);
    setNotice((current) => ({
      ...current,
      [task]:
        result === "liked"
          ? "已关注"
          : result === "duplicate"
            ? "你已关注"
            : "稍后重试",
    }));
  }

  return (
    <section className="benchmark section-shell" id="benchmark">
      <div className="section-lead">
        <span className="section-index">02 / BENCHMARK</span>
        <h2>五级任务，一条能力曲线</h2>
        <p>
          从无约束三维构造，到仍处研究前沿的二维问题。所有题目共享同一背景，
          但分别施加新颖性、次数或纤维大小约束。
        </p>
      </div>

      <details className="shared-context">
        <summary>
          <span><Network size={17} /> 所有题目的共享背景</span>
          <ChevronDown size={17} />
        </summary>
        <div>
          <p>{data.dataset.context}</p>
          <button
            className="copy-mini"
            onClick={() => navigator.clipboard.writeText(data.dataset.context)}
          >
            <Copy size={13} /> 复制原文
          </button>
        </div>
      </details>

      <div className="task-scale" aria-label="任务难度尺度">
        <span>开放搜索</span>
        <i />
        <span>结构约束</span>
        <i />
        <span>数学前沿</span>
      </div>

      <div className="task-list">
        {data.dataset.tasks.map((task, index) => (
          <article className="task-card" key={task.id}>
            <div className="task-index">{task.key}</div>
            <div className="task-main">
              <div className="task-heading">
                <div>
                  <span className="tier">{task.tierLabel} · {task.tier}</span>
                  <h3>{task.title}</h3>
                  <p>{task.subtitle}</p>
                </div>
                <div className="capability">
                  <Sigma size={16} />
                  <span>考察能力</span>
                  <b>{task.capability}</b>
                </div>
              </div>

              <p className="task-question">{task.questionZh}</p>

              <div className="constraint-row">
                <span><Check size={13} /> {task.constraints.dimension} 变量</span>
                <span><Check size={13} /> 非零常雅可比</span>
                <span><Check size={13} /> ≥ {task.constraints.min_points} 个代数点</span>
                {task.objective.value && (
                  <span><Check size={13} /> max degree ≤ {task.objective.value}</span>
                )}
                <span><Check size={13} /> 代数系数</span>
              </div>

              <div className="task-significance">
                <span>为什么重要</span>
                <p>{task.significance}</p>
              </div>

              <div className="task-details-grid">
                <details>
                  <summary><span>英文原题</span><ChevronDown size={15} /></summary>
                  <p>{task.question}</p>
                </details>
                <details>
                  <summary><span><Lightbulb size={14} /> 提示与边界</span><ChevronDown size={15} /></summary>
                  <p>{task.hint}</p>
                </details>
              </div>
            </div>
            <div className="task-actions">
              <button
                onClick={() => void handleLike(task.key)}
                disabled={!communityOnline}
                title={communityOnline ? "关注这个研究问题" : "社区后端暂不可用"}
              >
                <Heart size={16} />
                <b>{likes[task.key]}</b>
                <span>{notice[task.key] ?? "关注"}</span>
              </button>
              <span className="task-order">{String(index + 1).padStart(2, "0")} / 05</span>
            </div>
          </article>
        ))}
      </div>
      <p className="novelty-footnote">
        注：P1–P2 的“新反例”要求目前不能由离线程序完全判定；程序只验证代数证书，
        新颖性状态单独标记为 <code>not_machine_verified</code>，不以语言模型代判。
      </p>
    </section>
  );
}
