import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const MODEL_LABELS = {
  "claude-opus-4-8-thinking": "Claude-Opus-4.8-Thinking",
  "gemini-3.1-pro-preview-thinking": "Gemini-3.1-Pro-Preview-Thinking",
  "glm-5.2": "GLM-5.2",
  "gpt-5.5-xhigh": "GPT-5.5 (xhigh)",
  "kimi-k3": "Kimi-K3",
  "gpt-5.2": "GPT-5.2",
};

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function readJsonl(file) {
  const text = await readFile(file, "utf8");
  const values = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) throw new Error(`${file} has unbalanced JSON delimiters.`);
      if (depth === 0 && start >= 0) {
        values.push(JSON.parse(text.slice(start, index + 1)));
        start = -1;
      }
    } else if (depth === 0 && !/\s/.test(character)) {
      throw new Error(`${file} contains text outside a top-level JSON value.`);
    }
  }
  if (depth !== 0 || inString) throw new Error(`${file} ends inside a JSON value.`);
  return values;
}

export async function loadConjectureCatalog(root) {
  const directory = path.join(root, "conjectures");
  const index = await readJson(path.join(directory, "index.json"));
  const conjectures = [];
  for (const entry of index.conjectures) {
    if (!entry.enabled) continue;
    const config = await readJson(path.join(directory, entry.file));
    if (config.id !== entry.id) {
      throw new Error(`${entry.file} declares ${config.id}, expected ${entry.id}.`);
    }
    conjectures.push(config);
  }
  return { index, conjectures };
}

async function walkJsonFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJsonFiles(candidate)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(candidate);
  }
  return files.sort();
}

export async function discoverResults(root, config) {
  const directory = path.join(root, config.resultsPath);
  const acceptedIds = new Set(
    config.benchmark.tasks
      .filter((task) => task.source !== "optimization")
      .map((task) => task.id),
  );
  const found = [];
  for (const file of await walkJsonFiles(directory)) {
    const basename = path.basename(file);
    if (["run_config.json", "summary.json"].includes(basename)) continue;
    let record;
    try {
      record = await readJson(file);
    } catch (error) {
      throw new Error(`Cannot parse ${path.relative(root, file)}: ${error.message}`);
    }
    if (!acceptedIds.has(record.id)) continue;
    found.push({ file, record });
  }
  return found;
}

function taskProblem(config, editorial, problemsById) {
  if (editorial.source === "optimization") {
    const baseId = editorial.id.replace(/__optimization$/, "");
    return problemsById.get(baseId);
  }
  return problemsById.get(editorial.id);
}

export function buildTasks(config, allProblems) {
  const problemsById = new Map(allProblems.map((problem) => [problem.id, problem]));
  return config.benchmark.tasks.map((editorial) => {
    const problem = taskProblem(config, editorial, problemsById);
    if (!problem) throw new Error(`${config.id}: no problem source for ${editorial.id}.`);
    const optimization = editorial.source === "optimization";
    if (optimization && !String(problem.optimization?.problem ?? "").trim()) {
      throw new Error(`${config.id}: optimization task is configured but source is empty.`);
    }
    const question = optimization ? problem.optimization.problem : problem.question;
    const outputFormat = optimization
      ? problem.optimization.scoring || config.symbolicLab.outputFormat
      : problem.output_format || config.symbolicLab.outputFormat;
    const verificationConditions = optimization
      ? problem.objective?.verification_conditions?.slice(0, -1) ?? []
      : problem.objective?.verification_conditions ?? editorial.constraints ?? [];
    return {
      ...problem,
      ...editorial,
      question,
      questionZh: editorial.questionZh || question,
      hint: optimization ? "" : problem.hint || "",
      context: problem.context || problem.original_problem || "",
      outputFormat,
      verificationConditions,
      verificationConditionsZh: editorial.constraintsZh ?? verificationConditions,
      optimization: optimization ? problem.optimization : undefined,
    };
  });
}

export function recordModel(record) {
  return String(record.model ?? record.model_config?.model_name ?? "unknown-model");
}

export function recordParameters(record) {
  const source = record.parameters ?? record.model_config ?? {};
  return {
    temperature: Number(source.temperature ?? 0),
    top_p: Number(source.top_p ?? 0),
    max_tokens: Number(source.max_tokens ?? 0),
    reasoning_effort: source.reasoning_effort ?? null,
  };
}

export function normalizeUsage(usage = {}) {
  return {
    prompt_tokens: Number(usage.prompt_tokens ?? 0),
    completion_tokens: Number(usage.completion_tokens ?? 0),
    reasoning_tokens: Number(usage.reasoning_tokens ?? 0),
    total_tokens: Number(usage.total_tokens ?? 0),
  };
}

export function normalizeEvaluation(record) {
  if (record.eval) {
    const conditions = [
      {
        condition_id: 1,
        condition: "A structured certificate was parsed.",
        passed: Boolean(record.eval.certificate_parsed),
        reason: record.eval.certificate_parsed
          ? "The required certificate block was parsed."
          : String(record.eval.error ?? "No valid certificate block was parsed."),
      },
      {
        condition_id: 2,
        condition: "The base mathematical certificate is valid.",
        passed: Boolean(record.eval.math_valid),
        reason: record.eval.math_valid
          ? "The Jacobian and collision certificate passed exact checks."
          : String(record.eval.error ?? "The base certificate failed."),
      },
      {
        condition_id: 3,
        condition: "The task-specific objective is satisfied.",
        passed: Boolean(record.eval.objective_pass),
        reason: record.eval.objective_pass
          ? "All machine-checkable task constraints passed."
          : String(record.eval.error ?? "A task-specific constraint failed."),
      },
    ];
    return {
      certificate_parsed: Boolean(record.eval.certificate_parsed),
      math_valid: Boolean(record.eval.math_valid),
      objective_pass: Boolean(record.eval.objective_pass),
      official_pass: Boolean(record.eval.official_pass),
      error: record.eval.error ?? null,
      metrics: record.eval.metrics ?? {},
      verification_conditions: conditions,
      failed_conditions: conditions.filter((item) => !item.passed).map((item) => item.condition),
      metric: record.eval.metrics?.metric ?? null,
      symbolic_work: Number(record.eval.symbolic_work ?? 0),
      novelty_requirement: record.eval.novelty_requirement,
      novelty_status: record.eval.novelty_status,
      generic_fiber_requirement: record.eval.generic_fiber_requirement,
      generic_fiber_status: record.eval.generic_fiber_status,
    };
  }

  const evaluation = record.evaluation ?? {};
  const conditions = Array.isArray(evaluation.verification_conditions)
    ? evaluation.verification_conditions
    : [];
  const mathValid = conditions.length > 0 && conditions.every((item) => item.passed);
  return {
    certificate_parsed: Boolean(evaluation.output_parsing),
    math_valid: mathValid,
    objective_pass: Boolean(evaluation.passed),
    official_pass: Boolean(evaluation.passed),
    error:
      evaluation.error ??
      (evaluation.output_parsing === false ? "Output parsing failed." : null),
    metrics: evaluation.metric == null ? {} : { metric: evaluation.metric },
    verification_conditions: conditions,
    failed_conditions: evaluation.failed_conditions ?? [],
    metric: evaluation.metric ?? null,
    symbolic_work: 0,
  };
}

const OUTCOMES = {
  verified_solution: {
    label: "Verified construction",
    labelZh: "构造验证通过",
    short: "Every deterministic verification condition passed.",
    shortZh: "全部确定性验证条件均已通过。",
    tone: "pass",
  },
  verified_counterexample: {
    label: "Verified counterexample (research qualifiers reported separately)",
    labelZh: "反例验证通过（研究性限定另行报告）",
    short: "The finite algebraic certificate and machine-checkable task constraints passed.",
    shortZh: "有限代数证书及可机器核验的任务约束已通过。",
    tone: "pass",
  },
  constraint_miss: {
    label: "Valid base certificate, task constraint missed",
    labelZh: "基础证书有效，但未满足任务约束",
    short: "The construction is valid at the base layer but misses a task-specific target.",
    shortZh: "构造在基础层有效，但未达到本题专项目标。",
    tone: "near",
  },
  condition_failure: {
    label: "Deterministic condition failed",
    labelZh: "确定性条件失败",
    short: "The output parsed, but at least one exact verification condition failed.",
    shortZh: "输出已解析，但至少一个精确验证条件失败。",
    tone: "math",
  },
  api_failure: {
    label: "API or model response failure",
    labelZh: "API 或模型响应失败",
    short: "No evaluable response was produced because the request or upstream service failed.",
    shortZh: "请求或上游服务失败，未产生可评测响应。",
    tone: "system",
  },
  missing_certificate: {
    label: "No evaluable certificate submitted",
    labelZh: "未提交可评测证书",
    short: "The required structured certificate block is absent.",
    shortZh: "缺少协议要求的结构化证书区块。",
    tone: "protocol",
  },
  format_error: {
    label: "Output format failed",
    labelZh: "输出格式失败",
    short: "A candidate was present, but it did not match the declared machine-readable schema.",
    shortZh: "回答包含候选内容，但不符合声明的机器可读结构。",
    tone: "protocol",
  },
  jacobian_failure: {
    label: "Jacobian condition failed",
    labelZh: "雅可比条件失败",
    short: "The determinant is not a nonzero constant.",
    shortZh: "行列式不是非零常数。",
    tone: "math",
  },
  collision_failure: {
    label: "Collision certificate failed",
    labelZh: "碰撞证书失败",
    short: "The submitted points do not share a common image.",
    shortZh: "提交的点不具有共同像。",
    tone: "math",
  },
  duplicate_points: {
    label: "Collision points are not distinct",
    labelZh: "碰撞点不互异",
    short: "Repeated inputs cannot establish non-injectivity.",
    shortZh: "重复输入无法证明非单射。",
    tone: "math",
  },
  invalid_certificate: {
    label: "Certificate failed deterministic verification",
    labelZh: "证书未通过确定性验证",
    short: "The offline program could not confirm all required conditions.",
    shortZh: "离线程序无法确认全部必要条件。",
    tone: "math",
  },
};

export function classifyOutcome(record, evaluation = normalizeEvaluation(record)) {
  const error = String(evaluation.error ?? "");
  const content = String(record.content ?? "");
  const finishReason = record.finish_reason ?? null;
  let code;
  if (
    (!content.trim() && finishReason !== "stop") ||
    /timeout|504|internalserver|bad response|openai_error|apiresponseerror|empty content with finish_reason/i.test(error)
  ) {
    code = "api_failure";
  } else if (evaluation.official_pass) {
    code = record.eval ? "verified_counterexample" : "verified_solution";
  } else if (record.eval && evaluation.math_valid && !evaluation.objective_pass) {
    code = "constraint_miss";
  } else if (/missing FINAL_CERTIFICATE_JSON/i.test(error)) {
    code = "missing_certificate";
  } else if (
    evaluation.certificate_parsed === false ||
    /unsupported keys|certificate.*(?:schema|format)|invalid json|output parsing failed/i.test(error)
  ) {
    code = "format_error";
  } else if (/Jacobian determinant is not a nonzero constant/i.test(error)) {
    code = "jacobian_failure";
  } else if (/do not have a common image/i.test(error)) {
    code = "collision_failure";
  } else if (/pairwise distinct/i.test(error)) {
    code = "duplicate_points";
  } else if (!record.eval && evaluation.verification_conditions.length) {
    code = "condition_failure";
  } else {
    code = "invalid_certificate";
  }
  const template = OUTCOMES[code];
  return {
    code,
    ...template,
    detail: error || template.short,
    detailZh: error || template.shortZh,
  };
}

export function annotationFingerprint(record) {
  const clean = { ...record };
  delete clean.opbench_annotation;
  return createHash("sha256").update(JSON.stringify(clean)).digest("hex");
}

export function createAnnotation(config, record) {
  const evaluation = normalizeEvaluation(record);
  return {
    schema_version: 1,
    conjecture_id: config.id,
    task_id: record.id,
    model: recordModel(record),
    hint_mode: record.hint ? "hint" : "nohint",
    input_fingerprint: annotationFingerprint(record),
    outcome: classifyOutcome(record, evaluation),
    verification: {
      passed: evaluation.official_pass,
      conditions: evaluation.verification_conditions,
      metric: evaluation.metric,
    },
  };
}

export function modelLabel(model) {
  return MODEL_LABELS[model] ?? model;
}

export function sum(records, getter) {
  return records.reduce((total, record) => total + Number(getter(record) || 0), 0);
}

export function summarize(records) {
  const officialPasses = records.filter((record) => record.eval.official_pass).length;
  const mathValid = records.filter((record) => record.eval.math_valid).length;
  const parsed = records.filter((record) => record.eval.certificate_parsed).length;
  const apiErrors = records.filter((record) => record.analysis.code === "api_failure").length;
  const usage = {
    prompt_tokens: sum(records, (record) => record.usage.prompt_tokens),
    completion_tokens: sum(records, (record) => record.usage.completion_tokens),
    reasoning_tokens: sum(records, (record) => record.usage.reasoning_tokens),
    total_tokens: sum(records, (record) => record.usage.total_tokens),
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
    inferenceSeconds: sum(records, (record) => record.timing.inference_seconds),
    verificationSeconds: sum(records, (record) => record.timing.verification_seconds),
    usage,
  };
}
