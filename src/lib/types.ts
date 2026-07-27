export interface Task {
  id: string;
  key: "P1" | "P2" | "P3" | "P4" | "P5";
  title: string;
  subtitle: string;
  tier: string;
  tierLabel: string;
  capability: string;
  significance: string;
  titleZh: string;
  subtitleZh: string;
  tierLabelZh: string;
  capabilityZh: string;
  significanceZh: string;
  questionZh: string;
  context: string;
  question: string;
  hint: string;
  constraints: {
    dimension: number;
    min_points: number;
    coefficient_domain: string;
  };
  objective: {
    kind: string;
    value?: number;
  };
}

export interface EvalResult {
  certificate_parsed: boolean;
  math_valid: boolean;
  objective_pass: boolean;
  official_pass: boolean;
  novelty_requirement: string;
  novelty_status: string;
  error: string | null;
  metrics: Record<string, unknown>;
  symbolic_work: number;
}

export type OutcomeCode =
  | "verified_counterexample"
  | "constraint_miss"
  | "api_failure"
  | "missing_certificate"
  | "format_error"
  | "jacobian_failure"
  | "collision_failure"
  | "duplicate_points"
  | "invalid_certificate";

export interface OutcomeAnalysis {
  code: OutcomeCode;
  label: string;
  short: string;
  detail: string;
  tone: "pass" | "near" | "system" | "protocol" | "math";
  labelZh?: string;
  shortZh?: string;
  detailZh?: string;
}

export type Language = "en" | "zh";

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
  taskKey: Task["key"];
  model: string;
  modelLabel: string;
  hint: boolean;
  repeatIndex: number;
  parameters: {
    temperature: number;
    top_p: number;
    max_tokens: number;
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
  url: string;
}

export interface FullRecord extends Omit<RecordSummary, "key" | "url" | "taskKey"> {
  content: string;
  output: string;
  reasoning_content: string;
  source: { file: string; sha256: string };
}

export interface BenchmarkData {
  generatedAt: string;
  dataset: {
    name: string;
    context: string;
    tasks: Task[];
    taskCount: number;
    resultCount: number;
    modelCount: number;
    hintModes: string[];
    deterministic: boolean;
  };
  aggregate: Summary;
  models: ModelSummary[];
  records: RecordSummary[];
}

export interface CommunityMessage {
  id: string;
  nickname: string;
  title: string;
  body: string;
  conjecture?: "jacobian" | "new";
  task: Task["key"] | "general";
  status: "approved";
  likes: number;
  createdAt: string;
}

export interface CommunitySnapshot {
  taskLikes: Record<Task["key"], number>;
  likedTasks?: Task["key"][];
  messages: CommunityMessage[];
  pendingCount: number;
  unavailable?: boolean;
}
