"use client";

import { CheckCircle2, CircleX, Code2, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { BenchmarkData, ConjectureData, Language } from "../lib/types";
import { MathText } from "./task-section";

const REPOSITORY = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";

export function SymbolicLab({
  conjecture,
  data,
  language,
}: {
  conjecture: ConjectureData;
  data: BenchmarkData;
  language: Language;
}) {
  const english = language === "en";
  const [taskKey, setTaskKey] = useState(data.dataset.tasks[0]?.key ?? "");
  const [copied, setCopied] = useState(false);
  const task = data.dataset.tasks.find((item) => item.key === taskKey) ?? data.dataset.tasks[0];
  const sample = useMemo(
    () => data.records.find((record) => record.taskKey === task?.key),
    [data.records, task?.key],
  );
  const verifierUrl = `https://github.com/${REPOSITORY}/blob/main/${conjecture.symbolicLab.verifierPath}`;

  async function copyFormat() {
    await navigator.clipboard.writeText(task?.outputFormat || conjecture.symbolicLab.outputFormat);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="symbolic-contract section-shell" id="verify">
      <div className="section-lead">
        <span className="section-index">04 / SYMBOLIC LAB</span>
        <h2>{english ? conjecture.symbolicLab.title : conjecture.symbolicLab.titleZh}</h2>
        <p>{english ? conjecture.symbolicLab.body : conjecture.symbolicLab.bodyZh}</p>
      </div>

      {data.dataset.tasks.length > 1 ? (
        <div className="lab-task-tabs" role="tablist" aria-label={english ? "Verifier task" : "验证器题目"}>
          {data.dataset.tasks.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === task?.key}
              className={item.key === task?.key ? "active" : ""}
              onClick={() => setTaskKey(item.key)}
            >
              <b>{item.key}</b>
              <span>{english ? item.title : item.titleZh}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="symbolic-contract-grid">
        <article className="contract-output">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <b>{english ? "Machine-readable output contract" : "机器可读输出协议"}</b>
              <small>{task ? `${task.key} · ${english ? task.title : task.titleZh}` : ""}</small>
            </div>
            <button className="copy-mini" onClick={() => void copyFormat()}>
              <Copy size={14} /> {copied ? (english ? "Copied" : "已复制") : english ? "Copy" : "复制"}
            </button>
          </div>
          <pre><code>{task?.outputFormat || conjecture.symbolicLab.outputFormat}</code></pre>
        </article>

        <article className="contract-checks">
          <div className="panel-heading">
            <span>02</span>
            <div>
              <b>{english ? "Deterministic checks" : "确定性检查"}</b>
              <small>{english ? "Derived from the problem and verifier" : "来自题目与验证器"}</small>
            </div>
          </div>
          <ol>
            {(english
              ? task?.verificationConditions ?? []
              : task?.verificationConditionsZh ?? task?.verificationConditions ?? []
            ).map((condition) => (
              <li key={condition}><ShieldCheck size={16} /><MathText>{condition}</MathText></li>
            ))}
          </ol>
          <a href={verifierUrl} target="_blank" rel="noreferrer" className="verifier-source-link">
            <Code2 size={17} />
            <span>
              <b>{english ? "Inspect the offline verifier" : "查看离线验证器"}</b>
              <small>{conjecture.symbolicLab.verifierPath}</small>
            </span>
            <ExternalLink size={16} />
          </a>
        </article>
      </div>

      <article className="sample-verdict">
        <div className="panel-heading">
          <span>03</span>
          <div>
            <b>{english ? "Recorded verifier trace" : "已记录的验证轨迹"}</b>
            <small>
              {sample
                ? `${sample.modelLabel} · ${sample.analysis.code}`
                : english
                  ? "No evaluation record is available for this task yet"
                  : "该题尚无评测记录"}
            </small>
          </div>
        </div>
        {sample ? (
          <div className="condition-trace">
            {sample.eval.verification_conditions.map((condition) => (
              <div className={condition.passed ? "pass" : "fail"} key={`${condition.condition_id}-${condition.condition}`}>
                {condition.passed ? <CheckCircle2 size={17} /> : <CircleX size={17} />}
                <span><MathText>{condition.condition}</MathText><small>{condition.reason}</small></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-task-result">
            {english
              ? "The output schema and verifier are ready; this matrix cell will populate when a matching run is added."
              : "输出协议与验证器已就绪；加入对应运行后，该矩阵单元会自动填充。"}
          </p>
        )}
      </article>
    </section>
  );
}
