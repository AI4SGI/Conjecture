"use client";

import {
  AlertTriangle,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileCode2,
  Gauge,
  LoaderCircle,
  MessageSquareText,
  Sigma,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type {
  BenchmarkData,
  FullRecord,
  OutcomeAnalysis,
  RecordSummary,
  Summary,
  Usage,
} from "../lib/types";

type HintFilter = "all" | "hint" | "nohint";
type DetailTab = "content" | "reasoning" | "output" | "eval";

function total(records: RecordSummary[], key: keyof Usage) {
  return records.reduce((sum, record) => sum + (record.usage?.[key] || 0), 0);
}

function summarize(records: RecordSummary[]): Summary {
  const officialPasses = records.filter((record) => record.eval.official_pass).length;
  const mathValid = records.filter((record) => record.eval.math_valid).length;
  const parsed = records.filter((record) => record.eval.certificate_parsed).length;
  const apiErrors = records.filter((record) =>
    /timeout|504|internalserver|bad response/i.test(record.eval.error ?? ""),
  ).length;
  return {
    records: records.length,
    officialPasses,
    mathValid,
    parsed,
    apiErrors,
    passRate: records.length ? officialPasses / records.length : 0,
    parseRate: records.length ? parsed / records.length : 0,
    mathValidRate: records.length ? mathValid / records.length : 0,
    inferenceSeconds: records.reduce(
      (sum, record) => sum + (record.timing.inference_seconds || 0),
      0,
    ),
    verificationSeconds: records.reduce(
      (sum, record) => sum + (record.timing.verification_seconds || 0),
      0,
    ),
    usage: {
      prompt_tokens: total(records, "prompt_tokens"),
      completion_tokens: total(records, "completion_tokens"),
      reasoning_tokens: total(records, "reasoning_tokens"),
      total_tokens: total(records, "total_tokens"),
    },
  };
}

function percent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function compact(value: number) {
  return Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function duration(seconds: number) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${seconds.toFixed(1)} s`;
}

export function ResultsDashboard({ data }: { data: BenchmarkData }) {
  const [model, setModel] = useState("all");
  const [hint, setHint] = useState<HintFilter>("all");
  const [task, setTask] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [record, setRecord] = useState<FullRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("content");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(
    () =>
      data.records.filter(
        (record) =>
          (model === "all" || record.model === model) &&
          (hint === "all" ||
            (hint === "hint" ? record.hint : !record.hint)) &&
          (task === "all" || record.taskKey === task),
      ),
    [data.records, model, hint, task],
  );
  const metrics = useMemo(() => summarize(filtered), [filtered]);
  const outcomes = useMemo(() => {
    const grouped = new Map<
      string,
      { analysis: OutcomeAnalysis; count: number }
    >();
    for (const candidate of filtered) {
      const current = grouped.get(candidate.analysis.code);
      grouped.set(candidate.analysis.code, {
        analysis: candidate.analysis,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  useEffect(() => {
    if (!filtered.some((candidate) => candidate.key === selectedKey)) {
      setSelectedKey(filtered[0]?.key ?? null);
    }
  }, [filtered, selectedKey]);

  useEffect(() => {
    const summary = data.records.find((candidate) => candidate.key === selectedKey);
    if (!summary) {
      setRecord(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(summary.url, { signal: controller.signal })
      .then((response) => response.json() as Promise<FullRecord>)
      .then((value) => setRecord(value))
      .catch((error) => {
        if (error.name !== "AbortError") setRecord(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [data.records, selectedKey]);

  const modelRows = data.models.map((candidate) => {
    const records = data.records.filter(
      (record) =>
        record.model === candidate.id &&
        (hint === "all" ||
          (hint === "hint" ? record.hint : !record.hint)) &&
        (task === "all" || record.taskKey === task),
    );
    return { ...candidate, filteredSummary: summarize(records) };
  });

  const selectedSummary = data.records.find(
    (candidate) => candidate.key === selectedKey,
  );

  async function copyCurrent() {
    if (!record) return;
    const value =
      tab === "content"
        ? record.content
        : tab === "reasoning"
          ? record.reasoning_content
          : tab === "output"
            ? record.output
            : JSON.stringify(record.eval, null, 2);
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="results-section" id="results">
      <div className="section-shell">
        <div className="section-lead section-lead-inverse">
          <span className="section-index">03 / EVALUATION</span>
          <h2>让失败也成为可读数据</h2>
          <p>
            所有结果来自同一份确定性验证器。筛选模型与提示条件，再逐条查看回答、
            原生推理、结构化证书和程序判分。
          </p>
        </div>

        <div className="filter-bar">
          <label>
            <span>模型</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="all">全部模型</option>
              {data.models.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>提示条件</span>
            <select
              value={hint}
              onChange={(event) => setHint(event.target.value as HintFilter)}
            >
              <option value="all">全部（有 / 无提示）</option>
              <option value="nohint">无提示</option>
              <option value="hint">有提示</option>
            </select>
          </label>
          <label>
            <span>任务</span>
            <select value={task} onChange={(event) => setTask(event.target.value)}>
              <option value="all">全部任务</option>
              {data.dataset.tasks.map((candidate) => (
                <option value={candidate.key} key={candidate.key}>
                  {candidate.key} · {candidate.title}
                </option>
              ))}
            </select>
          </label>
          <span className="filter-count">{filtered.length} 条记录</span>
        </div>

        <div className="metric-grid">
          <Metric
            icon={<Gauge />}
            label="程序通过率"
            value={percent(metrics.passRate)}
            note={`${metrics.officialPasses} / ${metrics.records}`}
            accent
          />
          <Metric
            icon={<FileCode2 />}
            label="证书可解析"
            value={percent(metrics.parseRate)}
            note={`${metrics.parsed} 条`}
          />
          <Metric
            icon={<Sigma />}
            label="数学有效"
            value={percent(metrics.mathValidRate)}
            note={`${metrics.mathValid} 条`}
          />
          <Metric
            icon={<Clock3 />}
            label="推理总时长"
            value={duration(metrics.inferenceSeconds)}
            note={`验证 ${duration(metrics.verificationSeconds)}`}
          />
          <Metric
            icon={<Braces />}
            label="总 tokens"
            value={compact(metrics.usage.total_tokens)}
            note={`推理 ${compact(metrics.usage.reasoning_tokens)}`}
          />
        </div>

        <div className="outcome-panel">
          <div className="table-caption">
            <span>结果类型剖面</span>
            <small>按确定性评测器的首要结论归因，不使用 LLM judge</small>
          </div>
          <div className="outcome-grid">
            {outcomes.map(({ analysis, count }) => (
              <div className={`outcome-row ${analysis.tone}`} key={analysis.code}>
                <span className="outcome-marker" />
                <span>
                  <b>{analysis.label}</b>
                  <small>{analysis.short}</small>
                </span>
                <i aria-hidden="true">
                  <span
                    style={{
                      width: `${metrics.records ? (count / metrics.records) * 100 : 0}%`,
                    }}
                  />
                </i>
                <strong>{count}</strong>
              </div>
            ))}
            {!outcomes.length && <p className="empty-list">当前筛选没有可归因记录。</p>}
          </div>
        </div>

        <div className="model-table-wrap">
          <div className="table-caption">
            <span>模型横向比较</span>
            <small>失败包括数学失败、协议失败与 API 错误</small>
          </div>
          <div className="model-table">
            <div className="model-row model-head">
              <span>模型</span><span>记录</span><span>通过</span><span>解析率</span><span>数学有效</span><span>API 错误</span>
            </div>
            {modelRows.map((candidate) => (
              <button
                className={model === candidate.id ? "model-row active" : "model-row"}
                key={candidate.id}
                onClick={() =>
                  setModel((current) =>
                    current === candidate.id ? "all" : candidate.id,
                  )
                }
              >
                <b>{candidate.short}</b>
                <span>{candidate.filteredSummary.records}</span>
                <span className={candidate.filteredSummary.officialPasses ? "pass-text" : ""}>
                  {candidate.filteredSummary.officialPasses}
                </span>
                <span>{percent(candidate.filteredSummary.parseRate)}</span>
                <span>{candidate.filteredSummary.mathValid}</span>
                <span>{candidate.filteredSummary.apiErrors}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="trace-browser">
          <aside className="trace-list">
            <div className="trace-list-head">
              <span>推理记录</span>
              <small>{filtered.length}</small>
            </div>
            <div className="trace-scroll">
              {filtered.map((candidate) => (
                <button
                  key={candidate.key}
                  className={candidate.key === selectedKey ? "trace-item active" : "trace-item"}
                  onClick={() => {
                    setSelectedKey(candidate.key);
                    setTab("content");
                  }}
                >
                  <span
                    className={
                      candidate.eval.official_pass
                        ? "status-dot pass"
                        : candidate.eval.error
                          ? "status-dot fail"
                          : "status-dot neutral"
                    }
                  />
                  <span>
                    <b>{candidate.taskKey} · {candidate.hint ? "有提示" : "无提示"}</b>
                    <small>{candidate.modelLabel}</small>
                    <em>{candidate.analysis.label}</em>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!filtered.length && <p className="empty-list">当前筛选没有记录。</p>}
            </div>
          </aside>

          <article className="trace-detail">
            {selectedSummary ? (
              <>
                <header className="trace-detail-head">
                  <div>
                    <div className="record-badges">
                      <span>{selectedSummary.taskKey}</span>
                      <span>{selectedSummary.hint ? "HINT ON" : "HINT OFF"}</span>
                      <span>RUN {String(selectedSummary.repeatIndex).padStart(2, "0")}</span>
                    </div>
                    <h3>{selectedSummary.modelLabel}</h3>
                    <p>
                      temperature {selectedSummary.parameters.temperature} · top_p{" "}
                      {selectedSummary.parameters.top_p} · max_tokens{" "}
                      {selectedSummary.parameters.max_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div
                    className={
                      selectedSummary.eval.official_pass
                        ? "official-status passed"
                        : "official-status failed"
                    }
                  >
                    {selectedSummary.eval.official_pass ? <Check /> : <X />}
                    <span>
                      <small>OFFICIAL</small>
                      <b>{selectedSummary.eval.official_pass ? "PASS" : "FAIL"}</b>
                    </span>
                  </div>
                </header>

                <div className="record-mini-metrics">
                  <span>推理 {duration(selectedSummary.timing.inference_seconds)}</span>
                  <span>验证 {duration(selectedSummary.timing.verification_seconds)}</span>
                  <span>{compact(selectedSummary.usage.total_tokens)} tokens</span>
                  <span>{selectedSummary.eval.symbolic_work} symbolic ops</span>
                </div>

                <div className={`result-analysis ${selectedSummary.analysis.tone}`}>
                  <AlertTriangle size={17} />
                  <div>
                    <span>确定性结果归因</span>
                    <b>{selectedSummary.analysis.label}</b>
                    <p>{selectedSummary.analysis.short}</p>
                    <small>{selectedSummary.analysis.detail}</small>
                  </div>
                </div>

                {selectedSummary.eval.error && (
                  <div className="eval-error">
                    <AlertTriangle size={16} />
                    <span>{selectedSummary.eval.error}</span>
                  </div>
                )}

                <div className="trace-tabs">
                  {[
                    ["content", "最终回答"],
                    ["reasoning", "原生推理"],
                    ["output", "提取证书"],
                    ["eval", "评测详情"],
                  ].map(([value, label]) => (
                    <button
                      className={tab === value ? "active" : ""}
                      key={value}
                      onClick={() => setTab(value as DetailTab)}
                    >
                      {label}
                    </button>
                  ))}
                  <button className="copy-trace" onClick={() => void copyCurrent()} disabled={!record}>
                    <Copy size={14} /> {copied ? "已复制" : "复制"}
                  </button>
                </div>

                <div className="trace-content">
                  {loading ? (
                    <div className="trace-loading"><LoaderCircle className="spin" /> 加载原始轨迹…</div>
                  ) : record ? (
                    <RecordContent tab={tab} record={record} />
                  ) : (
                    <div className="trace-loading">未能载入该记录。</div>
                  )}
                </div>
              </>
            ) : (
              <div className="trace-placeholder">
                <MessageSquareText />
                <p>选择一条记录查看完整轨迹。</p>
              </div>
            )}
          </article>
        </div>

        <p className="results-disclaimer">
          “程序通过”表示代数证书满足当前题目的可机检条件；P1–P2
          的全局代数不等价性仍标记为未机器验证。原始模型文本仅作可审计记录，不代表本站观点。
        </p>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "metric accent" : "metric"}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

function RecordContent({ tab, record }: { tab: DetailTab; record: FullRecord }) {
  if (tab === "eval") {
    return (
      <div className="eval-grid">
        {[
          ["证书解析", record.eval.certificate_parsed],
          ["数学有效", record.eval.math_valid],
          ["目标达成", record.eval.objective_pass],
          ["最终通过", record.eval.official_pass],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <b className={value ? "yes" : "no"}>{value ? "YES" : "NO"}</b>
          </div>
        ))}
        <div className="eval-json">
          <span>完整评测对象</span>
          <pre>{JSON.stringify(record.eval, null, 2)}</pre>
        </div>
      </div>
    );
  }
  if (tab === "output") {
    return record.output ? (
      <pre className="raw-output">{record.output}</pre>
    ) : (
      <EmptyText text="本次响应没有提取出结构化证书。" />
    );
  }
  const text = tab === "content" ? record.content : record.reasoning_content;
  if (!text) {
    return (
      <EmptyText
        text={
          tab === "reasoning"
            ? "该接口没有返回独立的 reasoning_content。"
            : "该次请求没有返回模型正文。"
        }
      />
    );
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="empty-text">
      <FileCode2 />
      <p>{text}</p>
    </div>
  );
}
