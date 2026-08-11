export type Language = "en" | "zh";

export interface Task {
  id: string;
  key: string;
  source?: "primary" | "optimization";
  title: string;
  titleZh: string;
  subtitle: string;
  subtitleZh: string;
  tier: string;
  tierZh: string;
  capability: string;
  capabilityZh: string;
  significance: string;
  significanceZh: string;
  question: string;
  questionZh: string;
  context: string;
  hint: string;
  outputFormat: string;
  constraints?: Record<string, unknown> | string[];
  objective?: Record<string, unknown>;
  verificationConditions: string[];
  verificationConditionsZh?: string[];
  optimization?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VerificationCondition {
  condition_id: number;
  condition: string;
  passed: boolean;
  reason: string;
}

export interface EvalResult {
  certificate_parsed: boolean;
  math_valid: boolean;
  objective_pass: boolean;
  official_pass: boolean;
  error: string | null;
  metrics: Record<string, unknown>;
  verification_conditions: VerificationCondition[];
  failed_conditions: string[];
  metric: number | null;
  symbolic_work: number;
  novelty_requirement?: string;
  novelty_status?: string;
  generic_fiber_requirement?: string;
  generic_fiber_status?: string;
}

export interface OutcomeAnalysis {
  code: string;
  label: string;
  labelZh: string;
  short: string;
  shortZh: string;
  detail: string;
  detailZh: string;
  tone: "pass" | "near" | "system" | "protocol" | "math";
}

export interface FrontierNewsItem {
  id: string;
  date: string;
  label: string;
  title: string;
  content: string;
  link: string;
  source: string;
  status: string;
  statusLabel: string;
  labelZh: string;
  titleZh: string;
  contentZh: string;
  statusLabelZh: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface Summary {
  records: number;
  officialPasses: number;
  mathValid: number;
  parsed: number;
  apiErrors: number;
  passRate: number;
  parseRate: number;
  mathValidRate: number;
  inferenceSeconds: number;
  verificationSeconds: number;
  usage: Usage;
}

export interface ModelSummary extends Summary {
  id: string;
  label: string;
  short: string;
}

export interface RecordSummary {
  key: string;
  id: string;
  taskKey: string;
  model: string;
  modelLabel: string;
  hint: boolean;
  hintMode: "hint" | "nohint";
  repeatIndex: number;
  parameters: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    reasoning_effort?: string | null;
  };
  eval: EvalResult;
  analysis: OutcomeAnalysis;
  timing: {
    inference_seconds: number;
    verification_seconds: number;
  };
  usage: Usage;
  contentChars: number;
  reasoningChars: number;
  outputChars: number;
  bundleKey: string;
  sourcePath: string;
}

export interface FullRecord {
  id: string;
  content?: string;
  output?: unknown;
  reasoning_content?: string;
  finish_reason?: string | null;
  normalized_evaluation: EvalResult;
  opbench_annotation: {
    outcome: OutcomeAnalysis;
    verification: {
      passed: boolean;
      conditions: VerificationCondition[];
      metric: number | null;
    };
  };
  source: { file: string; sha256: string };
  [key: string]: unknown;
}

export interface RecordBundle {
  schemaVersion: number;
  conjectureId: string;
  records: Record<string, FullRecord>;
}

export interface BenchmarkData {
  generatedAt: string;
  dataset: {
    id: string;
    name: string;
    context: string;
    tasks: Task[];
    taskCount: number;
    resultCount: number;
    modelCount: number;
    hintModes: Array<"nohint" | "hint">;
    hintPolicy: "paired" | "none";
    deterministic: boolean;
    recordBundleUrl: string;
  };
  aggregate: Summary;
  models: ModelSummary[];
  records: RecordSummary[];
}

export interface LocalizedOverview {
  eyebrow: string;
  eyebrowZh: string;
  summary: string;
  summaryZh: string;
  primaryAction: string;
  primaryActionZh: string;
}

export interface AtlasEvent {
  year: string;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
  links: Array<{ label: string; url: string }>;
}

export interface AtlasFrontier {
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
  formula: string;
  facts: Array<{
    label: string;
    labelZh: string;
    text: string;
    textZh: string;
  }>;
}

export interface ConjectureData {
  schemaVersion: number;
  id: string;
  slug: string;
  title: string;
  titleZh: string;
  proposed: string;
  proposedZh: string;
  status: string;
  statusZh: string;
  author: string;
  domain: string;
  problemSource: string;
  resultsPath: string;
  overview: LocalizedOverview;
  visualization: {
    kind: "jacobian" | "beal" | "odd-perfect" | "generic";
    codePath: string;
    label: string;
    labelZh: string;
    example: string;
    caption: string;
    captionZh: string;
  };
  statement: {
    intro: string;
    introZh: string;
    formula: string;
    explanation: string;
    explanationZh: string;
    note: string;
    noteZh: string;
  };
  atlas: {
    title: string;
    titleZh: string;
    body: string;
    bodyZh: string;
    events: AtlasEvent[];
    frontier?: AtlasFrontier;
  };
  benchmark: {
    name: string;
    title: string;
    titleZh: string;
    body: string;
    bodyZh: string;
    contextLabel: string;
    contextLabelZh: string;
    hintPolicy: "paired" | "none";
    hintNote: string;
    hintNoteZh: string;
    footer: string;
    footerZh: string;
  };
  evaluation: {
    title: string;
    titleZh: string;
    body: string;
    bodyZh: string;
  };
  symbolicLab: {
    title: string;
    titleZh: string;
    body: string;
    bodyZh: string;
    verifierPath: string;
    interactive: "jacobian" | "beal" | "odd-perfect";
    outputFormat: string;
  };
  benchmarkData: BenchmarkData;
}

export interface SiteData {
  schemaVersion: number;
  generatedAt: string;
  conjectures: ConjectureData[];
}

export interface CommunityMessage {
  id: string;
  nickname: string;
  title: string;
  body: string;
  conjecture?: string;
  task: string | "general";
  status: "approved";
  likes: number;
  createdAt: string;
}

export interface CommunitySnapshot {
  taskLikes: Record<string, number>;
  likedTasks?: string[];
  messages: CommunityMessage[];
  pendingCount: number;
  unavailable?: boolean;
}
