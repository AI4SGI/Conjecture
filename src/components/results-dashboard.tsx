"use client";

import { AlertTriangle, CheckCircle2, Clock3, Database, ExternalLink, FileJson2, Filter, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BenchmarkData, ConjectureData, FullRecord, Language, RecordBundle, RecordSummary } from "../lib/types";
import { MathText } from "./task-section";

const REPOSITORY = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";

function percent(value: number) {
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : 1)}%`;
}

function duration(seconds: number) {
  if (!seconds) return "0 s";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function outcomeIcon(record: RecordSummary) {
  if (record.eval.official_pass) return <CheckCircle2 size={15} />;
  if (record.analysis.tone === "system") return <AlertTriangle size={15} />;
  return <XCircle size={15} />;
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
  const [modelFilter, setModelFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [hintFilter, setHintFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(data.records[0]?.key ?? "");
  const [bundle, setBundle] = useState<RecordBundle | null>(null);
  const [bundleError, setBundleError] = useState(false);
  const [tab, setTab] = useState<"answer" | "reasoning" | "output" | "evaluation">("answer");

  useEffect(() => {
    setModelFilter("all");
    setTaskFilter("all");
    setHintFilter("all");
    setSelectedKey(data.records[0]?.key ?? "");
    setBundle(null);
    setBundleError(false);
    void fetch(data.dataset.recordBundleUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("bundle unavailable");
        return (await response.json()) as RecordBundle;
      })
      .then(setBundle)
      .catch(() => setBundleError(true));
  }, [data]);

  const outcomeRows = useMemo(() => {
    const groups = new Map<string, { record: RecordSummary; count: number }>();
    for (const record of data.records) {
      const group = groups.get(record.analysis.code);
      if (group) group.count += 1;
      else groups.set(record.analysis.code, { record, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.record.analysis.code.localeCompare(b.record.analysis.code));
  }, [data.records]);

  const filtered = useMemo(
    () =>
      data.records.filter(
        (record) =>
          (modelFilter === "all" || record.model === modelFilter) &&
          (taskFilter === "all" || record.taskKey === taskFilter) &&
          (hintFilter === "all" || record.hintMode === hintFilter),
      ),
    [data.records, hintFilter, modelFilter, taskFilter],
  );
  const selectedSummary = data.records.find((record) => record.key === selectedKey) ?? filtered[0] ?? data.records[0];
  const selectedRecord: FullRecord | undefined = selectedSummary ? bundle?.records[selectedSummary.bundleKey] : undefined;

  function selectRecord(record: RecordSummary) {
    setSelectedKey(record.key);
    setModelFilter(record.model);
    setTaskFilter(record.taskKey);
    if (data.dataset.hintPolicy === "paired") setHintFilter(record.hintMode);
    setTab("answer");
  }

  return (
    <section className="results section-shell" id="results">
      <div className="section-lead">
        <span className="section-index">03 / EVALUATION</span>
        <h2>{english ? content.title : content.titleZh}</h2>
        <p>{english ? content.body : content.bodyZh}</p>
      </div>

      <div className="result-summary-grid">
        <article><Database /><strong>{data.aggregate.records}</strong><span>{english ? "evaluation records" : "评测记录"}</span></article>
        <article><ShieldCheck /><strong>{data.aggregate.officialPasses}</strong><span>{english ? "offline passes" : "离线通过"}</span></article>
        <article><FileJson2 /><strong>{percent(data.aggregate.parseRate)}</strong><span>{english ? "parsed outputs" : "可解析输出"}</span></article>
        <article><Clock3 /><strong>{duration(data.aggregate.inferenceSeconds)}</strong><span>{english ? "total inference" : "总推理时间"}</span></article>
      </div>

      <div className="outcome-section">
        <div className="dashboard-heading">
          <div><span>03A</span><h3>{english ? "Outcome type statistics" : "结果类型统计"}</h3></div>
          <small>{english ? "Categories adapt to this problem's verifier" : "类别随当前问题的验证器自适应"}</small>
        </div>
        <div className="outcome-list">
          {outcomeRows.map(({ record, count }) => (
            <div className={`outcome-row tone-${record.analysis.tone}`} key={record.analysis.code}>
              <span className="outcome-code">{record.analysis.code.replaceAll("_", " ")}</span>
              <div>
                <b>{english ? record.analysis.label : record.analysis.labelZh}</b>
                <small>{english ? record.analysis.short : record.analysis.shortZh}</small>
              </div>
              <strong>{count}</strong>
              <i style={{ "--share": `${data.records.length ? (count / data.records.length) * 100 : 0}%` } as React.CSSProperties} />
            </div>
          ))}
          {outcomeRows.length === 0 ? <p className="empty-task-result">{english ? "No result has been added yet." : "尚未加入评测结果。"}</p> : null}
        </div>
      </div>

      <div className="matrix-section">
        <div className="dashboard-heading">
          <div><span>03B</span><h3>{english ? "Model × problem outcome matrix" : "模型 × 问题结果矩阵"}</h3></div>
          <small>{data.dataset.hintPolicy === "paired" ? (english ? "Each cell may contain no-hint and hint runs" : "每格可包含无提示与有提示运行") : english ? "No-hint evaluation" : "无提示评测"}</small>
        </div>
        <div className="adaptive-matrix" style={{ "--task-count": data.dataset.taskCount } as React.CSSProperties}>
          <div className="matrix-head"><span>{english ? "Model" : "模型"}</span>{data.dataset.tasks.map((task) => <span key={task.key}>{task.key}<small>{english ? task.title : task.titleZh}</small></span>)}</div>
          {data.models.map((model) => (
            <div className="matrix-row" key={model.id}>
              <div className="matrix-model"><b>{model.label}</b><small>{model.records} {english ? "record(s)" : "条记录"}</small></div>
              {data.dataset.tasks.map((task) => {
                const cellRecords = data.records.filter((record) => record.model === model.id && record.taskKey === task.key);
                return (
                  <div className="matrix-cell" key={task.key}>
                    {cellRecords.length ? cellRecords.map((record) => (
                      <button
                        key={record.key}
                        className={`matrix-run tone-${record.analysis.tone} ${record.key === selectedSummary?.key ? "selected" : ""}`}
                        onClick={() => selectRecord(record)}
                        title={`${record.hintMode} · ${record.analysis.code}`}
                      >
                        {outcomeIcon(record)}<span>{data.dataset.hintPolicy === "paired" ? (record.hint ? "H" : "N") : record.repeatIndex + 1}</span>
                      </button>
                    )) : <span className="matrix-run empty">—</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {data.models.length === 0 ? <p className="empty-task-result">{english ? "No model runs are available." : "暂无模型运行。"}</p> : null}
        </div>
      </div>

      <div className="trace-browser">
        <div className="dashboard-heading">
          <div><span>03C</span><h3>{english ? "Auditable evaluation traces" : "可审计评测轨迹"}</h3></div>
          <small>{filtered.length} / {data.records.length}</small>
        </div>
        <div className="trace-filters">
          <Filter size={17} />
          <label>{english ? "Model" : "模型"}<select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="all">{english ? "All models" : "全部模型"}</option>{data.models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
          <label>{english ? "Problem" : "题目"}<select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option value="all">{english ? "All problems" : "全部题目"}</option>{data.dataset.tasks.map((task) => <option value={task.key} key={task.key}>{task.key} · {english ? task.title : task.titleZh}</option>)}</select></label>
          {data.dataset.hintPolicy === "paired" ? <label>{english ? "Prompt" : "提示"}<select value={hintFilter} onChange={(event) => setHintFilter(event.target.value)}><option value="all">{english ? "All modes" : "全部模式"}</option><option value="nohint">{english ? "No hint" : "无提示"}</option><option value="hint">{english ? "With hint" : "有提示"}</option></select></label> : <span className="no-hint-badge">{english ? "NO HINT PROVIDED" : "不提供提示"}</span>}
        </div>

        <div className="trace-layout">
          <div className="trace-list">
            {filtered.map((record) => (
              <button className={`trace-item ${record.key === selectedSummary?.key ? "active" : ""}`} key={record.key} onClick={() => setSelectedKey(record.key)}>
                <span className={`trace-status tone-${record.analysis.tone}`}>{outcomeIcon(record)}</span>
                <span><b>{record.modelLabel}</b><small>{record.taskKey} · {record.hintMode} · run {record.repeatIndex + 1}</small></span>
                <code>{record.analysis.code}</code>
              </button>
            ))}
            {!filtered.length ? <p className="empty-task-result">{english ? "No trace matches these filters." : "没有符合筛选条件的轨迹。"}</p> : null}
          </div>

          {selectedSummary ? (
            <article className="trace-detail">
              <div className="trace-detail-head">
                <div><span>{selectedSummary.taskKey} · {selectedSummary.hintMode}</span><h3>{selectedSummary.modelLabel}</h3><p>{english ? selectedSummary.analysis.label : selectedSummary.analysis.labelZh}</p></div>
                <span className={`official-status ${selectedSummary.eval.official_pass ? "pass" : "fail"}`}>{selectedSummary.eval.official_pass ? (english ? "OFFLINE PASS" : "离线通过") : english ? "OFFLINE FAIL" : "离线失败"}</span>
              </div>
              <div className="result-analysis">
                <b>{english ? "DETERMINISTIC OUTCOME ATTRIBUTION" : "确定性结果归因"}</b>
                <p>{english ? selectedSummary.analysis.detail : selectedSummary.analysis.detailZh}</p>
              </div>
              <div className="record-provenance">
                <span>{selectedSummary.sourcePath}</span>
                <a href={`https://github.com/${REPOSITORY}/blob/main/${selectedSummary.sourcePath}`} target="_blank" rel="noreferrer">{english ? "Source result" : "源结果"} <ExternalLink size={13} /></a>
              </div>
              <div className="trace-tabs" role="tablist">
                {(["answer", "reasoning", "output", "evaluation"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}
              </div>
              <div className="trace-content">
                {!bundle && !bundleError ? <p>{english ? "Loading the conjecture evaluation bundle…" : "正在载入该猜想的评测包…"}</p> : null}
                {bundleError ? <p>{english ? "The evaluation bundle could not be loaded." : "评测包载入失败。"}</p> : null}
                {selectedRecord && tab === "answer" ? <MathText>{String(selectedRecord.content ?? "")}</MathText> : null}
                {selectedRecord && tab === "reasoning" ? <MathText>{String(selectedRecord.reasoning_content ?? "")}</MathText> : null}
                {selectedRecord && tab === "output" ? <pre><code>{pretty(selectedRecord.output)}</code></pre> : null}
                {selectedRecord && tab === "evaluation" ? (
                  <div className="evaluation-detail">
                    {selectedRecord.normalized_evaluation.verification_conditions.map((condition) => <div className={condition.passed ? "pass" : "fail"} key={`${condition.condition_id}-${condition.condition}`}><b>{condition.passed ? "PASS" : "FAIL"}</b><span><MathText>{condition.condition}</MathText><small>{condition.reason}</small></span></div>)}
                    <pre><code>{pretty({ metrics: selectedRecord.normalized_evaluation.metrics, metric: selectedRecord.normalized_evaluation.metric, error: selectedRecord.normalized_evaluation.error })}</code></pre>
                  </div>
                ) : null}
              </div>
            </article>
          ) : <div className="trace-detail empty-task-result">{english ? "Select a record to inspect it." : "请选择记录查看详情。"}</div>}
        </div>
      </div>
    </section>
  );
}
