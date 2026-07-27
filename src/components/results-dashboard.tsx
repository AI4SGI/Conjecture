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
  Language,
  OutcomeAnalysis,
  OutcomeCode,
  RecordSummary,
  Summary,
  Usage,
} from "../lib/types";
import { BlockMath } from "./math";

type HintFilter = "all" | "hint" | "nohint";
type DetailTab = "content" | "reasoning" | "output" | "eval";

const OUTCOME_ORDER: OutcomeCode[] = [
  "verified_counterexample",
  "constraint_miss",
  "jacobian_failure",
  "collision_failure",
  "duplicate_points",
  "format_error",
  "missing_certificate",
  "api_failure",
];

function total(records: RecordSummary[], key: keyof Usage) {
  return records.reduce((sum, record) => sum + (record.usage?.[key] || 0), 0);
}

function summarize(records: RecordSummary[]): Summary {
  const officialPasses = records.filter(
    (record) => record.eval.official_pass,
  ).length;
  const mathValid = records.filter((record) => record.eval.math_valid).length;
  const parsed = records.filter(
    (record) => record.eval.certificate_parsed,
  ).length;
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

function compact(value: number, language: Language) {
  return Intl.NumberFormat(language === "en" ? "en" : "zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function duration(seconds: number) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${seconds.toFixed(1)} s`;
}

function outcomeText(analysis: OutcomeAnalysis, language: Language) {
  return {
    label:
      language === "zh" && analysis.labelZh
        ? analysis.labelZh
        : analysis.label,
    short:
      language === "zh" && analysis.shortZh
        ? analysis.shortZh
        : analysis.short,
    detail:
      language === "zh" && analysis.detailZh
        ? analysis.detailZh
        : analysis.detail,
  };
}

export function ResultsDashboard({
  data,
  language,
}: {
  data: BenchmarkData;
  language: Language;
}) {
  const english = language === "en";
  const [model, setModel] = useState("all");
  const [hint, setHint] = useState<HintFilter>("all");
  const [task, setTask] = useState("all");
  const [traceModel, setTraceModel] = useState("all");
  const [traceHint, setTraceHint] = useState<HintFilter>("all");
  const [traceTask, setTraceTask] = useState("all");
  const [traceRun, setTraceRun] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [record, setRecord] = useState<FullRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("content");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(
    () =>
      data.records.filter(
        (candidate) =>
          (model === "all" || candidate.model === model) &&
          (hint === "all" ||
            (hint === "hint" ? candidate.hint : !candidate.hint)) &&
          (task === "all" || candidate.taskKey === task),
      ),
    [data.records, model, hint, task],
  );
  const traceFiltered = useMemo(
    () =>
      data.records.filter(
        (candidate) =>
          (traceModel === "all" || candidate.model === traceModel) &&
          (traceHint === "all" ||
            (traceHint === "hint" ? candidate.hint : !candidate.hint)) &&
          (traceTask === "all" || candidate.taskKey === traceTask) &&
          (traceRun === "all" ||
            candidate.repeatIndex === Number(traceRun)),
      ),
    [data.records, traceHint, traceModel, traceRun, traceTask],
  );
  const metrics = useMemo(() => summarize(filtered), [filtered]);
  const outcomes = useMemo(
    () =>
      OUTCOME_ORDER.map((code) => {
        const source =
          filtered.find((candidate) => candidate.analysis.code === code) ??
          data.records.find((candidate) => candidate.analysis.code === code);
        return {
          code,
          analysis: source?.analysis,
          count: filtered.filter(
            (candidate) => candidate.analysis.code === code,
          ).length,
        };
      }).filter(
        (
          item,
        ): item is {
          code: OutcomeCode;
          analysis: OutcomeAnalysis;
          count: number;
        } => Boolean(item.analysis),
      ),
    [data.records, filtered],
  );

  useEffect(() => {
    if (!traceFiltered.some((candidate) => candidate.key === selectedKey)) {
      setSelectedKey(traceFiltered[0]?.key ?? null);
    }
  }, [selectedKey, traceFiltered]);

  useEffect(() => {
    const summary = data.records.find(
      (candidate) => candidate.key === selectedKey,
    );
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
      (item) =>
        item.model === candidate.id &&
        (hint === "all" || (hint === "hint" ? item.hint : !item.hint)) &&
        (task === "all" || item.taskKey === task),
    );
    const summary = summarize(records);
    return {
      ...candidate,
      filteredSummary: summary,
      noHintPasses: records.filter(
        (item) => !item.hint && item.eval.official_pass,
      ).length,
      hintPasses: records.filter(
        (item) => item.hint && item.eval.official_pass,
      ).length,
      averageTokens: records.length
        ? summary.usage.total_tokens / records.length
        : 0,
      averageInference: records.length
        ? summary.inferenceSeconds / records.length
        : 0,
    };
  });
  const matrixModels = data.models;
  const matrixTasks = data.dataset.tasks;
  const selectedSummary = data.records.find(
    (candidate) => candidate.key === selectedKey,
  );
  const repeatOptions = [
    ...new Set(data.records.map((candidate) => candidate.repeatIndex)),
  ].sort((a, b) => a - b);

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

  function selectMatrixRecord(candidate: RecordSummary) {
    setTraceModel(candidate.model);
    setTraceTask(candidate.taskKey);
    setTraceHint(candidate.hint ? "hint" : "nohint");
    setTraceRun(String(candidate.repeatIndex));
    setSelectedKey(candidate.key);
    setTab("content");
  }

  return (
    <section className="results-section" id="results">
      <div className="section-shell">
        <div className="section-lead section-lead-inverse">
          <span className="section-index">03 / EVALUATION</span>
          <h2>
            {english
              ? "Make every failure mode legible"
              : "让失败也成为可读数据"}
          </h2>
          <p>
            {english
              ? "Filter the aggregate view, compare models, then inspect the final answer, native reasoning, extracted counterexample, and exact offline verdict for every record."
              : "所有结果来自同一份确定性验证器。筛选模型与提示条件，再逐条查看回答、原生推理、结构化反例和程序判分。"}
          </p>
        </div>

        <div className="filter-bar">
          <FilterSelect
            label={english ? "Model" : "模型"}
            value={model}
            onChange={setModel}
            options={[
              ["all", english ? "All models" : "全部模型"],
              ...data.models.map(
                (candidate) => [candidate.id, candidate.label] as const,
              ),
            ]}
          />
          <FilterSelect
            label={english ? "Prior knowledge" : "提示条件"}
            value={hint}
            onChange={(value) => setHint(value as HintFilter)}
            options={[
              ["all", english ? "Both hint modes" : "全部（有 / 无提示）"],
              ["nohint", english ? "No hint" : "无提示"],
              ["hint", english ? "Hint provided" : "有提示"],
            ]}
          />
          <FilterSelect
            label={english ? "Problem" : "任务"}
            value={task}
            onChange={setTask}
            options={[
              ["all", english ? "All problems" : "全部任务"],
              ...data.dataset.tasks.map(
                (candidate) =>
                  [
                    candidate.key,
                    `${candidate.key} · ${
                      english ? candidate.title : candidate.titleZh
                    }`,
                  ] as const,
              ),
            ]}
          />
          <span className="filter-count">
            {filtered.length} {english ? "records" : "条记录"}
          </span>
        </div>

        <div className="metric-grid">
          <Metric
            icon={<Gauge />}
            label={english ? "Offline pass rate" : "程序通过率"}
            value={percent(metrics.passRate)}
            note={`${metrics.officialPasses} / ${metrics.records}`}
            accent
          />
          <Metric
            icon={<FileCode2 />}
            label={english ? "Counterexample parsed" : "证书可解析"}
            value={percent(metrics.parseRate)}
            note={`${metrics.parsed} ${english ? "records" : "条"}`}
          />
          <Metric
            icon={<Sigma />}
            label={english ? "Mathematically valid" : "数学有效"}
            value={percent(metrics.mathValidRate)}
            note={`${metrics.mathValid} ${english ? "records" : "条"}`}
          />
          <Metric
            icon={<Clock3 />}
            label={english ? "Total inference time" : "推理总时长"}
            value={duration(metrics.inferenceSeconds)}
            note={`${english ? "verification" : "验证"} ${duration(
              metrics.verificationSeconds,
            )}`}
          />
          <Metric
            icon={<Braces />}
            label={english ? "Total tokens" : "总 tokens"}
            value={compact(metrics.usage.total_tokens, language)}
            note={`${english ? "reasoning" : "推理"} ${compact(
              metrics.usage.reasoning_tokens,
              language,
            )}`}
          />
        </div>

        <div className="outcome-panel">
          <div className="table-caption">
            <span>
              {english ? "Outcome type statistics" : "结果类型统计"}
            </span>
            <small>
              {english
                ? "Deterministic attribution · no LLM judge"
                : "确定性归因 · 不使用 LLM judge"}
            </small>
          </div>
          <div className="outcome-grid">
            {outcomes.map(({ code, analysis, count }) => {
              const text = outcomeText(analysis, language);
              return (
                <div className={`outcome-row ${analysis.tone}`} key={code}>
                  <span className="outcome-marker" />
                  <span>
                    <b>{text.label}</b>
                    <small>{text.short}</small>
                  </span>
                  <i aria-hidden="true">
                    <span
                      style={{
                        width: `${
                          metrics.records
                            ? (count / metrics.records) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </i>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="matrix-panel">
          <div className="table-caption">
            <span>
              {english
                ? "Model × problem outcome matrix"
                : "模型 × 任务结果矩阵"}
            </span>
            <small>
              {english
                ? "Each cell: NO HINT on the left; HINT on the right. HINT supplies the first known Jacobian counterexample as prior knowledge."
                : "每格左侧为无提示，右侧为有提示；HINT 指提供雅可比猜想首个反例作为先验知识。"}
            </small>
          </div>
          <div className="matrix-legend" aria-label="Outcome matrix legend">
            {[
              ["pass", english ? "verified" : "通过"],
              ["near", english ? "constraint miss" : "约束未达"],
              ["math", english ? "mathematical error" : "数学错误"],
              ["protocol", english ? "protocol error" : "输出协议"],
              ["system", english ? "response failure" : "接口异常"],
            ].map(([tone, label]) => (
              <span key={tone}>
                <i className={tone} /> {label}
              </span>
            ))}
            <em>NO HINT</em>
            <em title="The first known Jacobian counterexample is supplied as prior knowledge.">
              HINT · KNOWN COUNTEREXAMPLE PROVIDED
            </em>
          </div>
          <div className="matrix-scroll">
            <div
              className="benchmark-matrix"
              style={{
                gridTemplateColumns: `minmax(245px, 1.45fr) repeat(${matrixTasks.length}, minmax(128px, 1fr))`,
              }}
            >
              <div className="matrix-corner">
                <span>MODEL</span>
                <small>deterministic outcome</small>
              </div>
              {matrixTasks.map((candidate) => (
                <div className="matrix-task-head" key={candidate.key}>
                  <b>{candidate.key}</b>
                  <span>{english ? candidate.title : candidate.titleZh}</span>
                </div>
              ))}
              {matrixModels.map((candidate) => {
                const matrixRecords = data.records.filter(
                  (item) => item.model === candidate.id,
                );
                const problemCount = new Set(
                  matrixRecords.map((item) => item.taskKey),
                ).size;
                const typeCount = new Set(
                  matrixRecords.map((item) =>
                    item.hint ? "hint" : "nohint",
                  ),
                ).size;
                const runCount = new Set(
                  matrixRecords.map((item) => item.repeatIndex),
                ).size;
                return (
                  <div className="matrix-row" key={candidate.id}>
                    <button
                      className={
                        model === candidate.id
                          ? "matrix-model active"
                          : "matrix-model"
                      }
                      onClick={() =>
                        setModel((current) =>
                          current === candidate.id ? "all" : candidate.id,
                        )
                      }
                    >
                      <b>{candidate.label}</b>
                      <small>
                        {matrixRecords.length}{" "}
                        {english ? "records" : "条记录"} · {problemCount}{" "}
                        {english ? "problems" : "题"} × {typeCount}{" "}
                        {english ? "types" : "种提示类型"} × {runCount}{" "}
                        {english
                          ? `run${runCount === 1 ? "" : "s"}`
                          : "次运行"}
                      </small>
                    </button>
                    {matrixTasks.map((matrixTask) => {
                      const cellRecords = data.records.filter(
                        (item) =>
                          item.model === candidate.id &&
                          item.taskKey === matrixTask.key &&
                          (hint === "all" ||
                            (hint === "hint" ? item.hint : !item.hint)),
                      );
                      return (
                        <div className="matrix-cell" key={matrixTask.key}>
                          {[false, true].map((hintMode) => {
                            const run = cellRecords.find(
                              (item) => item.hint === hintMode,
                            );
                            if (
                              !run ||
                              (hint !== "all" &&
                                (hint === "hint") !== hintMode)
                            ) {
                              return (
                                <span
                                  className="matrix-run empty"
                                  key={String(hintMode)}
                                >
                                  —
                                </span>
                              );
                            }
                            const text = outcomeText(run.analysis, language);
                            return (
                              <button
                                className={`matrix-run ${run.analysis.tone} ${
                                  selectedKey === run.key ? "selected" : ""
                                }`}
                                key={String(hintMode)}
                                onClick={() => {
                                  selectMatrixRecord(run);
                                }}
                                title={`${candidate.label} · ${matrixTask.key} · ${
                                  hintMode ? "HINT" : "NO HINT"
                                } · ${text.label}`}
                              >
                                <span>{hintMode ? "H" : "Ø"}</span>
                                <i />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="model-table-wrap">
          <div className="table-caption">
            <span>
              {english ? "Detailed model comparison" : "模型横向比较"}
            </span>
            <small>
              {english
                ? "Passes are separated by prior-knowledge condition; averages use the active aggregate filters."
                : "按有无提示拆分通过数；平均值遵循上方筛选。"}
            </small>
          </div>
          <div className="model-table-scroll">
            <div className="model-table detailed">
              <div className="model-row model-head">
                <span>{english ? "Model" : "模型"}</span>
                <span>{english ? "Records" : "记录"}</span>
                <span>{english ? "Pass" : "通过"}</span>
                <span>{english ? "Pass rate" : "通过率"}</span>
                <span>NO HINT</span>
                <span>HINT</span>
                <span>{english ? "Parsed" : "解析率"}</span>
                <span>{english ? "Avg tokens" : "平均 tokens"}</span>
                <span>{english ? "Avg time" : "平均时间"}</span>
              </div>
              {modelRows.map((candidate) => (
                <button
                  className={
                    model === candidate.id ? "model-row active" : "model-row"
                  }
                  key={candidate.id}
                  onClick={() =>
                    setModel((current) =>
                      current === candidate.id ? "all" : candidate.id,
                    )
                  }
                >
                  <b>{candidate.label}</b>
                  <span>{candidate.filteredSummary.records}</span>
                  <span
                    className={
                      candidate.filteredSummary.officialPasses
                        ? "pass-text"
                        : ""
                    }
                  >
                    {candidate.filteredSummary.officialPasses}
                  </span>
                  <span>{percent(candidate.filteredSummary.passRate)}</span>
                  <span>{candidate.noHintPasses}</span>
                  <span>{candidate.hintPasses}</span>
                  <span>{percent(candidate.filteredSummary.parseRate)}</span>
                  <span>
                    {compact(Math.round(candidate.averageTokens), language)}
                  </span>
                  <span>{duration(candidate.averageInference)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="trace-browser">
          <aside className="trace-list">
            <div className="trace-list-head">
              <span>{english ? "Reasoning records" : "推理记录"}</span>
              <small>{traceFiltered.length}</small>
            </div>
            <div className="trace-filters">
              <FilterSelect
                label={english ? "Model" : "模型"}
                value={traceModel}
                onChange={setTraceModel}
                options={[
                  ["all", english ? "All models" : "全部模型"],
                  ...data.models.map(
                    (candidate) => [candidate.id, candidate.label] as const,
                  ),
                ]}
              />
              <FilterSelect
                label={english ? "Problem" : "题号"}
                value={traceTask}
                onChange={setTraceTask}
                options={[
                  ["all", english ? "All problems" : "全部题号"],
                  ...data.dataset.tasks.map(
                    (candidate) =>
                      [candidate.key, candidate.key] as const,
                  ),
                ]}
              />
              <FilterSelect
                label="Hint"
                value={traceHint}
                onChange={(value) => setTraceHint(value as HintFilter)}
                options={[
                  ["all", english ? "Both modes" : "全部"],
                  ["nohint", "NO HINT"],
                  ["hint", "HINT"],
                ]}
              />
              <FilterSelect
                label={english ? "Run" : "运行次数"}
                value={traceRun}
                onChange={setTraceRun}
                options={[
                  ["all", english ? "All runs" : "全部运行"],
                  ...repeatOptions.map(
                    (run) =>
                      [
                        String(run),
                        `RUN ${String(run).padStart(2, "0")}`,
                      ] as const,
                  ),
                ]}
              />
            </div>
            <div className="trace-scroll">
              {traceFiltered.map((candidate) => {
                const text = outcomeText(candidate.analysis, language);
                return (
                  <button
                    key={candidate.key}
                    className={
                      candidate.key === selectedKey
                        ? "trace-item active"
                        : "trace-item"
                    }
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
                      <b>
                        {candidate.taskKey} ·{" "}
                        {candidate.hint ? "HINT" : "NO HINT"} · RUN{" "}
                        {String(candidate.repeatIndex).padStart(2, "0")}
                      </b>
                      <small>{candidate.modelLabel}</small>
                      <em>{text.label}</em>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
              {!traceFiltered.length && (
                <p className="empty-list">
                  {english
                    ? "No records match these filters."
                    : "当前筛选没有记录。"}
                </p>
              )}
            </div>
          </aside>

          <article className="trace-detail">
            {selectedSummary ? (
              <>
                <header className="trace-detail-head">
                  <div>
                    <div className="record-badges">
                      <span>{selectedSummary.taskKey}</span>
                      <span>
                        {selectedSummary.hint ? "HINT ON" : "HINT OFF"}
                      </span>
                      <span>
                        RUN{" "}
                        {String(selectedSummary.repeatIndex).padStart(2, "0")}
                      </span>
                    </div>
                    <h3>{selectedSummary.modelLabel}</h3>
                    <p>
                      temperature {selectedSummary.parameters.temperature} ·
                      top_p {selectedSummary.parameters.top_p} · max_tokens{" "}
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
                      <small>OFFLINE</small>
                      <b>
                        {selectedSummary.eval.official_pass ? "PASS" : "FAIL"}
                      </b>
                    </span>
                  </div>
                </header>

                <div className="record-mini-metrics">
                  <span>
                    {english ? "Inference" : "推理"}{" "}
                    {duration(selectedSummary.timing.inference_seconds)}
                  </span>
                  <span>
                    {english ? "Verification" : "验证"}{" "}
                    {duration(selectedSummary.timing.verification_seconds)}
                  </span>
                  <span>
                    {compact(selectedSummary.usage.total_tokens, language)}{" "}
                    tokens
                  </span>
                  <span>
                    {selectedSummary.eval.symbolic_work} symbolic ops
                  </span>
                </div>

                <ResultAnalysis
                  analysis={selectedSummary.analysis}
                  language={language}
                />

                {selectedSummary.eval.error && (
                  <div className="eval-error">
                    <AlertTriangle size={17} />
                    <span>{selectedSummary.eval.error}</span>
                  </div>
                )}

                <div className="trace-tabs">
                  {[
                    ["content", english ? "Final answer" : "最终回答"],
                    ["reasoning", english ? "Native reasoning" : "原生推理"],
                    [
                      "output",
                      english ? "Extracted counterexample" : "提取反例",
                    ],
                    ["eval", english ? "Evaluation details" : "评测详情"],
                  ].map(([value, label]) => (
                    <button
                      className={tab === value ? "active" : ""}
                      key={value}
                      onClick={() => setTab(value as DetailTab)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className="copy-trace"
                    onClick={() => void copyCurrent()}
                    disabled={!record}
                  >
                    <Copy size={15} />{" "}
                    {copied
                      ? english
                        ? "Copied"
                        : "已复制"
                      : english
                        ? "Copy"
                        : "复制"}
                  </button>
                </div>

                <div className="trace-content">
                  {loading ? (
                    <div className="trace-loading">
                      <LoaderCircle className="spin" />{" "}
                      {english ? "Loading record…" : "加载原始轨迹…"}
                    </div>
                  ) : record ? (
                    <RecordContent
                      tab={tab}
                      record={record}
                      language={language}
                    />
                  ) : (
                    <div className="trace-loading">
                      {english
                        ? "This record could not be loaded."
                        : "未能载入该记录。"}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="trace-placeholder">
                <MessageSquareText />
                <p>
                  {english
                    ? "Select a record to inspect the full trace."
                    : "选择一条记录查看完整轨迹。"}
                </p>
              </div>
            )}
          </article>
        </div>

        <p className="results-disclaimer">
          {english
            ? "An OFFLINE PASS means that the submitted algebraic object satisfies the machine-checkable conditions for that task. Global algebraic inequivalence in P1–P2 remains not machine verified. Model text is retained for auditability and is not endorsed by this site."
            : "“程序通过”表示代数反例满足当前题目的可机检条件；P1–P2 的全局代数不等价性仍标记为未机器验证。原始模型文本仅作可审计记录，不代表本站观点。"}
        </p>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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

function ResultAnalysis({
  analysis,
  language,
}: {
  analysis: OutcomeAnalysis;
  language: Language;
}) {
  const text = outcomeText(analysis, language);
  return (
    <div className={`result-analysis ${analysis.tone}`}>
      <AlertTriangle size={18} />
      <div>
        <span>
          {language === "en"
            ? "DETERMINISTIC OUTCOME ATTRIBUTION"
            : "确定性结果归因"}
        </span>
        <b>{text.label}</b>
        <p>{text.short}</p>
        <small>{text.detail}</small>
      </div>
    </div>
  );
}

function RecordContent({
  tab,
  record,
  language,
}: {
  tab: DetailTab;
  record: FullRecord;
  language: Language;
}) {
  const english = language === "en";
  if (tab === "eval") {
    return (
      <div className="eval-grid">
        {[
          [english ? "Counterexample parsed" : "反例解析", record.eval.certificate_parsed],
          [english ? "Mathematically valid" : "数学有效", record.eval.math_valid],
          [english ? "Objective passed" : "目标达成", record.eval.objective_pass],
          [english ? "Offline pass" : "离线通过", record.eval.official_pass],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <b className={value ? "yes" : "no"}>{value ? "YES" : "NO"}</b>
          </div>
        ))}
        <div className="eval-json">
          <span>{english ? "Full evaluation object" : "完整评测对象"}</span>
          <pre>{JSON.stringify(record.eval, null, 2)}</pre>
        </div>
      </div>
    );
  }
  if (tab === "output") {
    return record.output ? (
      <CounterexampleOutput output={record.output} language={language} />
    ) : (
      <EmptyText
        text={
          english
            ? "No structured counterexample was extracted from this response."
            : "本次响应没有提取出结构化反例。"
        }
      />
    );
  }
  const text = tab === "content" ? record.content : record.reasoning_content;
  if (!text) {
    return (
      <EmptyText
        text={
          tab === "reasoning"
            ? english
              ? "The endpoint returned no separate reasoning_content."
              : "该接口没有返回独立的 reasoning_content。"
            : english
              ? "This request returned no model content."
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

type CertificateTerm = { c: unknown; e: number[] };
type ParsedCertificate = {
  kind: string;
  dimension: number;
  map: CertificateTerm[][];
  points: unknown[][];
};

function CounterexampleOutput({
  output,
  language,
}: {
  output: string;
  language: Language;
}) {
  const english = language === "en";
  let certificate: ParsedCertificate | null = null;
  try {
    const parsed = JSON.parse(output) as Partial<ParsedCertificate>;
    if (
      parsed.kind === "map_collision" &&
      typeof parsed.dimension === "number" &&
      Array.isArray(parsed.map) &&
      Array.isArray(parsed.points)
    ) {
      certificate = parsed as ParsedCertificate;
    }
  } catch {
    certificate = null;
  }
  if (!certificate) return <pre className="raw-output">{output}</pre>;

  return (
    <div className="counterexample-view">
      <div className="counterexample-explainer">
        <div>
          <span>{english ? "OBJECT TYPE" : "对象类型"}</span>
          <b>{english ? "Polynomial map + collision" : "多项式映射 + 碰撞"}</b>
        </div>
        <div>
          <span>{english ? "AMBIENT SPACE" : "空间"}</span>
          <b>
            ℂ<sup>{certificate.dimension}</sup>
          </b>
        </div>
        <p>
          {english
            ? "Each JSON term stores a coefficient c and exponent vector e. The panel below reconstructs the polynomial map and lists the proposed points in one fiber."
            : "JSON 中每一项用系数 c 和指数向量 e 表示。下方将其还原为多项式映射，并列出声称位于同一纤维的点。"}
        </p>
      </div>
      <div className="counterexample-formula-card">
        <span>{english ? "RECONSTRUCTED MAP" : "还原后的映射"}</span>
        <BlockMath>
          {String.raw`F:\mathbb C^${certificate.dimension}\to\mathbb C^${certificate.dimension},\qquad F=\begin{pmatrix}${certificate.map
            .map((component) =>
              polynomialLatex(component, certificate.dimension),
            )
            .join(String.raw`\\`)}\end{pmatrix}`}
        </BlockMath>
      </div>
      <div className="counterexample-point-card">
        <span>{english ? "PROPOSED COLLISION POINTS" : "候选碰撞点"}</span>
        <BlockMath>
          {certificate.points
            .map(
              (point, index) =>
                String.raw`p_{${index + 1}}=\left(${point
                  .map(scalarLatex)
                  .join(",")}\right)`,
            )
            .join(String.raw`,\qquad `)}
        </BlockMath>
        <p>
          {english
            ? `${certificate.points.length} points were submitted. Their distinctness and common image are decided by the offline evaluator, not inferred from this visualization.`
            : `共提交 ${certificate.points.length} 个点。是否互异且具有共同像由离线评测器判定，而不是由此可视化推断。`}
        </p>
      </div>
      <details className="raw-certificate">
        <summary>{english ? "View raw JSON" : "查看原始 JSON"}</summary>
        <pre className="raw-output">{output}</pre>
      </details>
    </div>
  );
}

function polynomialLatex(terms: CertificateTerm[], dimension: number) {
  const variables =
    dimension === 3
      ? ["x", "y", "z"]
      : Array.from({ length: dimension }, (_, index) => `x_{${index + 1}}`);
  if (!terms.length) return "0";
  return terms
    .map((term) => {
      const coefficient = scalarLatex(term.c);
      const variablesPart = term.e
        .map((exponent, index) => {
          if (!exponent) return "";
          return exponent === 1
            ? variables[index]
            : `${variables[index]}^{${exponent}}`;
        })
        .join("");
      if (!variablesPart) return coefficient;
      if (coefficient === "1") return variablesPart;
      if (coefficient === "-1") return `-${variablesPart}`;
      return `${coefficient}${variablesPart}`;
    })
    .join(" + ")
    .replaceAll("+ -", "- ");
}

function scalarLatex(value: unknown): string {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === "number")
  ) {
    const [numerator, denominator] = value as [number, number];
    if (denominator === 1) return String(numerator);
    return numerator < 0
      ? String.raw`-\frac{${Math.abs(numerator)}}{${denominator}}`
      : String.raw`\frac{${numerator}}{${denominator}}`;
  }
  return String(value);
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="empty-text">
      <FileCode2 />
      <p>{text}</p>
    </div>
  );
}
