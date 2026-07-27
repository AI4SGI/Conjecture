"use client";

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FlaskConical,
  Plus,
  RotateCcw,
  Sigma,
  Trash2,
} from "lucide-react";
import {
  add,
  abs,
  complex,
  divide,
  evaluate,
  fraction,
  format,
  multiply,
  parse,
  subtract,
  type MathNode,
} from "mathjs";
import { useEffect, useMemo, useState } from "react";
import type { Language } from "../lib/types";
import { InlineMath } from "./math";

type PointInput = { id: string; x: string; y: string; z: string };
type Verification = {
  matrix: string[][];
  determinant: string;
  determinantConstant: boolean;
  determinantNonzero: boolean;
  images: string[][];
  collision: boolean;
  error?: string;
};

const KNOWN_MAP = [
  "z*(1+x*y)^3 + y^2*(1+x*y)*(4+3*x*y)",
  "y + 3*x*z*(1+x*y)^2 + 3*x*y^2*(4+3*x*y)",
  "2*x - 3*x^2*y - x^3*z",
];

const KNOWN_POINTS: PointInput[] = [
  { id: "a", x: "0", y: "0", z: "-1/4" },
  { id: "b", x: "1", y: "-3/2", z: "13/2" },
  { id: "c", x: "-1", y: "3/2", z: "13/2" },
];

type Coefficient = unknown;
type Polynomial = Map<string, Coefficient>;

const ZERO_KEY = "0,0,0";
const VARIABLES = ["x", "y", "z"] as const;

function exponentKey(exponents: number[]) {
  return exponents.join(",");
}

function exponentsOf(key: string) {
  return key.split(",").map(Number);
}

function coefficientIsZero(value: Coefficient) {
  try {
    return Number(abs(value as never)) < 1e-12;
  } catch {
    return false;
  }
}

function cleanPolynomial(polynomial: Polynomial) {
  for (const [key, value] of polynomial) {
    if (coefficientIsZero(value)) polynomial.delete(key);
  }
  return polynomial;
}

function constantPolynomial(value: Coefficient): Polynomial {
  return coefficientIsZero(value)
    ? new Map()
    : new Map([[ZERO_KEY, value]]);
}

function addPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const result = new Map(left);
  for (const [key, value] of right) {
    result.set(
      key,
      result.has(key)
        ? add(result.get(key) as never, value as never)
        : value,
    );
  }
  return cleanPolynomial(result);
}

function scalePolynomial(polynomial: Polynomial, scalar: Coefficient): Polynomial {
  return cleanPolynomial(
    new Map(
      [...polynomial].map(([key, value]) => [
        key,
        multiply(value as never, scalar as never),
      ]),
    ),
  );
}

function multiplyPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const result: Polynomial = new Map();
  for (const [leftKey, leftValue] of left) {
    const leftExponents = exponentsOf(leftKey);
    for (const [rightKey, rightValue] of right) {
      const rightExponents = exponentsOf(rightKey);
      const key = exponentKey(
        leftExponents.map((value, index) => value + rightExponents[index]),
      );
      const product = multiply(leftValue as never, rightValue as never);
      result.set(
        key,
        result.has(key)
          ? add(result.get(key) as never, product as never)
          : product,
      );
    }
  }
  return cleanPolynomial(result);
}

function powerPolynomial(base: Polynomial, exponent: number): Polynomial {
  let result = constantPolynomial(fraction(1));
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiplyPolynomials(result, factor);
    remaining = Math.floor(remaining / 2);
    if (remaining) factor = multiplyPolynomials(factor, factor);
  }
  return result;
}

function polynomialDegree(polynomial: Polynomial) {
  if (!polynomial.size) return 0;
  return Math.max(
    ...[...polynomial.keys()].map((key) =>
      exponentsOf(key).reduce((sum, value) => sum + value, 0),
    ),
  );
}

function derivativePolynomial(polynomial: Polynomial, variableIndex: number) {
  const result: Polynomial = new Map();
  for (const [key, coefficient] of polynomial) {
    const exponents = exponentsOf(key);
    if (!exponents[variableIndex]) continue;
    const multiplier = exponents[variableIndex];
    exponents[variableIndex] -= 1;
    result.set(
      exponentKey(exponents),
      multiply(coefficient as never, multiplier as never),
    );
  }
  return cleanPolynomial(result);
}

function polynomialToString(polynomial: Polynomial) {
  if (!polynomial.size) return "0";
  const terms = [...polynomial].sort(([left], [right]) => {
    const leftExponents = exponentsOf(left);
    const rightExponents = exponentsOf(right);
    const degreeDifference =
      rightExponents.reduce((sum, value) => sum + value, 0) -
      leftExponents.reduce((sum, value) => sum + value, 0);
    if (degreeDifference) return degreeDifference;
    return right.localeCompare(left);
  });
  return terms
    .map(([key, coefficient], index) => {
      const exponents = exponentsOf(key);
      const coefficientText = displayValue(coefficient);
      const monomial = exponents
        .map((exponent, variableIndex) =>
          exponent === 0
            ? ""
            : exponent === 1
              ? VARIABLES[variableIndex]
              : `${VARIABLES[variableIndex]}^${exponent}`,
        )
        .filter(Boolean)
        .join("*");
      let term =
        monomial && coefficientText === "1"
          ? monomial
          : monomial && coefficientText === "-1"
            ? `-${monomial}`
            : monomial
              ? `${coefficientText}*${monomial}`
              : coefficientText;
      if (index > 0 && !term.startsWith("-")) term = `+ ${term}`;
      else if (index > 0) term = `- ${term.slice(1)}`;
      return term;
    })
    .join(" ");
}

function nodeToPolynomial(node: MathNode): Polynomial {
  const candidate = node as MathNode & {
    type: string;
    name?: string;
    op?: string;
    fn?: string;
    args?: MathNode[];
    content?: MathNode;
    value?: string | number;
  };
  if (candidate.type === "ParenthesisNode" && candidate.content) {
    return nodeToPolynomial(candidate.content);
  }
  if (candidate.type === "ConstantNode") {
    return constantPolynomial(fraction(String(candidate.value)));
  }
  if (candidate.type === "SymbolNode") {
    const variableIndex = VARIABLES.indexOf(
      candidate.name as (typeof VARIABLES)[number],
    );
    if (variableIndex >= 0) {
      const exponents = [0, 0, 0];
      exponents[variableIndex] = 1;
      return new Map([[exponentKey(exponents), fraction(1)]]);
    }
    if (candidate.name === "i") return constantPolynomial(complex(0, 1));
    throw new Error(`不支持的符号：${candidate.name}`);
  }
  if (candidate.type !== "OperatorNode" || !candidate.args) {
    throw new Error("仅支持由数字、x/y/z/i 与 + − × ÷ ^ 构成的多项式。");
  }
  const args = candidate.args;
  if (candidate.op === "+") {
    return args.map(nodeToPolynomial).reduce(addPolynomials);
  }
  if (candidate.op === "-") {
    if (args.length === 1) {
      return scalePolynomial(nodeToPolynomial(args[0]), fraction(-1));
    }
    return addPolynomials(
      nodeToPolynomial(args[0]),
      scalePolynomial(nodeToPolynomial(args[1]), fraction(-1)),
    );
  }
  if (candidate.op === "*") {
    return args.map(nodeToPolynomial).reduce(multiplyPolynomials);
  }
  if (candidate.op === "/") {
    const denominator = nodeToPolynomial(args[1]);
    if (args.length !== 2 || denominator.size !== 1 || !denominator.has(ZERO_KEY)) {
      throw new Error("多项式不能以含变量的表达式作分母。");
    }
    const reciprocal = divide(
      fraction(1) as never,
      denominator.get(ZERO_KEY) as never,
    );
    return scalePolynomial(nodeToPolynomial(args[0]), reciprocal);
  }
  if (candidate.op === "^") {
    if (args.length !== 2 || args[1].type !== "ConstantNode") {
      throw new Error("幂指数必须是非负整数。");
    }
    const exponent = Number(
      (args[1] as MathNode & { value: string | number }).value,
    );
    if (!Number.isInteger(exponent) || exponent < 0) {
      throw new Error("幂指数必须是非负整数。");
    }
    return powerPolynomial(nodeToPolynomial(args[0]), exponent);
  }
  throw new Error(`不支持的运算：${candidate.fn ?? candidate.op}`);
}

function displayValue(value: unknown) {
  try {
    return format(value as never, { precision: 12 });
  } catch {
    return String(value);
  }
}

function valuesEqual(a: unknown, b: unknown) {
  try {
    const difference = abs(subtract(a as never, b as never) as never) as unknown;
    return Number(difference) < 1e-9;
  } catch {
    return displayValue(a) === displayValue(b);
  }
}

export function PolynomialVerifier({ language }: { language: Language }) {
  const english = language === "en";
  const [expressions, setExpressions] = useState(KNOWN_MAP);
  const [points, setPoints] = useState<PointInput[]>(KNOWN_POINTS);
  const [result, setResult] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const degrees = useMemo(() => {
    try {
      return expressions.map((expression) =>
        polynomialDegree(nodeToPolynomial(parse(expression))),
      );
    } catch {
      return null;
    }
  }, [expressions]);

  function verify(
    nextExpressions = expressions,
    nextPoints = points,
  ) {
    setBusy(true);
    window.setTimeout(() => {
      try {
        const polynomials = nextExpressions.map((expression, index) => {
          const node = parse(expression);
          if (!expression.trim()) {
            throw new Error(
              english
                ? `F${index + 1} cannot be empty.`
                : `F${index + 1} 不能为空。`,
            );
          }
          return nodeToPolynomial(node);
        });
        const matrixPolynomials = polynomials.map((polynomial) =>
          VARIABLES.map((_, variableIndex) =>
            derivativePolynomial(polynomial, variableIndex),
          ),
        );
        const minor = (
          rowA: number,
          colA: number,
          rowB: number,
          colB: number,
        ) =>
          multiplyPolynomials(
            matrixPolynomials[rowA][colA],
            matrixPolynomials[rowB][colB],
          );
        const determinantPolynomial = addPolynomials(
          addPolynomials(
            multiplyPolynomials(
              matrixPolynomials[0][0],
              addPolynomials(
                minor(1, 1, 2, 2),
                scalePolynomial(minor(1, 2, 2, 1), fraction(-1)),
              ),
            ),
            scalePolynomial(
              multiplyPolynomials(
                matrixPolynomials[0][1],
                addPolynomials(
                  minor(1, 0, 2, 2),
                  scalePolynomial(minor(1, 2, 2, 0), fraction(-1)),
                ),
              ),
              fraction(-1),
            ),
          ),
          multiplyPolynomials(
            matrixPolynomials[0][2],
            addPolynomials(
              minor(1, 0, 2, 1),
              scalePolynomial(minor(1, 1, 2, 0), fraction(-1)),
            ),
          ),
        );
        const determinant = polynomialToString(determinantPolynomial);
        const matrix = matrixPolynomials.map((row) =>
          row.map(polynomialToString),
        );
        const determinantConstant =
          determinantPolynomial.size <= 1 &&
          (!determinantPolynomial.size || determinantPolynomial.has(ZERO_KEY));
        let determinantNonzero = false;
        if (determinantConstant) {
          determinantNonzero = !coefficientIsZero(
            determinantPolynomial.get(ZERO_KEY) ?? 0,
          );
        }

        const images = nextPoints.map((point) => {
          const scope = {
            x: evaluate(point.x),
            y: evaluate(point.y),
            z: evaluate(point.z),
          };
          return nextExpressions.map((expression) =>
            displayValue(evaluate(expression, scope)),
          );
        });
        const rawImages = nextPoints.map((point) => {
          const scope = {
            x: evaluate(point.x),
            y: evaluate(point.y),
            z: evaluate(point.z),
          };
          return nextExpressions.map((expression) => evaluate(expression, scope));
        });
        const collision =
          rawImages.length >= 2 &&
          rawImages.slice(1).every((image) =>
            image.every((value, index) => valuesEqual(value, rawImages[0][index])),
          );
        const distinct =
          new Set(nextPoints.map((point) => `${point.x}|${point.y}|${point.z}`)).size ===
          nextPoints.length;

        setResult({
          matrix,
          determinant,
          determinantConstant,
          determinantNonzero,
          images,
          collision: collision && distinct,
          error:
            collision && !distinct
              ? english
                ? "The images agree, but the submitted input points are not pairwise distinct."
                : "像相同，但输入点并非两两不同。"
              : undefined,
        });
      } catch (error) {
        setResult({
          matrix: [],
          determinant: "",
          determinantConstant: false,
          determinantNonzero: false,
          images: [],
          collision: false,
          error:
            error instanceof Error
              ? error.message
              : english
                ? "The input could not be parsed."
                : "无法解析输入。",
        });
      } finally {
        setBusy(false);
      }
    }, 20);
  }

  useEffect(() => {
    verify();
    // The initial certificate is intentionally computed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setExpressions(KNOWN_MAP);
    setPoints(KNOWN_POINTS);
    window.setTimeout(() => verify(KNOWN_MAP, KNOWN_POINTS), 0);
  }

  function updatePoint(id: string, variable: "x" | "y" | "z", value: string) {
    setPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, [variable]: value } : point)),
    );
  }

  function addPoint() {
    setPoints((current) => [
      ...current,
      { id: crypto.randomUUID(), x: "0", y: "0", z: "0" },
    ]);
  }

  async function copyCertificate() {
    if (!result) return;
    const text = [
      ...expressions.map((expression, index) => `F${index + 1} = ${expression}`),
      `det(J_F) = ${result.determinant}`,
      ...points.map(
        (point, index) =>
          `p${index + 1} = (${point.x}, ${point.y}, ${point.z}) -> (${result.images[index]?.join(", ") ?? "?"})`,
      ),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="verifier section-shell" id="verify">
      <div className="section-lead">
        <span className="section-index">04 / SYMBOLIC LAB</span>
        <h2>
          {english
            ? "Test a candidate counterexample interactively"
            : "把候选反例放上检验台"}
        </h2>
        <p>
          {english ? (
            <>
              Enter three polynomials and at least two points. The browser
              differentiates symbolically, expands <InlineMath>\det J_F</InlineMath>,
              and evaluates every image. Nothing is sent to a model.
            </>
          ) : (
            <>
              输入三个多项式与至少两个点。浏览器会符号求导、展开
              <InlineMath>\det J_F</InlineMath>，并逐点计算像；数据不会发送给模型。
            </>
          )}
        </p>
      </div>

      <div className="verifier-shell">
        <div className="verifier-toolbar">
          <div>
            <FlaskConical size={18} />
            <span>3-variable polynomial verifier</span>
          </div>
          <div>
            <button onClick={reset}>
              <RotateCcw size={16} /> {english ? "Load known example" : "载入已知证书"}
            </button>
            <button onClick={() => void copyCertificate()} disabled={!result}>
              <Copy size={16} />{" "}
              {copied
                ? english
                  ? "Copied"
                  : "已复制"
                : english
                  ? "Copy result"
                  : "复制结果"}
            </button>
          </div>
        </div>

        <div className="verifier-columns">
          <div className="polynomial-inputs">
            <div className="panel-heading">
              <span>01</span>
              <div>
                <b>{english ? "Polynomial map" : "映射分量"}</b>
                <small>
                  {english
                    ? "Use x, y, z, i; write multiplication with *"
                    : "支持 x, y, z, i；乘法请写 *"}
                </small>
              </div>
            </div>
            {expressions.map((expression, index) => (
              <label className="expression-field" key={index}>
                <span>F<sub>{index + 1}</sub></span>
                <textarea
                  value={expression}
                  rows={3}
                  spellCheck={false}
                  onChange={(event) =>
                    setExpressions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
                <small>
                  {degrees
                    ? `total degree ${degrees[index]}`
                    : english
                      ? "Check expression syntax"
                      : "检查表达式语法"}
                </small>
              </label>
            ))}

            <div className="panel-heading points-heading">
              <span>02</span>
              <div>
                <b>{english ? "Candidate collision points" : "碰撞候选点"}</b>
                <small>
                  {english
                    ? "Fractions and complex values are supported, e.g. 1/2 and 2*i"
                    : "支持分数与复数，如 1/2、2*i"}
                </small>
              </div>
              <button onClick={addPoint}>
                <Plus size={16} /> {english ? "Add point" : "添加点"}
              </button>
            </div>
            <div className="point-input-list">
              {points.map((point, index) => (
                <div className="point-input" key={point.id}>
                  <b>p<sub>{index + 1}</sub></b>
                  {(["x", "y", "z"] as const).map((variable) => (
                    <label key={variable}>
                      <span>{variable}</span>
                      <input
                        value={point[variable]}
                        onChange={(event) =>
                          updatePoint(point.id, variable, event.target.value)
                        }
                      />
                    </label>
                  ))}
                  <button
                    aria-label={
                      english ? `Delete point ${index + 1}` : `删除点 ${index + 1}`
                    }
                    disabled={points.length <= 2}
                    onClick={() =>
                      setPoints((current) =>
                        current.filter((candidate) => candidate.id !== point.id),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              className="verify-button"
              onClick={() => verify()}
              disabled={busy}
            >
              <Sigma size={19} />{" "}
              {busy
                ? english
                  ? "Computing symbolically…"
                  : "符号计算中…"
                : english
                  ? "Compute the Jacobian and test the collision"
                  : "计算雅可比并验证碰撞"}
            </button>
          </div>

          <div className="verification-output">
            <div className="panel-heading">
              <span>03</span>
              <div>
                <b>{english ? "Deterministic result" : "确定性结果"}</b>
                <small>
                  {english
                    ? "In-browser symbolic differentiation and numerical substitution"
                    : "客户端符号微分 + 数值代入"}
                </small>
              </div>
            </div>
            {result?.error && (
              <div className="verifier-error"><AlertCircle size={17} /> {result.error}</div>
            )}
            {result && result.matrix.length > 0 ? (
              <>
                <div className="jacobian-result">
                  <span className="output-label">Jacobian matrix</span>
                  <div className="matrix-wrap">
                    <span className="matrix-bracket left" />
                    <div className="matrix-grid">
                      {result.matrix.flat().map((cell, index) => (
                        <code title={cell} key={index}>{cell}</code>
                      ))}
                    </div>
                    <span className="matrix-bracket right" />
                  </div>
                </div>
                <div className="determinant-result">
                  <span className="output-label">Simplified determinant</span>
                  <div className="det-value">
                    <span>det J<sub>F</sub></span>
                    <b>= {result.determinant}</b>
                  </div>
                  <div className="condition-grid">
                    <Condition
                      ok={result.determinantConstant}
                      label={
                        english ? "Independent of x, y, z" : "与 x, y, z 无关"
                      }
                    />
                    <Condition
                      ok={result.determinantNonzero}
                      label={english ? "Nonzero constant" : "常数非零"}
                    />
                  </div>
                </div>
                <div className="image-result">
                  <span className="output-label">Point images</span>
                  <div className="image-table">
                    {result.images.map((image, index) => (
                      <div key={index}>
                        <span>F(p<sub>{index + 1}</sub>)</span>
                        <code>({image.join(", ")})</code>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className={
                    result.collision &&
                    result.determinantConstant &&
                    result.determinantNonzero
                      ? "verdict pass"
                      : "verdict fail"
                  }
                >
                  {result.collision &&
                  result.determinantConstant &&
                  result.determinantNonzero ? (
                    <>
                      <CheckCircle2 />
                      <div>
                        <b>
                          {english
                            ? "Counterexample verified"
                            : "证书成立"}
                        </b>
                        <span>
                          {english
                            ? "The Jacobian determinant is a nonzero constant and the distinct points share one image."
                            : "非零常雅可比，且所列不同点具有共同像。"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle />
                      <div>
                        <b>
                          {english
                            ? "Not yet a counterexample"
                            : "尚未构成反例证书"}
                        </b>
                        <span>
                          {english
                            ? "A valid submission needs a constant nonzero Jacobian and distinct points with the same image."
                            : "请同时满足常雅可比、非零与不同点同像。"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="verifier-empty">
                <Sigma />
                <p>
                  {english
                    ? "Edit the expressions, then compute the Jacobian matrix and collision result."
                    : "修改表达式后点击“计算”以生成雅可比矩阵和碰撞结果。"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="verifier-note">
        {english ? (
          <>
            Scope note: this interactive tool accepts rational and real
            coefficients plus explicit complex <code>i</code> syntax. The
            benchmark verifier accepts more general algebraic-coefficient
            certificates. Browser collision checks use a 10⁻⁹ numerical
            tolerance; reported scores always come from the exact offline
            program.
          </>
        ) : (
          <>
            范围说明：此交互工具接受有理/实数及显式复数 <code>i</code> 语法；
            评测脚本支持更一般的代数系数证书。浏览器中的同像比较采用 10⁻⁹ 数值容差，
            正式成绩仍以离线精确程序为准。
          </>
        )}
      </p>
    </section>
  );
}

function Condition({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "condition ok" : "condition no"}>
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {label}
    </span>
  );
}
