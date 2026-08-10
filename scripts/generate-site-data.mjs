import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildTasks,
  createAnnotation,
  discoverResults,
  loadConjectureCatalog,
  modelLabel,
  normalizeEvaluation,
  normalizeUsage,
  readJsonl,
  recordModel,
  recordParameters,
  summarize,
} from "./lib/result-utils.mjs";

const siteBasePath = String(process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .replace(/\/+$/, "")
  .replace(/^([^/])/, "/$1");
const root = process.cwd();
const newsPath = path.join(root, "news", "frontier_news.jsonl");
const publicEvaluations = path.join(root, "public", "data", "evaluations");
const generatedData = path.join(root, "src", "data");

await mkdir(publicEvaluations, { recursive: true });
await mkdir(generatedData, { recursive: true });

const { index, conjectures } = await loadConjectureCatalog(root);
if (new Set(conjectures.map((item) => item.id)).size !== conjectures.length) {
  throw new Error("Conjecture ids must be unique.");
}

const problemCache = new Map();
async function problemsFor(config) {
  if (!problemCache.has(config.problemSource)) {
    problemCache.set(
      config.problemSource,
      await readJsonl(path.join(root, config.problemSource)),
    );
  }
  const all = problemCache.get(config.problemSource);
  return config.problemId
    ? all.filter((problem) => problem.id === config.problemId)
    : all;
}

function relativePath(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function recordTiming(record) {
  return {
    inference_seconds: Number(
      record.timing?.inference_seconds ?? record.inference_seconds ?? 0,
    ),
    verification_seconds: Number(record.timing?.verification_seconds ?? 0),
  };
}

const generatedConjectures = [];
for (const config of conjectures) {
  const problems = await problemsFor(config);
  const tasks = buildTasks(config, problems);
  const taskById = new Map(
    tasks
      .filter((task) => task.source !== "optimization")
      .map((task) => [task.id, task]),
  );
  const summaries = [];
  const fullRecords = {};

  for (const { file, record } of await discoverResults(root, config)) {
    const sourceText = await readFile(file, "utf8");
    const source = relativePath(file);
    const model = recordModel(record);
    const task = taskById.get(record.id);
    if (!task) throw new Error(`${source} references unknown task ${record.id}.`);
    const relativeResult = path.relative(path.join(root, config.resultsPath), file);
    const key = `${config.id}--${relativeResult.replaceAll(path.sep, "--").replace(/\.json$/, "")}`;
    const evaluation = normalizeEvaluation(record);
    const annotation = createAnnotation(config, record);
    const analysis = annotation.outcome;
    const timing = recordTiming(record);
    const usage = normalizeUsage(record.usage);
    const outputText =
      typeof record.output === "string"
        ? record.output
        : JSON.stringify(record.output ?? null, null, 2);
    fullRecords[key] = {
      ...record,
      opbench_annotation: annotation,
      normalized_evaluation: evaluation,
      source: {
        file: source,
        sha256: createHash("sha256").update(sourceText).digest("hex"),
      },
    };
    summaries.push({
      key,
      id: record.id,
      taskKey: task.key,
      model,
      modelLabel: modelLabel(model),
      hint: Boolean(record.hint),
      hintMode: record.hint ? "hint" : "nohint",
      repeatIndex:
        record.repeat_index != null
          ? Number(record.repeat_index)
          : record.rollout_index != null
            ? Number(record.rollout_index) + 1
            : 1,
      parameters: recordParameters(record),
      eval: evaluation,
      analysis,
      timing,
      usage,
      contentChars: String(record.content ?? "").length,
      reasoningChars: String(record.reasoning_content ?? "").length,
      outputChars: outputText.length,
      bundleKey: key,
      sourcePath: source,
    });
  }

  summaries.sort((a, b) =>
    [a.model, a.taskKey, a.hintMode, a.repeatIndex]
      .join("|")
      .localeCompare([b.model, b.taskKey, b.hintMode, b.repeatIndex].join("|")),
  );
  const modelIds = [...new Set(summaries.map((record) => record.model))].sort();
  const models = modelIds.map((id) => {
    const modelRecords = summaries.filter((record) => record.model === id);
    return {
      id,
      label: modelLabel(id),
      short: modelLabel(id),
      ...summarize(modelRecords),
    };
  });
  const context = tasks[0]?.context ?? "";
  const hintModes = config.benchmark.hintPolicy === "paired" ? ["nohint", "hint"] : ["nohint"];
  const bundleUrl = `${siteBasePath}/data/evaluations/${config.id}.json`;
  const benchmarkData = {
    generatedAt: new Date().toISOString(),
    dataset: {
      id: config.id,
      name: config.benchmark.name,
      context,
      tasks,
      taskCount: tasks.length,
      resultCount: summaries.length,
      modelCount: models.length,
      hintModes,
      hintPolicy: config.benchmark.hintPolicy,
      deterministic: true,
      recordBundleUrl: bundleUrl,
    },
    aggregate: summarize(summaries),
    models,
    records: summaries,
  };

  await writeFile(
    path.join(publicEvaluations, `${config.id}.json`),
    `${JSON.stringify({ schemaVersion: 1, conjectureId: config.id, records: fullRecords })}\n`,
  );
  generatedConjectures.push({ ...config, benchmarkData });
}

const news = await readJsonl(newsPath);
const requiredNewsFields = [
  "id",
  "date",
  "label",
  "title",
  "content",
  "link",
  "source",
  "status",
  "statusLabel",
  "labelZh",
  "titleZh",
  "contentZh",
  "statusLabelZh",
];
for (const [indexValue, item] of news.entries()) {
  for (const field of requiredNewsFields) {
    if (typeof item[field] !== "string" || !item[field].trim()) {
      throw new Error(`Frontier news line ${indexValue + 1} lacks ${field}.`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    throw new Error(`Frontier news line ${indexValue + 1} has an invalid date.`);
  }
  const link = new URL(item.link);
  if (!['https:', 'http:'].includes(link.protocol)) {
    throw new Error(`Frontier news line ${indexValue + 1} has an invalid link.`);
  }
}
if (new Set(news.map((item) => item.id)).size !== news.length) {
  throw new Error("Frontier news ids must be unique.");
}
for (let indexValue = 1; indexValue < news.length; indexValue += 1) {
  if (news[indexValue - 1].date < news[indexValue].date) {
    throw new Error("Frontier news must be sorted newest first.");
  }
}

const site = {
  schemaVersion: index.schemaVersion,
  generatedAt: new Date().toISOString(),
  conjectures: generatedConjectures,
};
await writeFile(
  path.join(generatedData, "site.json"),
  `${JSON.stringify(site, null, 2)}\n`,
);
await writeFile(
  path.join(generatedData, "frontier-news.json"),
  `${JSON.stringify(news, null, 2)}\n`,
);

const totals = generatedConjectures.reduce(
  (result, item) => ({
    tasks: result.tasks + item.benchmarkData.dataset.taskCount,
    records: result.records + item.benchmarkData.dataset.resultCount,
  }),
  { tasks: 0, records: 0 },
);
console.log(
  `Generated OPBench site data: ${generatedConjectures.length} conjectures, ${totals.tasks} tasks, ${totals.records} records, ${news.length} news items.`,
);
