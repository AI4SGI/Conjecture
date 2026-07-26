import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const problemsPath = path.join(root, "problems", "jacobian_conjecture.jsonl");
const resultsRoot = path.join(root, "results");
const publicRecords = path.join(root, "public", "data", "records");
const generatedData = path.join(root, "src", "data");

const taskEditorial = {
  jacobian_conjecture_1: {
    key: "P1",
    title: "开放构造",
    subtitle: "三维 · 无次数上限",
    tier: "Exploration",
    tierLabel: "探索级",
    capability: "从零构造与全局代数推理",
    significance:
      "检验模型能否越过局部可逆性的直觉陷阱，独立提出与已知构造不等价的全局碰撞机制。",
    questionZh:
      "在三维复空间中构造一个反例；不限制次数或稀疏性，但必须与参考构造代数不等价。",
  },
  jacobian_conjecture_2: {
    key: "P2",
    title: "七次边界",
    subtitle: "三维 · max degree ≤ 7",
    tier: "Constrained",
    tierLabel: "约束级",
    capability: "紧次数预算下的新颖构造",
    significance:
      "在已知次数尺度内要求全新代数结构，同时验证常雅可比、碰撞证书与代数系数，兼顾搜索和证明。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 7，并给出同一纤维中至少两个不同的代数点；不得提交参考构造的等价表达。",
  },
  jacobian_conjecture_3: {
    key: "P3",
    title: "六次压缩",
    subtitle: "三维 · max degree ≤ 6",
    tier: "Frontier",
    tierLabel: "前沿级",
    capability: "结构压缩与更低次数搜索",
    significance:
      "把最高次数从已知七次结构继续压低；若成功，将给出更短、更易分析的反例证书。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 6，并给出同一纤维中至少两个不同的代数点。",
  },
  jacobian_conjecture_4: {
    key: "P4",
    title: "四点纤维",
    subtitle: "三维 · ≥ 4 点 · max degree ≤ 11",
    tier: "Frontier+",
    tierLabel: "研究级",
    capability: "纤维工程与次数控制",
    significance:
      "要求在较低次数预算下显式制造更高重数纤维，考察模型是否理解非适当性、纤维度数与碰撞结构。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 11，并给出同一纤维中至少四个不同的代数点。",
  },
  jacobian_conjecture_5: {
    key: "P5",
    title: "二维前沿",
    subtitle: "二维 · 无次数上限",
    tier: "Open Frontier",
    tierLabel: "开放问题级",
    capability: "识别开放边界与拒绝伪证",
    significance:
      "二维情形仍是独立前沿。该题不仅测试构造能力，也测试模型能否避免把三维结构或局部证据误报为二维反例。",
    questionZh:
      "在二维复空间中构造一个反例；不限制次数或稀疏性，并给出可由确定性程序核验的碰撞证书。",
  },
};

const modelEditorial = {
  "claude-opus-4-8-thinking": {
    label: "Claude Opus 4.8 Thinking",
    short: "Claude Opus 4.8",
  },
  "gemini-3.1-pro-preview-thinking": {
    label: "Gemini 3.1 Pro Preview Thinking",
    short: "Gemini 3.1 Pro",
  },
  "glm-5.2": { label: "GLM-5.2", short: "GLM-5.2" },
  "gpt-5.5-xhigh": { label: "GPT-5.5 xhigh", short: "GPT-5.5" },
  "kimi-k3": { label: "Kimi K3", short: "Kimi K3" },
};

function analyzeOutcome(record) {
  const error = String(record.eval?.error ?? "");

  if (record.eval?.official_pass) {
    return {
      code: "verified_counterexample",
      label: "已验证反例",
      short: "程序确认雅可比、碰撞点与任务约束均成立。",
      detail:
        "该记录通过离线确定性验证。若题目另含全局新颖性要求，其代数不等价性仍需人工研究确认。",
      tone: "pass",
    };
  }

  if (record.eval?.math_valid && !record.eval?.objective_pass) {
    return {
      code: "constraint_miss",
      label: "反例有效，但未满足任务约束",
      short: "基础反例证书成立，但次数上限、纤维大小或本题专项指标没有通过。",
      detail:
        "这不是伪反例；失败发生在题目目标层。评测详情中的 metrics 给出具体约束测量值。",
      tone: "near",
    };
  }

  if (/timeout|504|internalserver|bad response|openai_error/i.test(error)) {
    return {
      code: "api_failure",
      label: "接口异常，未形成可评测回答",
      short: "请求超时或上游服务返回异常，因此不能据此判断模型的数学能力。",
      detail:
        "该记录计入运行完整性统计，但应与模型主动提交的错误答案分开解读。",
      tone: "system",
    };
  }

  if (/missing FINAL_CERTIFICATE_JSON/i.test(error)) {
    return {
      code: "missing_certificate",
      label: "未提交可评测证书",
      short: "回答中没有找到约定的 FINAL_CERTIFICATE_JSON 区块。",
      detail:
        "模型可能进行了推理或拒答，但没有提供离线验证器所需的结构化最终证书。",
      tone: "protocol",
    };
  }

  if (/unsupported keys|certificate.*(?:schema|format)|invalid json/i.test(error)) {
    return {
      code: "format_error",
      label: "证书格式不符合协议",
      short: "模型给出了证书片段，但字段集合或结构不满足标准输出协议。",
      detail:
        "这是可执行性失败：验证器拒绝未声明字段，避免用自然语言补全或猜测模型意图。",
      tone: "protocol",
    };
  }

  if (/Jacobian determinant is not a nonzero constant/i.test(error)) {
    return {
      code: "jacobian_failure",
      label: "错误反例：雅可比条件失败",
      short: "候选映射的雅可比行列式不是非零常数。",
      detail:
        "该候选不满足问题的局部非奇异性前提，因此不能构成反例。",
      tone: "math",
    };
  }

  if (/do not have a common image/i.test(error)) {
    return {
      code: "collision_failure",
      label: "错误反例：碰撞证书失败",
      short: "提交的不同点经候选映射后没有得到同一个像。",
      detail:
        "即使映射可能满足常雅可比，本次提交也未证明非单射性。",
      tone: "math",
    };
  }

  if (/pairwise distinct/i.test(error)) {
    return {
      code: "duplicate_points",
      label: "错误反例：碰撞点不互异",
      short: "所谓碰撞使用了重复点，无法证明映射不是单射。",
      detail:
        "反例证书要求至少两个两两不同的代数点位于同一纤维。",
      tone: "math",
    };
  }

  return {
    code: "invalid_certificate",
    label: "证书未通过验证",
    short: "确定性程序未能确认该提交同时满足全部代数条件。",
    detail:
      error || "基础证书或任务目标未通过；请查看完整评测对象了解机器记录。",
    tone: "math",
  };
}

function sum(records, getter) {
  return records.reduce((total, record) => total + (getter(record) || 0), 0);
}

function summarize(records) {
  const officialPasses = records.filter((record) => record.eval.official_pass).length;
  const mathValid = records.filter((record) => record.eval.math_valid).length;
  const parsed = records.filter((record) => record.eval.certificate_parsed).length;
  const apiErrors = records.filter(
    (record) =>
      record.eval.error &&
      /timeout|504|internalserver|bad response/i.test(record.eval.error),
  ).length;
  const usage = {
    prompt_tokens: sum(records, (record) => record.usage?.prompt_tokens),
    completion_tokens: sum(records, (record) => record.usage?.completion_tokens),
    reasoning_tokens: sum(records, (record) => record.usage?.reasoning_tokens),
    total_tokens: sum(records, (record) => record.usage?.total_tokens),
  };
  return {
    records: records.length,
    officialPasses,
    mathValid,
    parsed,
    apiErrors,
    passRate: records.length ? officialPasses / records.length : 0,
    parseRate: records.length ? parsed / records.length : 0,
    mathValidRate: records.length ? mathValid / records.length : 0,
    inferenceSeconds: sum(records, (record) => record.timing?.inference_seconds),
    verificationSeconds: sum(
      records,
      (record) => record.timing?.verification_seconds,
    ),
    usage,
  };
}

await mkdir(publicRecords, { recursive: true });
await mkdir(generatedData, { recursive: true });

const problemLines = (await readFile(problemsPath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean);
const problems = problemLines.map((line) => JSON.parse(line));
const context = problems[0]?.context ?? "";
if (!problems.every((problem) => problem.context === context)) {
  throw new Error("All benchmark tasks must share the same context.");
}

const records = [];
const modelDirs = (await readdir(resultsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const model of modelDirs) {
  const modelPath = path.join(resultsRoot, model);
  const files = (await readdir(modelPath))
    .filter((file) => /^jacobian_conjecture_\d+_(?:nohint|hint)_\d+\.json$/.test(file))
    .sort();
  for (const file of files) {
    const sourceText = await readFile(path.join(modelPath, file), "utf8");
    const record = JSON.parse(sourceText);
    const slug = `${model}--${file.replace(/\.json$/, "")}`;
    const analysis = analyzeOutcome(record);
    const publicRecord = {
      ...record,
      analysis,
      source: {
        file: `results/${model}/${file}`,
        sha256: createHash("sha256").update(sourceText).digest("hex"),
      },
    };
    await writeFile(
      path.join(publicRecords, `${slug}.json`),
      `${JSON.stringify(publicRecord)}\n`,
    );
    records.push({
      key: slug,
      id: record.id,
      taskKey: taskEditorial[record.id]?.key,
      model,
      modelLabel: modelEditorial[model]?.label ?? model,
      hint: Boolean(record.hint),
      repeatIndex: record.repeat_index,
      parameters: record.parameters,
      eval: record.eval,
      analysis,
      timing: record.timing,
      usage: record.usage,
      contentChars: String(record.content ?? "").length,
      reasoningChars: String(record.reasoning_content ?? "").length,
      outputChars: String(record.output ?? "").length,
      url: `/data/records/${slug}.json`,
    });
  }
}

const tasks = problems.map((problem) => ({
  ...problem,
  ...taskEditorial[problem.id],
}));

const models = modelDirs.map((id) => {
  const modelRecords = records.filter((record) => record.model === id);
  return {
    id,
    ...(modelEditorial[id] ?? { label: id, short: id }),
    ...summarize(modelRecords),
  };
});

const benchmark = {
  generatedAt: new Date().toISOString(),
  dataset: {
    name: "Jacobian Counterexample Construction",
    context,
    tasks,
    taskCount: tasks.length,
    resultCount: records.length,
    modelCount: models.length,
    hintModes: ["nohint", "hint"],
    deterministic: true,
  },
  aggregate: summarize(records),
  models,
  records,
};

await writeFile(
  path.join(generatedData, "benchmark.json"),
  `${JSON.stringify(benchmark, null, 2)}\n`,
);

console.log(
  `Generated site data: ${tasks.length} tasks, ${models.length} models, ${records.length} records.`,
);
