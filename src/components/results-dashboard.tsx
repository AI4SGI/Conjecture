"use client";

import {
  AlertTriangle,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileCode2,
  Gauge,
  LoaderCircle,
  MessageSquareText,
  Sigma,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type {
  BenchmarkData,
  ConjectureData,
  FullRecord,
  Language,
  OutcomeAnalysis,
  RecordBundle,
  RecordSummary,
  Summary,
  Task,
  Usage,
} from "../lib/types";
import { BlockMath } from "./math";

type HintFilter = "all" | "hint" | "nohint";
type DetailTab = "content" | "reasoning" | "output" | "eval";

const REPOSITORY =
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";

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
  return {
    records: records.length,
    officialPasses,
    mathValid,
    parsed,
    apiErrors: records.filter(
      (record) => record.analysis.code === "api_failure",
    ).length,
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
      language === "zh" && analysis.labelZh ? analysis.labelZh : analysis.label,
    short:
      language === "zh" && analysis.shortZh ? analysis.shortZh : analysis.short,
    detail:
      language === "zh" && analysis.detailZh
        ? analysis.detailZh
        : analysis.detail,
  };
}

function runLabel(index: number) {
  return `RUN ${String(Math.max(index, 1)).padStart(2, "0")}`;
}

export function ResultsDashboard({
  data,
  content,
  language,
}: {
  data: BenchmarkData;
  content: ConjectureData["evaluation"];
  language: Language;
}) {
  const english = language === "en";
  const pairedHints = data.dataset.hintPolicy === "paired";
  const [model, setModel] = useState("all");
  const [hint, setHint] = useState<HintFilter>("all");
  const [task, setTask] = useState("all");
  const [traceModel, setTraceModel] = useState("all");
  const [traceHint, setTraceHint] = useState<HintFilter>("all");
  const [traceTask, setTraceTask] = useState("all");
  const [traceRun, setTraceRun] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    data.records[0]?.key ?? null,
  );
  const [bundle, setBundle] = useState<RecordBundle | null>(null);
  const [bundleError, setBundleError] = useState(false);
  const [tab, setTab] = useState<DetailTab>("content");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setModel("all");
    setHint("all");
    setTask("all");
    setTraceModel("all");
    setTraceHint("all");
    setTraceTask("all");
    setTraceRun("all");
    setSelectedKey(data.records[0]?.key ?? null);
    setTab("content");
    setCopied(false);
    setBundle(null);
    setBundleError(false);
    void fetch(data.dataset.recordBundleUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Evaluation bundle unavailable");
        return (await response.json()) as RecordBundle;
      })
      .then(setBundle)
      .catch((error: Error) => {
        if (error.name !== "AbortError") setBundleError(true);
      });
    return () => controller.abort();
  }, [data]);

  const filtered = useMemo(
    () =>
      data.records.filter(
        (candidate) =>
          (model === "all" || candidate.model === model) &&
          (!pairedHints ||
            hint === "all" ||
            (hint === "hint" ? candidate.hint : !candidate.hint)) &&
          (task === "all" || candidate.taskKey === task),
      ),
    [data.records, hint, model, pairedHints, task],
  );

  const traceFiltered = useMemo(
    () =>
      data.records.filter(
        (candidate) =>
          (traceModel === "all" || candidate.model === traceModel) &&
          (!pairedHints ||
            traceHint === "all" ||
            (traceHint === "hint" ? candidate.hint : !candidate.hint)) &&
          (traceTask === "all" || candidate.taskKey === traceTask) &&
          (traceRun === "all" ||
            candidate.repeatIndex === Number(traceRun)),
      ),
    [
      data.records,
      pairedHints,
      traceHint,
      traceModel,
      traceRun,
      traceTask,
    ],
  );

  useEffect(() => {
    if (!traceFiltered.some((candidate) => candidate.key === selectedKey)) {
      setSelectedKey(traceFiltered[0]?.key ?? null);
      setTab("content");
    }
  }, [selectedKey, traceFiltered]);

  const metrics = useMemo(() => summarize(filtered), [filtered]);
  const outcomes = useMemo(() => {
    const groups = new Map<string, OutcomeAnalysis>();
    for (const candidate of data.records) {
      if (!groups.has(candidate.analysis.code)) {
        groups.set(candidate.analysis.code, candidate.analysis);
      }
    }
    return [...groups.entries()]
      .map(([code, analysis]) => ({
        code,
        analysis,
        count: filtered.filter(
          (candidate) => candidate.analysis.code === code,
        ).length,
        totalCount: data.records.filter(
          (candidate) => candidate.analysis.code === code,
        ).length,
      }))
      .sort(
        (left, right) =>
          right.totalCount - left.totalCount ||
          left.code.localeCompare(right.code),
      );
  }, [data.records, filtered]);

  const modelRows = data.models.map((candidate) => {
    const records = data.records.filter(
      (item) =>
        item.model === candidate.id &&
        (!pairedHints ||
          hint === "all" ||
          (hint === "hint" ? item.hint : !item.hint)) &&
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
  const selectedSummary = data.records.find(
    (candidate) => candidate.key === selectedKey,
  );
  const record = selectedSummary
    ? bundle?.records[selectedSummary.bundleKey] ?? null
    : null;
  const repeatOptions = [
    ...new Set(data.records.map((candidate) => candidate.repeatIndex)),
  ].sort((left, right) => left - right);
  const selectedTask = data.dataset.tasks.find(
    (candidate) => candidate.key === selectedSummary?.taskKey,
  );

  async function copyCurrent() {
    if (!record) return;
    const value =
      tab === "content"
        ? String(record.content ?? "")
        : tab === "reasoning"
          ? String(record.reasoning_content ?? "")
          : tab === "output"
            ? rawOutput(record.output)
            : JSON.stringify(record.normalized_evaluation, null, 2);
    let copiedToClipboard = false;
    try {
      await navigator.clipboard.writeText(value);
      copiedToClipboard = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copiedToClipboard = document.execCommand("copy");
      textarea.remove();
    }
    if (!copiedToClipboard) return;
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
          <h2>{english ? content.title : content.titleZh}</h2>
          <p>{english ? content.body : content.bodyZh}</p>
        </div>

        <div className={`filter-bar${pairedHints ? "" : " no-hint"}`}>
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
          {pairedHints ? (
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
          ) : null}
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
          <Metric icon={<Gauge />} label={english ? "Offline pass rate" : "程序通过率"} value={percent(metrics.passRate)} note={`${metrics.officialPasses} / ${metrics.records}`} accent />
          <Metric icon={<FileCode2 />} label={english ? "Output parsed" : "输出可解析"} value={percent(metrics.parseRate)} note={`${metrics.parsed} ${english ? "records" : "条"}`} />
          <Metric icon={<Sigma />} label={english ? "Mathematically valid" : "数学有效"} value={percent(metrics.mathValidRate)} note={`${metrics.mathValid} ${english ? "records" : "条"}`} />
          <Metric icon={<Clock3 />} label={english ? "Total inference time" : "推理总时长"} value={duration(metrics.inferenceSeconds)} note={`${english ? "verification" : "验证"} ${duration(metrics.verificationSeconds)}`} />
          <Metric icon={<Braces />} label={english ? "Total tokens" : "总 tokens"} value={compact(metrics.usage.total_tokens, language)} note={`${english ? "reasoning" : "推理"} ${compact(metrics.usage.reasoning_tokens, language)}`} />
        </div>

        <div className="outcome-panel">
          <div className="table-caption">
            <span>{english ? "Outcome type statistics" : "结果类型统计"}</span>
            <small>{english ? "Deterministic attribution · no LLM judge" : "确定性归因 · 不使用 LLM judge"}</small>
          </div>
          <div className="outcome-grid">
            {outcomes.map(({ code, analysis, count }) => {
              const text = outcomeText(analysis, language);
              return (
                <div className={`outcome-row ${analysis.tone}`} key={code}>
                  <span className="outcome-marker" />
                  <span><b>{text.label}</b><small>{text.short}</small></span>
                  <i aria-hidden="true"><span style={{ width: `${metrics.records ? (count / metrics.records) * 100 : 0}%` }} /></i>
                  <strong>{count}</strong>
                </div>
              );
            })}
            {!outcomes.length ? <p className="empty-list">{english ? "No results are available." : "暂无评测结果。"}</p> : null}
          </div>
        </div>

        <div className="matrix-panel">
          <div className="table-caption">
            <span>{english ? "Model × problem outcome matrix" : "模型 × 任务结果矩阵"}</span>
            <small>{pairedHints ? (english ? "Each cell: NO HINT on the left; HINT on the right." : "每格左侧为无提示，右侧为有提示。") : (english ? "This conjecture is evaluated without hints." : "该猜想不提供提示条件。")}</small>
          </div>
          <div className="matrix-legend" aria-label="Outcome matrix legend">
            {[["pass", english ? "verified" : "通过"], ["near", english ? "constraint miss" : "约束未达"], ["math", english ? "mathematical error" : "数学错误"], ["protocol", english ? "protocol error" : "输出协议"], ["system", english ? "response failure" : "接口异常"]].map(([tone, label]) => <span key={tone}><i className={tone} /> {label}</span>)}
            {pairedHints ? <><em>NO HINT</em><em>HINT · KNOWN COUNTEREXAMPLE PROVIDED</em></> : <em>{english ? "NO HINT" : "无提示"}</em>}
          </div>
          <div className="matrix-scroll">
            <div className="benchmark-matrix" style={{ gridTemplateColumns: `minmax(245px, 1.45fr) repeat(${data.dataset.tasks.length}, minmax(128px, 1fr))` } as CSSProperties}>
              <div className="matrix-corner"><span>MODEL</span><small>deterministic outcome</small></div>
              {data.dataset.tasks.map((candidate) => <div className="matrix-task-head" key={candidate.key}><b>{candidate.key}</b><span>{english ? candidate.title : candidate.titleZh}</span></div>)}
              {data.models.map((candidate) => {
                const matrixRecords = data.records.filter((item) => item.model === candidate.id);
                const problemCount = new Set(matrixRecords.map((item) => item.taskKey)).size;
                const typeCount = new Set(matrixRecords.map((item) => item.hintMode)).size;
                const runCount = new Set(matrixRecords.map((item) => item.repeatIndex)).size;
                return (
                  <div className="matrix-row" key={candidate.id}>
                    <button className={model === candidate.id ? "matrix-model active" : "matrix-model"} onClick={() => setModel((current) => current === candidate.id ? "all" : candidate.id)}>
                      <b>{candidate.label}</b>
                      <small>{matrixRecords.length} {english ? "records" : "条记录"} · {problemCount} {english ? "problems" : "题"}{pairedHints ? <> × {typeCount} {english ? "hint modes" : "种提示"}</> : null} × {runCount} {english ? "runs" : "次运行"}</small>
                    </button>
                    {data.dataset.tasks.map((matrixTask) => {
                      const cellRecords = data.records.filter((item) => item.model === candidate.id && item.taskKey === matrixTask.key && (!pairedHints || hint === "all" || (hint === "hint" ? item.hint : !item.hint))).sort((left, right) => Number(left.hint) - Number(right.hint) || left.repeatIndex - right.repeatIndex);
                      return (
                        <div className={`matrix-cell${pairedHints ? "" : " single-mode"}`} key={matrixTask.key}>
                          {cellRecords.length ? cellRecords.map((run) => {
                            const text = outcomeText(run.analysis, language);
                            return <button className={`matrix-run ${run.analysis.tone} ${selectedKey === run.key ? "selected" : ""}`} key={run.key} onClick={() => selectMatrixRecord(run)} title={`${candidate.label} · ${matrixTask.key} · ${pairedHints ? (run.hint ? "HINT" : "NO HINT") : runLabel(run.repeatIndex)} · ${text.label}`}><span>{pairedHints ? (run.hint ? "H" : "Ø") : `R${String(Math.max(run.repeatIndex, 1)).padStart(2, "0")}`}</span><i /></button>;
                          }) : <span className="matrix-run empty">—</span>}
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
            <span>{english ? "Detailed model comparison" : "模型横向比较"}</span>
            <small>{pairedHints ? (english ? "Passes are separated by hint condition; averages use the active filters." : "按有无提示拆分通过数；平均值遵循上方筛选。") : (english ? "Averages use the active model and problem filters." : "平均值遵循上方模型与任务筛选。")}</small>
          </div>
          <div className="model-table-scroll">
            <div className={`model-table detailed${pairedHints ? "" : " no-hint"}`}>
              <div className="model-row model-head"><span>{english ? "Model" : "模型"}</span><span>{english ? "Records" : "记录"}</span><span>{english ? "Pass" : "通过"}</span><span>{english ? "Pass rate" : "通过率"}</span><span>NO HINT</span>{pairedHints ? <span>HINT</span> : null}<span>{english ? "Parsed" : "解析率"}</span><span>{english ? "Avg tokens" : "平均 tokens"}</span><span>{english ? "Avg time" : "平均时间"}</span></div>
              {modelRows.map((candidate) => <button className={model === candidate.id ? "model-row active" : "model-row"} key={candidate.id} onClick={() => setModel((current) => current === candidate.id ? "all" : candidate.id)}><b>{candidate.label}</b><span>{candidate.filteredSummary.records}</span><span className={candidate.filteredSummary.officialPasses ? "pass-text" : ""}>{candidate.filteredSummary.officialPasses}</span><span>{percent(candidate.filteredSummary.passRate)}</span><span>{candidate.noHintPasses}</span>{pairedHints ? <span>{candidate.hintPasses}</span> : null}<span>{percent(candidate.filteredSummary.parseRate)}</span><span>{compact(Math.round(candidate.averageTokens), language)}</span><span>{duration(candidate.averageInference)}</span></button>)}
            </div>
          </div>
        </div>

        <div className="trace-browser">
          <aside className="trace-list">
            <div className="trace-list-head"><span>{english ? "Reasoning records" : "推理记录"}</span><small>{traceFiltered.length}</small></div>
            <div className={`trace-filters${pairedHints ? "" : " no-hint"}`}>
              <FilterSelect label={english ? "Model" : "模型"} value={traceModel} onChange={setTraceModel} options={[["all", english ? "All models" : "全部模型"], ...data.models.map((candidate) => [candidate.id, candidate.label] as const)]} />
              <FilterSelect label={english ? "Problem" : "题号"} value={traceTask} onChange={setTraceTask} options={[["all", english ? "All problems" : "全部题号"], ...data.dataset.tasks.map((candidate) => [candidate.key, candidate.key] as const)]} />
              {pairedHints ? <FilterSelect label="Hint" value={traceHint} onChange={(value) => setTraceHint(value as HintFilter)} options={[["all", english ? "Both modes" : "全部"], ["nohint", "NO HINT"], ["hint", "HINT"]]} /> : null}
              <FilterSelect label={english ? "Run" : "运行次数"} value={traceRun} onChange={setTraceRun} options={[["all", english ? "All runs" : "全部运行"], ...repeatOptions.map((run) => [String(run), runLabel(run)] as const)]} />
            </div>
            <div className="trace-scroll">
              {traceFiltered.map((candidate) => {
                const text = outcomeText(candidate.analysis, language);
                return <button key={candidate.key} className={candidate.key === selectedKey ? "trace-item active" : "trace-item"} onClick={() => { setSelectedKey(candidate.key); setTab("content"); }}><span className={candidate.eval.official_pass ? "status-dot pass" : candidate.analysis.tone === "system" ? "status-dot neutral" : "status-dot fail"} /><span><b>{candidate.taskKey}{pairedHints ? ` · ${candidate.hint ? "HINT" : "NO HINT"}` : ""}{` · ${runLabel(candidate.repeatIndex)}`}</b><small>{candidate.modelLabel}</small><em>{text.label}</em></span><ChevronRight size={16} /></button>;
              })}
              {!traceFiltered.length ? <p className="empty-list">{english ? "No records match these filters." : "当前筛选没有记录。"}</p> : null}
            </div>
          </aside>

          <article className="trace-detail">
            {selectedSummary ? <>
              <header className="trace-detail-head">
                <div><div className="record-badges"><span>{selectedSummary.taskKey}</span>{pairedHints ? <span>{selectedSummary.hint ? "HINT ON" : "HINT OFF"}</span> : null}<span>{runLabel(selectedSummary.repeatIndex)}</span></div><h3>{selectedSummary.modelLabel}</h3><p>temperature {selectedSummary.parameters.temperature} · top_p {selectedSummary.parameters.top_p} · max_tokens {selectedSummary.parameters.max_tokens.toLocaleString()}{selectedSummary.parameters.reasoning_effort ? ` · reasoning_effort ${selectedSummary.parameters.reasoning_effort}` : ""}</p></div>
                <div className={selectedSummary.eval.official_pass ? "official-status passed" : "official-status failed"}>{selectedSummary.eval.official_pass ? <Check /> : <X />}<span><small>OFFLINE</small><b>{selectedSummary.eval.official_pass ? "PASS" : "FAIL"}</b></span></div>
              </header>
              <div className="record-mini-metrics"><span>{english ? "Inference" : "推理"} {duration(selectedSummary.timing.inference_seconds)}</span><span>{english ? "Verification" : "验证"} {duration(selectedSummary.timing.verification_seconds)}</span><span>{compact(selectedSummary.usage.total_tokens, language)} tokens</span><span>{selectedSummary.eval.symbolic_work} symbolic ops</span></div>
              <ResultAnalysis analysis={selectedSummary.analysis} language={language} />
              {selectedSummary.eval.error ? <div className="eval-error"><AlertTriangle size={17} /><span>{selectedSummary.eval.error}</span></div> : null}
              <div className="record-provenance"><span>{selectedSummary.sourcePath}</span><a href={`https://github.com/${REPOSITORY}/blob/main/${selectedSummary.sourcePath}`} target="_blank" rel="noreferrer">{english ? "Source result" : "源结果"} <ExternalLink size={13} /></a></div>
              <div className="trace-tabs">
                {[["content", english ? "Final answer" : "最终回答"], ["reasoning", english ? "Native reasoning" : "原生推理"], ["output", english ? "Extracted output" : "提取输出"], ["eval", english ? "Evaluation details" : "评测详情"]].map(([value, label]) => <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value as DetailTab)}>{label}</button>)}
                <button className="copy-trace" onClick={() => void copyCurrent()} disabled={!record}><Copy size={15} /> {copied ? (english ? "Copied" : "已复制") : (english ? "Copy" : "复制")}</button>
              </div>
              <div className="trace-content">
                {!bundle && !bundleError ? <div className="trace-loading"><LoaderCircle className="spin" /> {english ? "Loading record…" : "加载原始轨迹…"}</div> : bundleError ? <div className="trace-loading">{english ? "The evaluation bundle could not be loaded." : "评测包载入失败。"}</div> : record ? <RecordContent tab={tab} record={record} task={selectedTask} conjectureId={data.dataset.id} language={language} /> : <div className="trace-loading">{english ? "This record could not be loaded." : "未能载入该记录。"}</div>}
              </div>
            </> : <div className="trace-placeholder"><MessageSquareText /><p>{english ? "Select a record to inspect the full trace." : "选择一条记录查看完整轨迹。"}</p></div>}
          </article>
        </div>

        <p className="results-disclaimer">{english ? "An OFFLINE PASS means that the submitted finite object satisfies every machine-checkable condition declared for this task. Research qualifications outside deterministic verification are reported separately; model text is retained for auditability and is not endorsed by this site." : "“程序通过”表示提交的有限对象满足当前任务声明的全部可机器核验条件。确定性验证范围之外的研究性限定将单独报告；原始模型文本仅作可审计记录，不代表本站观点。"}</p>
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
  icon: ReactNode;
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
  task,
  conjectureId,
  language,
}: {
  tab: DetailTab;
  record: FullRecord;
  task?: Task;
  conjectureId: string;
  language: Language;
}) {
  const english = language === "en";
  if (tab === "eval") {
    const evaluation = record.normalized_evaluation;
    return (
      <div className="eval-grid">
        {[
          [english ? "Output parsed" : "输出解析", evaluation.certificate_parsed],
          [english ? "Mathematically valid" : "数学有效", evaluation.math_valid],
          [english ? "Objective passed" : "目标达成", evaluation.objective_pass],
          [english ? "Offline pass" : "离线通过", evaluation.official_pass],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <b className={value ? "yes" : "no"}>{value ? "YES" : "NO"}</b>
          </div>
        ))}
        <div className="evaluation-conditions">
          <span>{english ? "VERIFICATION CONDITIONS" : "验证条件"}</span>
          {evaluation.verification_conditions.map((condition) => (
            <article
              className={condition.passed ? "pass" : "fail"}
              key={`${condition.condition_id}-${condition.condition}`}
            >
              <b>{condition.passed ? "PASS" : "FAIL"}</b>
              <div>
                <MarkdownText>{condition.condition}</MarkdownText>
                <small>{condition.reason}</small>
              </div>
            </article>
          ))}
        </div>
        <div className="eval-json">
          <span>{english ? "Full evaluation object" : "完整评测对象"}</span>
          <pre>{JSON.stringify(evaluation, null, 2)}</pre>
        </div>
      </div>
    );
  }
  if (tab === "output") {
    return record.output !== undefined && record.output !== null ? (
      <OutputInspector
        output={record.output}
        task={task}
        conjectureId={conjectureId}
        language={language}
      />
    ) : (
      <EmptyText
        text={
          english
            ? "No structured output was extracted from this response."
            : "本次响应没有提取出结构化输出。"
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
      <MarkdownText>{String(text)}</MarkdownText>
    </div>
  );
}

function MarkdownText({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
      rehypePlugins={[rehypeKatex]}
    >
      {children}
    </ReactMarkdown>
  );
}

function rawOutput(output: unknown) {
  return typeof output === "string"
    ? output
    : JSON.stringify(output, null, 2) ?? String(output);
}

function parsedOutput(output: unknown): Record<string, unknown> | null {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  if (typeof output !== "string") return null;
  try {
    const value = JSON.parse(output) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function OutputInspector({
  output,
  task,
  conjectureId,
  language,
}: {
  output: unknown;
  task?: Task;
  conjectureId: string;
  language: Language;
}) {
  const english = language === "en";
  const parsed = parsedOutput(output);
  return (
    <div className="output-inspector">
      <div className="output-section-heading">
        <span>{english ? "VISUALIZED OUTPUT" : "输出可视化"}</span>
        <small>
          {english
            ? "A problem-aware rendering of the extracted object"
            : "依据问题类型渲染提取对象"}
        </small>
      </div>
      {conjectureId === "jacobian_conjecture" ? (
        <JacobianOutput parsed={parsed} language={language} />
      ) : conjectureId === "number_theory_001_beal_conjecture" ? (
        <BealOutput parsed={parsed} language={language} />
      ) : conjectureId === "number_theory_002_odd_perfect_number" ? (
        <OddPerfectOutput parsed={parsed} language={language} />
      ) : (
        <GenericOutput parsed={parsed} language={language} />
      )}

      <div className="output-section-heading original">
        <span>{english ? "ORIGINAL OUTPUT FORMAT" : "原始输出格式"}</span>
        <small>
          {english
            ? "Preserved exactly as stored in the evaluation record"
            : "按评测记录中的原始形式保留"}
        </small>
      </div>
      <pre className="raw-output">{rawOutput(output)}</pre>
      {task?.outputFormat ? (
        <details className="output-contract">
          <summary>
            {english ? "Expected output contract" : "查看预期输出协议"}
          </summary>
          <pre>{task.outputFormat}</pre>
        </details>
      ) : null}
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

function JacobianOutput({
  parsed,
  language,
}: {
  parsed: Record<string, unknown> | null;
  language: Language;
}) {
  const english = language === "en";
  const certificate = isParsedCertificate(parsed) ? parsed : null;
  if (!certificate) {
    return (
      <div className="output-kind-card">
        <span>{english ? "RESPONSE KIND" : "响应类型"}</span>
        <b>
          {String(
            parsed?.kind ?? (english ? "Unparsed output" : "未解析输出"),
          )}
        </b>
        <p>
          {String(
            parsed?.reason ??
              (english
                ? "No polynomial-map collision object was available to reconstruct."
                : "没有可供重建的多项式映射碰撞对象。"),
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="counterexample-view output-visual-body">
      <div className="counterexample-explainer">
        <div>
          <span>{english ? "OBJECT TYPE" : "对象类型"}</span>
          <b>
            {english ? "Polynomial map + collision" : "多项式映射 + 碰撞"}
          </b>
        </div>
        <div>
          <span>{english ? "AMBIENT SPACE" : "空间"}</span>
          <b>
            ℂ<sup>{certificate.dimension}</sup>
          </b>
        </div>
        <p>
          {english
            ? "Each term stores a coefficient c and exponent vector e. The formula reconstructs the map and proposed points in one fiber."
            : "每一项用系数 c 和指数向量 e 表示；公式还原多项式映射及候选同纤维点。"}
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
            ? `${certificate.points.length} points were submitted. Exact distinctness, common image, and Jacobian conditions are decided by the offline evaluator.`
            : `共提交 ${certificate.points.length} 个点；互异性、共同像与雅可比条件均由离线评测器精确判定。`}
        </p>
      </div>
    </div>
  );
}

function BealOutput({
  parsed,
  language,
}: {
  parsed: Record<string, unknown> | null;
  language: Language;
}) {
  const english = language === "en";
  const names = ["A", "B", "C", "x", "y", "z"] as const;
  if (!parsed || names.some((name) => integerValue(parsed[name]) === null)) {
    return <GenericOutput parsed={parsed} language={language} />;
  }
  const A = integerValue(parsed.A)!;
  const B = integerValue(parsed.B)!;
  const C = integerValue(parsed.C)!;
  const x = integerValue(parsed.x)!;
  const y = integerValue(parsed.y)!;
  const z = integerValue(parsed.z)!;
  if (x < 0n || y < 0n || z < 0n) {
    return <GenericOutput parsed={parsed} language={language} />;
  }
  const left = A ** x + B ** y;
  const right = C ** z;
  const residual = left >= right ? left - right : right - left;
  return (
    <div className="arithmetic-output output-visual-body">
      <div className="output-kind-card compact-card">
        <span>{english ? "OBJECT TYPE" : "对象类型"}</span>
        <b>{english ? "Beal equation candidate" : "Beal 方程候选"}</b>
        <p>
          {english
            ? "Exact integer powers are reconstructed from the six extracted values."
            : "根据提取的六个整数重建并精确计算幂等式。"}
        </p>
      </div>
      <div className="counterexample-formula-card">
        <span>{english ? "RECONSTRUCTED EQUATION" : "还原后的方程"}</span>
        <BlockMath>
          {String.raw`${A}^{${x}}+${B}^{${y}}\stackrel{?}{=}${C}^{${z}}`}
        </BlockMath>
        <BlockMath>
          {String.raw`${left}\;\stackrel{?}{=}\;${right}`}
        </BlockMath>
      </div>
      <div className="arithmetic-stat-grid">
        <OutputStat label="LEFT" value={left.toString()} />
        <OutputStat label="RIGHT" value={right.toString()} />
        <OutputStat
          label={english ? "ABSOLUTE RESIDUAL" : "绝对残差"}
          value={residual.toString()}
          accent={residual === 0n}
        />
      </div>
    </div>
  );
}

type Factor = { p: bigint; e: bigint };

function OddPerfectOutput({
  parsed,
  language,
}: {
  parsed: Record<string, unknown> | null;
  language: Language;
}) {
  const english = language === "en";
  const N = integerValue(parsed?.N);
  const rawFactors = Array.isArray(parsed?.factors) ? parsed.factors : [];
  const factors: Factor[] = [];
  for (const item of rawFactors) {
    if (!item || typeof item !== "object") continue;
    const factor = item as Record<string, unknown>;
    const p = integerValue(factor.p);
    const e = integerValue(factor.e);
    if (p !== null && e !== null && p > 1n && e >= 0n) {
      factors.push({ p, e });
    }
  }
  if (N === null || !factors.length) {
    return <GenericOutput parsed={parsed} language={language} />;
  }
  const product = factors.reduce(
    (value, factor) => value * factor.p ** factor.e,
    1n,
  );
  const sigma = factors.reduce(
    (value, factor) =>
      value *
      ((factor.p ** (factor.e + 1n) - 1n) / (factor.p - 1n)),
    1n,
  );
  const twiceN = 2n * N;
  return (
    <div className="arithmetic-output output-visual-body">
      <div className="output-kind-card compact-card">
        <span>{english ? "OBJECT TYPE" : "对象类型"}</span>
        <b>{english ? "Prime-power certificate" : "素数幂证书"}</b>
        <p>
          {english
            ? "The factorization and divisor sum are reconstructed with exact integer arithmetic."
            : "使用精确整数运算重建素数幂分解与除数和。"}
        </p>
      </div>
      <div className="factor-strip">
        {factors.map((factor) => (
          <span key={`${factor.p}-${factor.e}`}>
            <b>{factor.p.toString()}</b>
            <sup>{factor.e.toString()}</sup>
          </span>
        ))}
      </div>
      <div className="counterexample-formula-card">
        <span>{english ? "FACTORIZATION" : "素因数分解"}</span>
        <BlockMath>
          {String.raw`${N}= ${factors
            .map((factor) => `${factor.p}^{${factor.e}}`)
            .join(String.raw`\cdot `)}`}
        </BlockMath>
      </div>
      <div className="counterexample-point-card">
        <span>{english ? "DIVISOR-SUM CHECK" : "除数和检查"}</span>
        <BlockMath>
          {String.raw`\sigma(N)=\prod_{p^e\parallel N}\frac{p^{e+1}-1}{p-1}=${sigma}`}
        </BlockMath>
        <BlockMath>
          {String.raw`\sigma(N)\stackrel{?}{=}2N=${twiceN}`}
        </BlockMath>
      </div>
      <div className="arithmetic-stat-grid">
        <OutputStat
          label={english ? "FACTOR PRODUCT" : "因子乘积"}
          value={product.toString()}
          accent={product === N}
        />
        <OutputStat label="σ(N)" value={sigma.toString()} />
        <OutputStat
          label="2N"
          value={twiceN.toString()}
          accent={sigma === twiceN}
        />
      </div>
    </div>
  );
}

function GenericOutput({
  parsed,
  language,
}: {
  parsed: Record<string, unknown> | null;
  language: Language;
}) {
  const english = language === "en";
  return (
    <div className="output-kind-card">
      <span>{english ? "STRUCTURED OBJECT" : "结构化对象"}</span>
      <b>
        {parsed
          ? english
            ? `${Object.keys(parsed).length} extracted fields`
            : `已提取 ${Object.keys(parsed).length} 个字段`
          : english
            ? "Unparsed output"
            : "未解析输出"}
      </b>
      <p>
        {parsed
          ? Object.keys(parsed).join(" · ")
          : english
            ? "The exact response remains available in the original-format panel below."
            : "完整响应仍保留在下方原始格式面板中。"}
      </p>
    </div>
  );
}

function OutputStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "accent" : ""}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function integerValue(value: unknown): bigint | null {
  if (
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && /^-?\d+$/.test(value))
  ) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return typeof value === "bigint" ? value : null;
}

function isParsedCertificate(
  value: Record<string, unknown> | null,
): value is ParsedCertificate {
  return Boolean(
    value?.kind === "map_collision" &&
      typeof value.dimension === "number" &&
      Array.isArray(value.map) &&
      value.map.every(
        (component) =>
          Array.isArray(component) &&
          component.every(
            (term) =>
              Boolean(term) &&
              typeof term === "object" &&
              Array.isArray((term as Record<string, unknown>).e),
          ),
      ) &&
      Array.isArray(value.points) &&
      value.points.every(Array.isArray),
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
