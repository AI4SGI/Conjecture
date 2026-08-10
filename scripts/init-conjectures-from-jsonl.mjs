import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJsonl } from "./lib/result-utils.mjs";

const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith("--"));
if (!inputArg) {
  throw new Error(
    "Usage: node scripts/init-conjectures-from-jsonl.mjs <problems.jsonl> [--output-dir <directory>]",
  );
}
const outputFlag = args.indexOf("--output-dir");
const outputArg = outputFlag >= 0 ? args[outputFlag + 1] : "conjectures/initialized";
if (!outputArg) throw new Error("--output-dir requires a directory.");

const root = process.cwd();
const input = path.resolve(root, inputArg);
const outputDirectory = path.resolve(root, outputArg);
if (input === outputDirectory || outputDirectory.startsWith(`${input}${path.sep}`)) {
  throw new Error("The output directory must not replace or sit inside the JSONL input path.");
}

const problems = await readJsonl(input);

await mkdir(outputDirectory, { recursive: true });
for (const problem of problems) {
  const hasOptimization = Boolean(String(problem.optimization?.problem ?? "").trim());
  const tasks = [
    {
      id: problem.id,
      key: "P1",
      source: "primary",
      title: problem.title,
      titleZh: problem.title,
      subtitle: "Primary verifiable construction",
      subtitleZh: "主要可验证构造",
      tier: "Open-Problem Level",
      tierZh: "开放问题级",
      capability: "Verifiable construction",
      capabilityZh: "可验证构造",
      significance: problem.objective?.success_condition ?? "TODO",
      significanceZh: "TODO",
    },
  ];
  if (hasOptimization) {
    tasks.push({
      id: `${problem.id}__optimization`,
      key: "P2",
      source: "optimization",
      title: "Optimization Track",
      titleZh: "优化赛道",
      subtitle: problem.optimization.metric || "Optimization metric",
      subtitleZh: problem.optimization.metric || "优化指标",
      tier: "Optimization Track",
      tierZh: "优化赛道",
      capability: "Search and optimization",
      capabilityZh: "搜索与优化",
      significance: "Ranks valid near misses without treating them as exact solutions.",
      significanceZh: "对有效近似解排序，但不将其视为精确解。",
    });
  }

  const initialized = {
    schemaVersion: 1,
    id: problem.id,
    slug: problem.id.replaceAll("_", "-"),
    title: problem.title,
    titleZh: problem.title,
    proposed: `Proposed in ${problem.proposed_year ?? "TODO"}`,
    proposedZh: `${problem.proposed_year ?? "TODO"} 年提出`,
    status: problem.status ?? "open",
    statusZh: problem.status ?? "开放",
    author: problem.author ?? "TODO",
    domain: problem.domain ?? "TODO",
    problemSource: path.relative(root, input).split(path.sep).join("/"),
    problemId: problem.id,
    resultsPath: `results/${problem.id}`,
    overview: {
      eyebrow: String(problem.domain ?? "OPEN PROBLEM").toUpperCase(),
      eyebrowZh: problem.domain ?? "开放问题",
      summary: problem.context || problem.original_problem,
      summaryZh: "TODO: localized overview",
      primaryAction: `Explore the ${tasks.length === 1 ? "problem" : "problems"}`,
      primaryActionZh: "查看评测问题",
    },
    visualization: {
      kind: "generic",
      codePath: "src/components/conjecture-visual.tsx",
      label: problem.title,
      labelZh: problem.title,
      example: "TODO",
      caption: "TODO: add a finite example or explanatory visualization.",
      captionZh: "TODO：添加有限示例或解释性可视化。",
    },
    statement: {
      intro: problem.context || "Problem statement",
      introZh: "问题陈述",
      formula: problem.original_problem,
      explanation: problem.original_problem,
      explanationZh: "TODO: localized mathematical statement",
      note: "Finite outputs are evaluated by the declared offline verifier.",
      noteZh: "有限输出由声明的离线验证器核验。",
    },
    atlas: {
      title: `${problem.title} · research timeline`,
      titleZh: `${problem.title} · 研究时间线`,
      body: "TODO: add reviewed milestones with primary-source links.",
      bodyZh: "TODO：添加经核验的里程碑与一手来源链接。",
      events: (problem.source ?? []).map((url, index) => ({
        year: index === 0 ? String(problem.proposed_year ?? "TODO") : "TODO",
        title: index === 0 ? "Problem source" : "Related source",
        titleZh: index === 0 ? "问题来源" : "相关来源",
        description: "TODO",
        descriptionZh: "TODO",
        links: [{ label: "Source", url }],
      })),
    },
    benchmark: {
      name: `OPBench · ${problem.title}`,
      title: tasks.length === 1 ? "One verifiable problem" : `${tasks.length} verifiable problems`,
      titleZh: tasks.length === 1 ? "一道可验证问题" : `${tasks.length} 道可验证问题`,
      body: hasOptimization
        ? "The nonempty optimization field creates a second benchmark task."
        : "The empty optimization field keeps this as a single benchmark task.",
      bodyZh: hasOptimization
        ? "非空 optimization 字段生成第二道评测题。"
        : "空 optimization 字段使该猜想仅包含一道评测题。",
      contextLabel: "Problem context",
      contextLabelZh: "问题背景",
      hintPolicy: "none",
      hintNote: "Open problems are initialized without hints.",
      hintNoteZh: "开放问题初始化为无提示评测。",
      footer: "TODO: document non-machine-verifiable boundaries.",
      footerZh: "TODO：记录无法机器核验的边界。",
      tasks,
    },
    evaluation: {
      title: "Deterministic evaluation",
      titleZh: "确定性评测",
      body: "Outcome categories are derived from the source verifier conditions.",
      bodyZh: "结果类别由源验证器条件导出。",
    },
    symbolicLab: {
      title: "Output contract and offline verifier",
      titleZh: "输出协议与离线验证器",
      body: problem.output_format,
      bodyZh: "TODO: localized verifier description",
      verifierPath: `eval/${problem.eval_code}`,
      interactive: "conditions",
      outputFormat: problem.output_format,
    },
  };

  const destination = path.join(outputDirectory, `${problem.id}.json`);
  try {
    await access(destination);
    throw new Error(`Refusing to overwrite existing file: ${path.relative(root, destination)}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(destination, `${JSON.stringify(initialized, null, 2)}\n`, {
    flag: "wx",
  });
  console.log(`Initialized ${path.relative(root, destination)}`);
}

console.log(`Created ${problems.length} conjecture configuration file(s); source JSONL was not modified.`);
