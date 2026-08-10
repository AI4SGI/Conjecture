"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleX,
  Copy,
  FlaskConical,
  Plus,
  RotateCcw,
  Sigma,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Language } from "../lib/types";
import { MathText } from "./task-section";

type VerifierKind = "beal" | "odd-perfect";
type ExactCondition = {
  id: number;
  condition: string;
  passed: boolean;
  reason: string;
};
type ExactStat = { label: string; value: string; accent?: boolean };
type ExactResult = {
  passed: boolean;
  conditions: ExactCondition[];
  stats: ExactStat[];
  error?: string;
};

export function NumberTheoryVerifier({
  kind,
  language,
}: {
  kind: VerifierKind;
  language: Language;
}) {
  return kind === "beal" ? (
    <BealVerifier language={language} />
  ) : (
    <OddPerfectVerifier language={language} />
  );
}

type BealInput = Record<"A" | "B" | "C" | "x" | "y" | "z", string>;

const BEAL_EXAMPLE: BealInput = {
  A: "1",
  B: "8",
  C: "3",
  x: "3",
  y: "3",
  z: "4",
};

function BealVerifier({ language }: { language: Language }) {
  const english = language === "en";
  const [candidate, setCandidate] = useState<BealInput>(BEAL_EXAMPLE);
  const [result, setResult] = useState<ExactResult | null>(() =>
    verifyBeal(BEAL_EXAMPLE, english),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(verifyBeal(candidate, english));
    // Re-localize the current deterministic result when language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [english]);

  function update(name: keyof BealInput, value: string) {
    setCandidate((current) => ({ ...current, [name]: value }));
    setResult(null);
  }

  function reset() {
    setCandidate(BEAL_EXAMPLE);
    setResult(verifyBeal(BEAL_EXAMPLE, english));
  }

  async function copyCandidate() {
    const lines = (Object.keys(BEAL_EXAMPLE) as Array<keyof BealInput>).map(
      (key) => `  "${key}": ${integerJsonLiteral(candidate[key])}`,
    );
    await copyText(`{\n${lines.join(",\n")}\n}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="verifier-shell exact-verifier" data-verifier="beal">
      <VerifierToolbar
        title={english ? "Exact six-integer verifier" : "六整数精确验证器"}
        copied={copied}
        onReset={reset}
        onCopy={() => void copyCandidate()}
        language={language}
      />
      <div className="verifier-columns exact-verifier-columns">
        <div className="polynomial-inputs candidate-inputs">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <b>{english ? "Candidate integers" : "候选整数"}</b>
              <small>
                {english
                  ? "Enter A, B, C and exponents x, y, z as decimal integers"
                  : "以十进制整数输入 A、B、C 及指数 x、y、z"}
              </small>
            </div>
          </div>
          <div className="integer-field-grid">
            {(Object.keys(BEAL_EXAMPLE) as Array<keyof BealInput>).map(
              (name) => (
                <label className="integer-field" key={name}>
                  <span>{name}</span>
                  <input
                    aria-label={name}
                    inputMode="numeric"
                    spellCheck={false}
                    value={candidate[name]}
                    onChange={(event) => update(name, event.target.value)}
                  />
                  <small>
                    {["x", "y", "z"].includes(name)
                      ? english
                        ? "integer > 2"
                        : "整数 > 2"
                      : english
                        ? "positive integer"
                        : "正整数"}
                  </small>
                </label>
              ),
            )}
          </div>
          <div className="candidate-formula">
            <span>A<sup>x</sup> + B<sup>y</sup></span>
            <b>=</b>
            <span>C<sup>z</sup></span>
          </div>
          <button
            className="verify-button"
            onClick={() => setResult(verifyBeal(candidate, english))}
          >
            <Sigma size={19} />
            {english
              ? "Verify all Beal constraints"
              : "验证全部 Beal 约束"}
          </button>
        </div>
        <ExactVerificationOutput
          result={result}
          language={language}
          emptyText={
            english
              ? "Edit the six integers, then run the exact verifier."
              : "修改六个整数后运行精确验证。"
          }
        />
      </div>
    </div>
  );
}

function verifyBeal(candidate: BealInput, english: boolean): ExactResult {
  const keys = Object.keys(BEAL_EXAMPLE) as Array<keyof BealInput>;
  const values = Object.fromEntries(
    keys.map((key) => [key, parseInteger(candidate[key])]),
  ) as Record<keyof BealInput, bigint | null>;
  const integers = keys.every((key) => values[key] !== null);
  const A = values.A;
  const B = values.B;
  const C = values.C;
  const x = values.x;
  const y = values.y;
  const z = values.z;
  const positiveBases =
    A !== null && B !== null && C !== null && A > 0n && B > 0n && C > 0n;
  const exponentBound =
    x !== null && y !== null && z !== null && x > 2n && y > 2n && z > 2n;
  const commonGcd = positiveBases ? gcd(gcd(A, B), C) : null;
  const coprime = commonGcd === 1n;
  let left: bigint | null = null;
  let right: bigint | null = null;
  let residual: bigint | null = null;
  let equality = false;
  let computationError: string | undefined;

  if (positiveBases && exponentBound) {
    try {
      assertInteractivePowerBudget(A, x);
      assertInteractivePowerBudget(B, y);
      assertInteractivePowerBudget(C, z);
      left = A ** x + B ** y;
      right = C ** z;
      residual = left >= right ? left - right : right - left;
      equality = left === right;
    } catch {
      computationError = english
        ? "The powers exceed the browser safety budget. Use the linked Python verifier for this unusually large candidate."
        : "幂运算超过浏览器安全预算；请使用所链接的 Python 验证器核验该超大候选。";
    }
  }

  const conditions: ExactCondition[] = [
    {
      id: 1,
      condition: "All declared values are integers.",
      passed: integers,
      reason: integers
        ? english
          ? "All six fields parsed as exact decimal integers."
          : "六个字段均已解析为精确十进制整数。"
        : english
          ? "Every field must contain one decimal integer; floats and empty values are rejected."
          : "每个字段必须是一个十进制整数；不接受小数或空值。",
    },
    {
      id: 2,
      condition: "$A,B,C\\in\\mathbb Z_{>0}$.",
      passed: positiveBases,
      reason:
        A === null || B === null || C === null
          ? english
            ? "The bases have not all parsed as integers."
            : "底数尚未全部解析为整数。"
          : `A=${A}, B=${B}, C=${C}.`,
    },
    {
      id: 3,
      condition: "$x,y,z>2$.",
      passed: exponentBound,
      reason:
        x === null || y === null || z === null
          ? english
            ? "The exponents have not all parsed as integers."
            : "指数尚未全部解析为整数。"
          : `x=${x}, y=${y}, z=${z}.`,
    },
    {
      id: 4,
      condition: "$\\gcd(A,B,C)=1$.",
      passed: coprime,
      reason:
        commonGcd === null
          ? english
            ? "The gcd is checked after the positive-base condition passes."
            : "正整数底数条件通过后才检查最大公因数。"
          : english
            ? `The exact common gcd is ${commonGcd}.`
            : `精确公共最大公因数为 ${commonGcd}。`,
    },
    {
      id: 5,
      condition: "$A^x+B^y=C^z$.",
      passed: equality,
      reason:
        left !== null && right !== null && residual !== null
          ? english
            ? `Exact arithmetic gives left=${left}, right=${right}, residual=${residual}.`
            : `精确整数运算得到左侧=${left}、右侧=${right}、残差=${residual}。`
          : computationError ??
            (english
              ? "The exact powers are evaluated after the domain constraints pass."
              : "定义域约束通过后才计算精确幂。"),
    },
  ];
  return {
    passed: conditions.every((condition) => condition.passed),
    conditions,
    error: computationError,
    stats:
      left !== null && right !== null && residual !== null
        ? [
            { label: "LEFT", value: left.toString() },
            { label: "RIGHT", value: right.toString() },
            {
              label: english ? "ABSOLUTE RESIDUAL" : "绝对残差",
              value: residual.toString(),
              accent: residual === 0n,
            },
          ]
        : [],
  };
}

type FactorInput = {
  id: string;
  p: string;
  e: string;
  certificate: string;
};
type OddInput = { N: string; factors: FactorInput[] };

const ODD_EXAMPLE: OddInput = {
  N: "198585576189",
  factors: [
    ["3", "2"],
    ["7", "2"],
    ["11", "2"],
    ["13", "2"],
    ["19", "2"],
    ["61", "1"],
  ].map(([p, e]) => ({ id: `factor-${p}`, p, e, certificate: "" })),
};

function cloneOddExample(): OddInput {
  return {
    N: ODD_EXAMPLE.N,
    factors: ODD_EXAMPLE.factors.map((factor) => ({ ...factor })),
  };
}

function OddPerfectVerifier({ language }: { language: Language }) {
  const english = language === "en";
  const [candidate, setCandidate] = useState<OddInput>(cloneOddExample);
  const [result, setResult] = useState<ExactResult | null>(() =>
    verifyOddPerfect(cloneOddExample(), english),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(verifyOddPerfect(candidate, english));
    // Re-localize the current deterministic result when language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [english]);

  function updateN(value: string) {
    setCandidate((current) => ({ ...current, N: value }));
    setResult(null);
  }

  function updateFactor(id: string, field: "p" | "e" | "certificate", value: string) {
    setCandidate((current) => ({
      ...current,
      factors: current.factors.map((factor) =>
        factor.id === id ? { ...factor, [field]: value } : factor,
      ),
    }));
    setResult(null);
  }

  function addFactor() {
    setCandidate((current) => ({
      ...current,
      factors: [
        ...current.factors,
        { id: crypto.randomUUID(), p: "", e: "1", certificate: "" },
      ],
    }));
    setResult(null);
  }

  function removeFactor(id: string) {
    setCandidate((current) => ({
      ...current,
      factors: current.factors.filter((factor) => factor.id !== id),
    }));
    setResult(null);
  }

  function reset() {
    const value = cloneOddExample();
    setCandidate(value);
    setResult(verifyOddPerfect(value, english));
  }

  async function copyCandidate() {
    const factors = candidate.factors.map((factor) => {
      const certificate = factor.certificate.trim();
      const certificateLiteral = !certificate
        ? "null"
        : parseCertificate(certificate).error
          ? JSON.stringify(certificate)
          : certificate;
      return `    {"p": ${integerJsonLiteral(factor.p)}, "e": ${integerJsonLiteral(factor.e)}, "certificate": ${certificateLiteral}}`;
    });
    await copyText(
      `{\n  "N": ${integerJsonLiteral(candidate.N)},\n  "factors": [\n${factors.join(",\n")}\n  ]\n}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="verifier-shell exact-verifier" data-verifier="odd-perfect">
      <VerifierToolbar
        title={english ? "Prime-power certificate verifier" : "素数幂证书验证器"}
        copied={copied}
        onReset={reset}
        onCopy={() => void copyCandidate()}
        language={language}
      />
      <div className="verifier-columns exact-verifier-columns">
        <div className="polynomial-inputs candidate-inputs">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <b>{english ? "Candidate and factorization" : "候选数与完整分解"}</b>
              <small>
                {english
                  ? "Enter N and every prime power. Certificates are optional below 2⁶⁴."
                  : "输入 N 及全部素数幂；小于 2⁶⁴ 的素数无需证书。"}
              </small>
            </div>
          </div>
          <label className="integer-field odd-n-field">
            <span>N</span>
            <input
              aria-label="N"
              inputMode="numeric"
              spellCheck={false}
              value={candidate.N}
              onChange={(event) => updateN(event.target.value)}
            />
            <small>{english ? "positive odd integer" : "正奇数"}</small>
          </label>

          <div className="factor-editor-head">
            <div>
              <b>{english ? "Prime-power factors" : "素数幂因子"}</b>
              <small>
                {english
                  ? "Optional certificate field accepts recursive Pocklington JSON"
                  : "可选证书字段接受递归 Pocklington JSON"}
              </small>
            </div>
            <button onClick={addFactor}>
              <Plus size={15} /> {english ? "Add factor" : "添加因子"}
            </button>
          </div>
          <div className="factor-editor">
            {candidate.factors.map((factor, index) => (
              <div className="factor-editor-row" key={factor.id}>
                <b>p<sub>{index + 1}</sub></b>
                <label>
                  <span>p</span>
                  <input
                    aria-label={`Prime ${index + 1}`}
                    inputMode="numeric"
                    value={factor.p}
                    onChange={(event) =>
                      updateFactor(factor.id, "p", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>e</span>
                  <input
                    aria-label={`Exponent ${index + 1}`}
                    inputMode="numeric"
                    value={factor.e}
                    onChange={(event) =>
                      updateFactor(factor.id, "e", event.target.value)
                    }
                  />
                </label>
                <label className="certificate-field">
                  <span>{english ? "certificate JSON" : "证书 JSON"}</span>
                  <textarea
                    aria-label={`Certificate ${index + 1}`}
                    rows={1}
                    spellCheck={false}
                    placeholder="null"
                    value={factor.certificate}
                    onChange={(event) =>
                      updateFactor(factor.id, "certificate", event.target.value)
                    }
                  />
                </label>
                <button
                  aria-label={english ? `Delete factor ${index + 1}` : `删除因子 ${index + 1}`}
                  disabled={candidate.factors.length <= 1}
                  onClick={() => removeFactor(factor.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="verify-button"
            onClick={() => setResult(verifyOddPerfect(candidate, english))}
          >
            <Sigma size={19} />
            {english
              ? "Verify factorization and divisor sum"
              : "验证分解与除数和"}
          </button>
        </div>
        <ExactVerificationOutput
          result={result}
          language={language}
          emptyText={
            english
              ? "Edit N or its prime-power list, then run the exact verifier."
              : "修改 N 或素数幂列表后运行精确验证。"
          }
        />
      </div>
    </div>
  );
}

function verifyOddPerfect(candidate: OddInput, english: boolean): ExactResult {
  const N = parseInteger(candidate.N);
  const validN = N !== null && N > 0n && N % 2n === 1n;
  let factorizationValid = candidate.factors.length > 0;
  let product = 1n;
  const parsedFactors: Array<{ p: bigint; e: bigint }> = [];
  const seen = new Set<string>();
  const factorReasons: string[] = [];

  for (const [index, factor] of candidate.factors.entries()) {
    const p = parseInteger(factor.p);
    const e = parseInteger(factor.e);
    if (p === null || e === null || e < 1n) {
      factorizationValid = false;
      factorReasons.push(
        english
          ? `factor ${index + 1} has invalid p or e`
          : `第 ${index + 1} 个因子的 p 或 e 无效`,
      );
      continue;
    }
    const certificate = parseCertificate(factor.certificate);
    if (certificate.error) {
      factorizationValid = false;
      factorReasons.push(
        english
          ? `p=${p}: invalid certificate JSON`
          : `p=${p}：证书 JSON 无效`,
      );
      continue;
    }
    const primeResult = certifiedPrime(p, certificate.value);
    if (!primeResult.passed || seen.has(p.toString())) {
      factorizationValid = false;
      factorReasons.push(
        seen.has(p.toString())
          ? english
            ? `p=${p} is repeated`
            : `p=${p} 重复`
          : `p=${p}: ${primeResult.reason}`,
      );
      continue;
    }
    try {
      assertInteractivePowerBudget(p, e);
    } catch {
      factorizationValid = false;
      factorReasons.push(
        english
          ? `p=${p}: the prime power exceeds the browser safety budget`
          : `p=${p}：素数幂超过浏览器安全预算`,
      );
      continue;
    }
    seen.add(p.toString());
    parsedFactors.push({ p, e });
    product *= p ** e;
  }
  if (!validN || product !== N) {
    factorizationValid = false;
    factorReasons.push(
      english
        ? `The prime-power product is ${product}; expected ${N ?? "a valid N"}.`
        : `素数幂乘积为 ${product}；应等于 ${N ?? "有效的 N"}。`,
    );
  }

  let sigma = 1n;
  if (factorizationValid) {
    for (const factor of parsedFactors) {
      sigma *=
        (factor.p ** (factor.e + 1n) - 1n) / (factor.p - 1n);
    }
  }
  const twiceN = N !== null ? 2n * N : null;
  const perfect =
    factorizationValid && twiceN !== null && sigma === twiceN;
  const conditions: ExactCondition[] = [
    {
      id: 1,
      condition: "$N\\in\\mathbb Z_{>0}$ and $N\\equiv1\\pmod2$.",
      passed: validN,
      reason:
        N === null
          ? english
            ? "N must be one decimal integer."
            : "N 必须是一个十进制整数。"
          : `N=${N}.`,
    },
    {
      id: 2,
      condition:
        "The prime-power list is a complete certified factorization of $N$.",
      passed: factorizationValid,
      reason:
        factorReasons.join("; ") ||
        (english
          ? "Every prime is deterministically certified and the product equals N."
          : "每个素数均通过确定性认证，且素数幂乘积等于 N。"),
    },
    {
      id: 3,
      condition: "$\\sigma(N)=2N$.",
      passed: perfect,
      reason:
        factorizationValid && twiceN !== null
          ? english
            ? `Exact arithmetic gives sigma(N)=${sigma} and 2N=${twiceN}.`
            : `精确整数运算得到 σ(N)=${sigma}，2N=${twiceN}。`
          : english
            ? "The divisor sum is evaluated after the certified factorization passes."
            : "完整认证分解通过后才计算除数和。",
    },
  ];
  return {
    passed: conditions.every((condition) => condition.passed),
    conditions,
    stats: [
      {
        label: english ? "FACTOR PRODUCT" : "因子乘积",
        value: product.toString(),
        accent: validN && product === N,
      },
      { label: "σ(N)", value: factorizationValid ? sigma.toString() : "—" },
      { label: "2N", value: twiceN?.toString() ?? "—", accent: perfect },
    ],
  };
}

function VerifierToolbar({
  title,
  copied,
  onReset,
  onCopy,
  language,
}: {
  title: string;
  copied: boolean;
  onReset: () => void;
  onCopy: () => void;
  language: Language;
}) {
  const english = language === "en";
  return (
    <div className="verifier-toolbar">
      <div>
        <FlaskConical size={18} />
        <span>{title}</span>
      </div>
      <div>
        <button onClick={onReset}>
          <RotateCcw size={16} />
          {english ? "Load example" : "载入示例"}
        </button>
        <button onClick={onCopy}>
          <Copy size={16} />
          {copied
            ? english
              ? "Copied"
              : "已复制"
            : english
              ? "Copy candidate"
              : "复制候选"}
        </button>
      </div>
    </div>
  );
}

function ExactVerificationOutput({
  result,
  language,
  emptyText,
}: {
  result: ExactResult | null;
  language: Language;
  emptyText: string;
}) {
  const english = language === "en";
  return (
    <div className="verification-output exact-verification-output">
      <div className="panel-heading">
        <span>02</span>
        <div>
          <b>{english ? "Deterministic result" : "确定性结果"}</b>
          <small>
            {english
              ? "Exact local arithmetic · constraint-by-constraint verdict"
              : "本地精确运算 · 逐项约束判定"}
          </small>
        </div>
      </div>
      {result ? (
        <>
          {result.error ? (
            <div className="verifier-error">
              <AlertCircle size={17} /> {result.error}
            </div>
          ) : null}
          <div className={result.passed ? "verdict pass" : "verdict fail"}>
            {result.passed ? <CheckCircle2 /> : <AlertCircle />}
            <div>
              <b>
                {result.passed
                  ? english
                    ? "All declared constraints pass"
                    : "全部声明约束均通过"
                  : english
                    ? "One or more constraints fail"
                    : "至少一项约束未通过"}
              </b>
              <span>
                {english
                  ? "This is a deterministic constraint verdict, not an assessment of novelty or research significance."
                  : "这是确定性约束判定，不评价创新性或研究意义。"}
              </span>
            </div>
          </div>
          {result.stats.length ? (
            <div className="exact-stat-grid">
              {result.stats.map((stat) => (
                <div className={stat.accent ? "accent" : ""} key={stat.label}>
                  <span>{stat.label}</span>
                  <b>{stat.value}</b>
                </div>
              ))}
            </div>
          ) : null}
          <div className="interactive-condition-list">
            {result.conditions.map((condition) => (
              <div
                className={condition.passed ? "pass" : "fail"}
                key={condition.id}
              >
                {condition.passed ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <CircleX size={18} />
                )}
                <span>
                  <b>
                    {condition.passed ? "PASS" : "FAIL"} · {condition.id}
                  </b>
                  <MathText>{condition.condition}</MathText>
                  <small>{condition.reason}</small>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="verifier-empty">
          <Sigma />
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function parseInteger(value: string): bigint | null {
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

function integerJsonLiteral(value: string) {
  return parseInteger(value)?.toString() ?? JSON.stringify(value);
}

function gcd(left: bigint, right: bigint) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a;
}

function assertInteractivePowerBudget(base: bigint, exponent: bigint) {
  const digits = BigInt((base < 0n ? -base : base).toString().length);
  if (exponent > 100_000n || digits * exponent > 200_000n) {
    throw new RangeError("interactive power budget exceeded");
  }
}

const MILLER_RABIN_BASES = [
  2n,
  325n,
  9375n,
  28178n,
  450775n,
  9780504n,
  1795265022n,
];
const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

function modularPower(base: bigint, exponent: bigint, modulus: bigint) {
  let result = 1n;
  let factor = base % modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }
  return result;
}

function deterministicPrime64(value: bigint) {
  if (value < 2n) return false;
  for (const prime of SMALL_PRIMES) {
    if (value % prime === 0n) return value === prime;
  }
  let d = value - 1n;
  let s = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    s += 1;
  }
  for (const base of MILLER_RABIN_BASES) {
    if (base % value === 0n) continue;
    let witness = modularPower(base, d, value);
    if (witness === 1n || witness === value - 1n) continue;
    let probablyPrime = false;
    for (let round = 1; round < s; round += 1) {
      witness = (witness * witness) % value;
      if (witness === value - 1n) {
        probablyPrime = true;
        break;
      }
    }
    if (!probablyPrime) return false;
  }
  return true;
}

const CERTIFICATE_INTEGER_PREFIX = "__OPBENCH_INTEGER__:";

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (
    typeof value === "string" &&
    value.startsWith(CERTIFICATE_INTEGER_PREFIX)
  ) {
    return BigInt(value.slice(CERTIFICATE_INTEGER_PREFIX.length));
  }
  return null;
}

function certifiedPrime(
  value: bigint,
  certificate: unknown,
  depth = 0,
): { passed: boolean; reason: string } {
  if (value < 2n ** 64n) {
    const passed = deterministicPrime64(value);
    return {
      passed,
      reason: passed
        ? "Deterministic Miller–Rabin passes for the 64-bit range."
        : "Deterministic Miller–Rabin rejects this value.",
    };
  }
  if (depth > 12 || !certificate || typeof certificate !== "object") {
    return {
      passed: false,
      reason:
        "A recursive Pocklington certificate is required for primes outside the 64-bit range.",
    };
  }
  const factors = (certificate as Record<string, unknown>).factors;
  if (!Array.isArray(factors) || !factors.length) {
    return { passed: false, reason: "The Pocklington factors list is empty." };
  }
  let certifiedProduct = 1n;
  for (const factorValue of factors) {
    if (!factorValue || typeof factorValue !== "object") {
      return { passed: false, reason: "A Pocklington factor is not an object." };
    }
    const factor = factorValue as Record<string, unknown>;
    const q = toBigInt(factor.q);
    const e = toBigInt(factor.e);
    const a = toBigInt(factor.a);
    if (q === null || e === null || a === null || e < 1n) {
      return { passed: false, reason: "Pocklington q, e, and a are invalid." };
    }
    const qResult = certifiedPrime(q, factor.certificate, depth + 1);
    if (!qResult.passed) {
      return { passed: false, reason: `q=${q} is not certified prime.` };
    }
    try {
      assertInteractivePowerBudget(q, e);
    } catch {
      return {
        passed: false,
        reason: `${q}^${e} exceeds the browser safety budget.`,
      };
    }
    const primePower = q ** e;
    if ((value - 1n) % primePower !== 0n) {
      return { passed: false, reason: `${q}^${e} does not divide p-1.` };
    }
    if (modularPower(a, value - 1n, value) !== 1n) {
      return { passed: false, reason: `Witness ${a} fails Fermat's congruence.` };
    }
    if (gcd(modularPower(a, (value - 1n) / q, value) - 1n, value) !== 1n) {
      return { passed: false, reason: `Witness ${a} fails the gcd condition.` };
    }
    certifiedProduct *= primePower;
  }
  return certifiedProduct * certifiedProduct > value
    ? { passed: true, reason: "The recursive Pocklington certificate passes." }
    : {
        passed: false,
        reason: "The certified part of p-1 does not exceed sqrt(p).",
      };
}

function parseCertificate(text: string): { value: unknown; error?: string } {
  if (!text.trim()) return { value: null };
  try {
    return { value: JSON.parse(markCertificateIntegers(text)) as unknown };
  } catch {
    return { value: null, error: "invalid JSON" };
  }
}

function markCertificateIntegers(text: string) {
  let output = "";
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < text.length) {
    const character = text[index];
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      index += 1;
      continue;
    }
    const integer = text.slice(index).match(/^-?\d+(?![.eE\d])/);
    if (integer) {
      output += JSON.stringify(`${CERTIFICATE_INTEGER_PREFIX}${integer[0]}`);
      index += integer[0].length;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
