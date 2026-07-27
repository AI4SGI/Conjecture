import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const siteBasePath = String(process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .replace(/\/+$/, "")
  .replace(/^([^/])/, "/$1");

const root = process.cwd();
const problemsPath = path.join(root, "problems", "jacobian_conjecture.jsonl");
const resultsRoot = path.join(root, "results");
const publicRecords = path.join(root, "public", "data", "records");
const generatedData = path.join(root, "src", "data");

const taskEditorial = {
  jacobian_conjecture_1: {
    key: "P1",
    title: "Open Construction",
    subtitle: "Complex dimension 3 · no degree bound",
    tier: "Exploration",
    tierLabel: "Exploration Level",
    capability: "De novo construction and global algebraic reasoning",
    significance:
      "Tests whether a model can move beyond local-invertibility intuition and propose a genuinely new global collision mechanism.",
    titleZh: "开放构造",
    subtitleZh: "三维 · 无次数上限",
    tierLabelZh: "探索级",
    capabilityZh: "从零构造与全局代数推理",
    significanceZh:
      "检验模型能否越过局部可逆性的直觉陷阱，独立提出与已知构造不等价的全局碰撞机制。",
    questionZh:
      "在三维复空间中构造一个反例；不限制次数或稀疏性，但必须与参考构造代数不等价。",
  },
  jacobian_conjecture_2: {
    key: "P2",
    title: "Degree-Seven Boundary",
    subtitle: "Complex dimension 3 · max degree ≤ 7",
    tier: "Constrained",
    tierLabel: "Constrained Level",
    capability: "Novel construction under a tight degree budget",
    significance:
      "Demands a new algebraic structure at the known degree scale while jointly testing the constant-Jacobian and collision conditions.",
    titleZh: "七次边界",
    subtitleZh: "三维 · max degree ≤ 7",
    tierLabelZh: "约束级",
    capabilityZh: "紧次数预算下的新颖构造",
    significanceZh:
      "在已知次数尺度内要求全新代数结构，同时验证常雅可比、碰撞证书与代数系数，兼顾搜索和证明。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 7，并给出同一纤维中至少两个不同的代数点；不得提交参考构造的等价表达。",
  },
  jacobian_conjecture_3: {
    key: "P3",
    title: "Degree-Six Compression",
    subtitle: "Complex dimension 3 · max degree ≤ 6",
    tier: "Research",
    tierLabel: "Research Level",
    capability: "Structural compression and lower-degree search",
    significance:
      "Pushes below the known degree-seven scale; success would expose a shorter and potentially more interpretable counterexample structure.",
    titleZh: "六次压缩",
    subtitleZh: "三维 · max degree ≤ 6",
    tierLabelZh: "研究级",
    capabilityZh: "结构压缩与更低次数搜索",
    significanceZh:
      "把最高次数从已知七次结构继续压低；若成功，将给出更短、更易分析的反例证书。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 6，并给出同一纤维中至少两个不同的代数点。",
  },
  jacobian_conjecture_4: {
    key: "P4",
    title: "Four-Point Fiber",
    subtitle: "Complex dimension 3 · ≥ 4 points · max degree ≤ 11",
    tier: "Research",
    tierLabel: "Research Level",
    capability: "Fiber engineering under degree control",
    significance:
      "Requires an explicit higher-cardinality fiber under a controlled degree budget, probing non-properness and collision geometry.",
    titleZh: "四点纤维",
    subtitleZh: "三维 · ≥ 4 点 · max degree ≤ 11",
    tierLabelZh: "研究级",
    capabilityZh: "纤维工程与次数控制",
    significanceZh:
      "要求在较低次数预算下显式制造更高重数纤维，考察模型是否理解非适当性、纤维度数与碰撞结构。",
    questionZh:
      "构造三维复多项式反例，分量最高次数不超过 11，并给出同一纤维中至少四个不同的代数点。",
  },
  jacobian_conjecture_5: {
    key: "P5",
    title: "Two-Dimensional Frontier",
    subtitle: "Complex dimension 2 · no degree bound",
    tier: "Open Frontier",
    tierLabel: "Open-Problem Level",
    capability: "Recognizing an open boundary and rejecting false certificates",
    significance:
      "The two-dimensional case remains open. This task tests both construction and the discipline to avoid misreporting 3D or merely local evidence.",
    titleZh: "二维前沿",
    subtitleZh: "二维 · 无次数上限",
    tierLabelZh: "开放问题级",
    capabilityZh: "识别开放边界与拒绝伪证",
    significanceZh:
      "二维情形仍是独立前沿。该题不仅测试构造能力，也测试模型能否避免把三维结构或局部证据误报为二维反例。",
    questionZh:
      "在二维复空间中构造一个反例；不限制次数或稀疏性，并给出可由确定性程序核验的碰撞证书。",
  },
};

const modelEditorial = {
  "claude-opus-4-8-thinking": {
    label: "Claude-Opus-4.8-Thinking",
    short: "Claude-Opus-4.8-Thinking",
  },
  "gemini-3.1-pro-preview-thinking": {
    label: "Gemini-3.1-Pro-Preview-Thinking",
    short: "Gemini-3.1-Pro-Preview-Thinking",
  },
  "glm-5.2": { label: "GLM-5.2", short: "GLM-5.2" },
  "gpt-5.5-xhigh": { label: "GPT-5.5 (xhigh)", short: "GPT-5.5 (xhigh)" },
  "kimi-k3": { label: "Kimi-K3", short: "Kimi-K3" },
};

function analyzeOutcome(record) {
  const error = String(record.eval?.error ?? "");

  if (record.eval?.official_pass) {
    return {
      code: "verified_counterexample",
      label: "Verified counterexample (novelty not assessed)",
      short:
        "The offline verifier confirmed the Jacobian, collision, and task constraints.",
      detail:
        "The algebraic certificate passed deterministic verification. Any global novelty or inequivalence requirement remains a separate research question.",
      labelZh: "已验证反例（未验证创新性）",
      shortZh: "程序确认雅可比、碰撞点与任务约束均成立。",
      detailZh:
        "该记录通过离线确定性验证。若题目另含全局新颖性要求，其代数不等价性仍需人工研究确认。",
      tone: "pass",
    };
  }

  if (record.eval?.math_valid && !record.eval?.objective_pass) {
    return {
      code: "constraint_miss",
      label: "Valid counterexample, but task constraints were missed",
      short:
        "The base certificate is valid, but a degree, fiber-size, or task-specific constraint failed.",
      detail:
        "This is not a false counterexample; the failure occurs at the task-objective layer. See metrics for the measured constraint.",
      labelZh: "反例有效，但未满足任务约束",
      shortZh: "基础反例证书成立，但次数上限、纤维大小或本题专项指标没有通过。",
      detailZh:
        "这不是伪反例；失败发生在题目目标层。评测详情中的 metrics 给出具体约束测量值。",
      tone: "near",
    };
  }

  if (/timeout|504|internalserver|bad response|openai_error/i.test(error)) {
    return {
      code: "api_failure",
      label: "Model response failure",
      short:
        "The request timed out or the upstream service failed before an evaluable response was produced.",
      detail:
        "This counts toward run reliability, but should be interpreted separately from a model-submitted mathematical error.",
      labelZh: "模型响应异常",
      shortZh: "请求超时或上游服务返回异常，因此不能据此判断模型的数学能力。",
      detailZh:
        "该记录计入运行完整性统计，但应与模型主动提交的错误答案分开解读。",
      tone: "system",
    };
  }

  if (/missing FINAL_CERTIFICATE_JSON/i.test(error)) {
    return {
      code: "missing_certificate",
      label: "No evaluable counterexample submitted",
      short:
        "The response did not contain the required FINAL_CERTIFICATE_JSON block.",
      detail:
        "The model may have reasoned or declined, but it did not provide the structured object required by the offline verifier.",
      labelZh: "未提交可评测反例",
      shortZh: "回答中没有找到约定的 FINAL_CERTIFICATE_JSON 区块。",
      detailZh:
        "模型可能进行了推理或拒答，但没有提供离线验证器所需的结构化最终证书。",
      tone: "protocol",
    };
  }

  if (/unsupported keys|certificate.*(?:schema|format)|invalid json/i.test(error)) {
    return {
      code: "format_error",
      label: "Counterexample format does not follow the evaluation protocol",
      short:
        "A certificate fragment was present, but its fields or structure violated the standard output schema.",
      detail:
        "This is an executability failure: the verifier does not infer missing structure or guess intent from prose.",
      labelZh: "反例格式不符合评测协议",
      shortZh: "模型给出了证书片段，但字段集合或结构不满足标准输出协议。",
      detailZh:
        "这是可执行性失败：验证器拒绝未声明字段，避免用自然语言补全或猜测模型意图。",
      tone: "protocol",
    };
  }

  if (/Jacobian determinant is not a nonzero constant/i.test(error)) {
    return {
      code: "jacobian_failure",
      label: "False counterexample: Jacobian condition failed",
      short:
        "The candidate map does not have a nonzero constant Jacobian determinant.",
      detail:
        "The candidate violates the local nonsingularity premise and therefore cannot be a counterexample.",
      labelZh: "错误反例：雅可比条件失败",
      shortZh: "候选映射的雅可比行列式不是非零常数。",
      detailZh: "该候选不满足问题的局部非奇异性前提，因此不能构成反例。",
      tone: "math",
    };
  }

  if (/do not have a common image/i.test(error)) {
    return {
      code: "collision_failure",
      label: "False counterexample: collision certificate failed",
      short:
        "The submitted points do not share a common image under the candidate map.",
      detail:
        "Even if the map has constant Jacobian, this submission does not establish non-injectivity.",
      labelZh: "错误反例：碰撞证书失败",
      shortZh: "提交的不同点经候选映射后没有得到同一个像。",
      detailZh: "即使映射可能满足常雅可比，本次提交也未证明非单射性。",
      tone: "math",
    };
  }

  if (/pairwise distinct/i.test(error)) {
    return {
      code: "duplicate_points",
      label: "False counterexample: collision points are not distinct",
      short:
        "The claimed collision repeats an input point and cannot establish non-injectivity.",
      detail:
        "A counterexample certificate requires at least two pairwise-distinct algebraic points in one fiber.",
      labelZh: "错误反例：碰撞点不互异",
      shortZh: "所谓碰撞使用了重复点，无法证明映射不是单射。",
      detailZh: "反例证书要求至少两个两两不同的代数点位于同一纤维。",
      tone: "math",
    };
  }

  return {
    code: "invalid_certificate",
    label: "Counterexample failed deterministic verification",
    short: "The offline program could not confirm all required algebraic conditions.",
    detail:
      error ||
      "The base certificate or task objective failed; inspect the full evaluation object for details.",
    labelZh: "证书未通过验证",
    shortZh: "确定性程序未能确认该提交同时满足全部代数条件。",
    detailZh:
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
      url: `${siteBasePath}/data/records/${slug}.json`,
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
    name: "Conjecture Frontier · Jacobian Counterexample Construction",
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
