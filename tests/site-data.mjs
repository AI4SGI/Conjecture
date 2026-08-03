import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const benchmark = JSON.parse(
  await readFile(path.join(root, "src/data/benchmark.json"), "utf8"),
);
const generatedNews = JSON.parse(
  await readFile(path.join(root, "src/data/frontier-news.json"), "utf8"),
);
const problemLines = (await readFile(
  path.join(root, "problems/jacobian_conjecture.jsonl"),
  "utf8",
))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

assert.equal(problemLines.length, 5, "the site must expose five benchmark tasks");
assert.equal(
  new Set(problemLines.map((problem) => problem.context)).size,
  1,
  "all tasks must share one context",
);
assert(
  problemLines.every(
    (problem) =>
      problem.context.includes("\\mathbb{C}") &&
      problem.question.includes("\\mathbb{C}") &&
      problem.hint.includes("\\det J_F"),
  ),
  "context, question, and hint formulas must use LaTeX notation",
);
assert.deepEqual(
  benchmark.models.map((model) => model.label),
  [
    "Claude-Opus-4.8-Thinking",
    "Gemini-3.1-Pro-Preview-Thinking",
    "GLM-5.2",
    "GPT-5.5 (xhigh)",
    "Kimi-K3",
  ],
  "public model labels must use the canonical display names",
);
assert.deepEqual(
  benchmark.dataset.tasks
    .filter((task) => ["P3", "P4"].includes(task.key))
    .map((task) => task.tier),
  ["Research", "Research"],
  "P3 and P4 must both be research-level tasks",
);
assert(
  problemLines[2].question.includes(
    "strictly smaller than the currently known minimum \\(7\\)",
  ),
  "P3 must target an improvement over the known degree-seven construction",
);
assert.equal(
  problemLines[3].constraints.generic_fiber_degree,
  4,
  "P4 must target generic fiber degree four",
);
assert.equal(
  problemLines[3].objective.value,
  11,
  "P4 must improve the known degree-twelve construction",
);

const newsLines = (await readFile(
  path.join(root, "news/frontier_news.jsonl"),
  "utf8",
))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
assert(
  newsLines.length >= 12,
  "the timeline should cover the major 2026 AI-mathematics developments",
);
assert.deepEqual(
  generatedNews,
  newsLines,
  "generated frontier news must exactly follow the standalone JSONL source",
);
assert.deepEqual(
  newsLines.map((item) => item.date),
  newsLines.map((item) => item.date).sort().reverse(),
  "frontier news must be sorted newest first",
);
assert.equal(
  new Set(newsLines.map((item) => item.id)).size,
  newsLines.length,
  "frontier news ids must be unique",
);
assert(
  newsLines.every(
    (item) =>
      item.label.includes(" · ") &&
      item.link.startsWith("https://") &&
      item.statusLabel,
  ),
  "each news item needs a normalized label, source link, and status",
);

const sourceFiles = [];
for (const model of await readdir(path.join(root, "results"))) {
  const modelPath = path.join(root, "results", model);
  let files;
  try {
    files = await readdir(modelPath);
  } catch {
    continue;
  }
  for (const file of files) {
    if (/^jacobian_conjecture_\d+_(?:nohint|hint)_\d+\.json$/.test(file)) {
      sourceFiles.push(path.join(modelPath, file));
    }
  }
}

assert.equal(
  benchmark.dataset.resultCount,
  sourceFiles.length,
  "generated result count must match the source result files",
);
assert.equal(
  benchmark.records.length,
  sourceFiles.length,
  "every source result must have one summary",
);

const allowedCodes = new Set([
  "verified_counterexample",
  "constraint_miss",
  "api_failure",
  "missing_certificate",
  "format_error",
  "jacobian_failure",
  "collision_failure",
  "duplicate_points",
]);
const actualCodes = new Set(
  benchmark.records.map((record) => record.analysis?.code),
);
assert(actualCodes.size > 0, "deterministic outcome categories must not be empty");
for (const code of actualCodes) {
  assert(allowedCodes.has(code), `unexpected deterministic outcome category: ${code}`);
}

for (const summary of benchmark.records) {
  assert(summary.analysis?.label, `${summary.key} lacks reader-facing analysis`);
  const publicPath = path.join(root, "public", summary.url);
  const publicRecord = JSON.parse(await readFile(publicPath, "utf8"));
  const sourcePath = path.join(root, publicRecord.source.file);
  const sourceText = await readFile(sourcePath, "utf8");
  const digest = createHash("sha256").update(sourceText).digest("hex");
  assert.equal(
    publicRecord.source.sha256,
    digest,
    `${summary.key} source hash mismatch`,
  );
  assert.deepEqual(
    publicRecord.analysis,
    summary.analysis,
    `${summary.key} analysis mismatch`,
  );
}

console.log(
  `Site data audit passed: ${problemLines.length} tasks, ${sourceFiles.length} records, ${newsLines.length} news items, ${actualCodes.size} outcome categories.`,
);
