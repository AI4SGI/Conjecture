"use client";

import {
  ArrowDown,
  ArrowUpRight,
  GitFork,
  Languages,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  BenchmarkData,
  CommunitySnapshot,
  Language,
  Task,
} from "../lib/types";
import { BlockMath, InlineMath } from "./math";
import { HeroVisual } from "./hero-visual";
import { TaskSection } from "./task-section";
import { ResultsDashboard } from "./results-dashboard";
import { PolynomialVerifier } from "./polynomial-verifier";
import { CommunityBoard } from "./community-board";

const EMPTY_COMMUNITY: CommunitySnapshot = {
  taskLikes: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
  messages: [],
  pendingCount: 0,
};

const DEPLOY_TARGET = process.env.NEXT_PUBLIC_DEPLOY_TARGET ?? "server";
const SITE_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(
  /\/+$/,
  "",
);
const EXTERNAL_COMMUNITY_BASE = (
  process.env.NEXT_PUBLIC_COMMUNITY_API_URL ?? ""
).replace(/\/+$/, "");
const COMMUNITY_API_URL = EXTERNAL_COMMUNITY_BASE
  ? `${EXTERNAL_COMMUNITY_BASE}/api/community`
  : DEPLOY_TARGET === "github-pages"
    ? null
    : `${SITE_BASE_PATH}/api/community`;
const GITHUB_REPOSITORY =
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";
const GITHUB_URL = `https://github.com/${GITHUB_REPOSITORY}`;

function getClientKey() {
  const key = "conjecture-frontier-client-key";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export function ResearchSite({ data }: { data: BenchmarkData }) {
  const [language, setLanguage] = useState<Language>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeConjecture] = useState("jacobian");
  const [community, setCommunity] =
    useState<CommunitySnapshot>(EMPTY_COMMUNITY);
  const [communityOnline, setCommunityOnline] = useState(
    Boolean(COMMUNITY_API_URL),
  );
  const [github, setGithub] = useState<{
    available: boolean;
    stars?: number;
    url: string;
  }>({ available: false, url: GITHUB_URL });
  const english = language === "en";

  useEffect(() => {
    document.documentElement.lang = english ? "en" : "zh-CN";
  }, [english]);

  const refreshCommunity = useCallback(async (sort = "recent") => {
    if (!COMMUNITY_API_URL) {
      setCommunityOnline(false);
      return;
    }
    try {
      const response = await fetch(`${COMMUNITY_API_URL}?sort=${sort}`, {
        cache: "no-store",
      });
      const snapshot = (await response.json()) as CommunitySnapshot;
      if (!response.ok || snapshot.unavailable) throw new Error("unavailable");
      setCommunity(snapshot);
      setCommunityOnline(true);
    } catch {
      setCommunityOnline(false);
    }
  }, []);

  useEffect(() => {
    void refreshCommunity();
    const githubEndpoint =
      DEPLOY_TARGET === "github-pages"
        ? `https://api.github.com/repos/${GITHUB_REPOSITORY}`
        : `${SITE_BASE_PATH}/api/github`;
    void fetch(githubEndpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error("github_unavailable");
        if (DEPLOY_TARGET === "github-pages") {
          const payload = (await response.json()) as {
            stargazers_count: number;
            html_url: string;
          };
          return {
            available: true,
            stars: payload.stargazers_count,
            url: payload.html_url,
          };
        }
        return response.json() as Promise<{
          available: boolean;
          stars?: number;
          url: string;
        }>;
      })
      .then(setGithub)
      .catch(() => undefined);
  }, [refreshCommunity]);

  async function likeTask(task: Task["key"]) {
    if (!COMMUNITY_API_URL) return "error" as const;
    const response = await fetch(COMMUNITY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "like_task",
        task,
        clientKey: getClientKey(),
      }),
    });
    if (response.ok) {
      const result = (await response.json()) as { likes: number };
      setCommunity((current) => ({
        ...current,
        taskLikes: { ...current.taskLikes, [task]: result.likes },
      }));
      return "liked" as const;
    }
    if (response.status === 409) return "duplicate" as const;
    return "error" as const;
  }

  const navigation = english
    ? [
        ["#atlas", "Atlas"],
        ["#benchmark", "Benchmark"],
        ["#results", "Evaluation"],
        ["#verify", "Symbolic Lab"],
        ["#community", "Community"],
      ]
    : [
        ["#atlas", "图谱"],
        ["#benchmark", "任务"],
        ["#results", "结果"],
        ["#verify", "验证器"],
        ["#community", "留言"],
      ];

  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="#top"
          aria-label={english ? "Back to top" : "回到顶部"}
        >
          <span className="brand-mark conjecture-mark" aria-hidden="true">
            ∃
          </span>
          <span>
            <b>Conjecture Frontier</b>
            <small>Counterexample Benchmark</small>
          </span>
        </a>
        <nav className={menuOpen ? "main-nav nav-open" : "main-nav"}>
          {navigation.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <label className="language-switcher">
            <Languages size={16} />
            <span className="sr-only">Language</span>
            <select
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <a
            className="github-cta"
            href={github.url}
            target="_blank"
            rel="noreferrer"
            title={
              github.available
                ? english
                  ? "Follow the project on GitHub"
                  : "在 GitHub 上关注项目"
                : english
                  ? "Open the GitHub repository"
                  : "打开 GitHub 仓库"
            }
          >
            <GitFork size={17} />
            <span>Star</span>
            {github.available && <b>{github.stars?.toLocaleString()}</b>}
          </a>
        </div>
        <button
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={
            menuOpen
              ? english
                ? "Close navigation"
                : "关闭导航"
              : english
                ? "Open navigation"
                : "打开导航"
          }
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main id="top">
        <section className="hero-home section-shell">
          <div className="hero-intro">
            <div className="eyebrow hero-eyebrow">
              <span>COUNTEREXAMPLE BENCHMARK · 2026</span>
              <span className="live-dot">
                {english ? "DETERMINISTIC VERIFICATION" : "确定性验证"}
              </span>
            </div>
            <h1>
              {english
                ? "Conjecture Frontier"
                : "局部可逆，并不保证全局唯一。"}
            </h1>
            {english ? (
              <figure className="hero-quote">
                <blockquote>
                  “Proof assistants are useful computer tools that check whether
                  a mathematical argument is correct or not.”
                </blockquote>
                <figcaption>
                  — Terence Tao,{" "}
                  <a
                    href="https://www.theatlantic.com/technology/archive/2024/10/terence-tao-ai-interview/680153/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    The Atlantic, 2024
                  </a>
                </figcaption>
              </figure>
            ) : (
              <p className="hero-legacy-line">
                一个用于反例构造能力的紧凑评测集，以雅可比猜想为首个案例。
              </p>
            )}
            <p className="hero-lead">
              {english
                ? "A benchmark for constructing counterexamples to frontier mathematical conjectures, with the Jacobian conjecture as its first case study."
                : "一个用于前沿数学猜想的反例构造能力评测集，以雅可比猜想为例。"}
            </p>
          </div>

          <div className="conjecture-selector" aria-label="Conjecture selector">
            <span>{english ? "SELECT A CONJECTURE" : "选择猜想"}</span>
            <button
              className={activeConjecture === "jacobian" ? "active" : ""}
              type="button"
            >
              <b>{english ? "Jacobian Conjecture" : "雅可比猜想"}</b>
              <small>{english ? "Available now" : "当前可用"}</small>
            </button>
            <button type="button" disabled>
              <b>{english ? "More conjectures" : "更多猜想"}</b>
              <small>{english ? "In preparation" : "筹备中"}</small>
            </button>
          </div>

          <div className="hero-case-grid">
            <div className="hero-case-copy">
              <span className="micro-label">
                {english
                  ? "CURRENT CASE STUDY · COMPLEX POLYNOMIAL MAPS"
                  : "当前案例 · 复多项式映射"}
              </span>
              <h2>{english ? "Jacobian Conjecture" : "雅可比猜想"}</h2>
              <p>
                {english
                  ? "Can a polynomial map be locally invertible everywhere yet fail to be globally injective? This benchmark asks models to construct explicit maps and finite collision witnesses that an offline symbolic program can check."
                  : "一个多项式映射能否处处局部可逆，却不是全局单射？评测要求模型提交可由离线符号程序验证的显式映射与有限碰撞见证。"}
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#benchmark">
                  {english ? "Explore five problems" : "查看五级任务"}{" "}
                  <ArrowDown size={17} />
                </a>
                <a className="button button-quiet" href="#verify">
                  {english ? "Open symbolic verifier" : "打开验证器"}{" "}
                  <ArrowUpRight size={17} />
                </a>
              </div>
              <dl className="hero-stats" aria-label="Benchmark overview">
                <div>
                  <dt>05</dt>
                  <dd>{english ? "problems" : "能力层级"}</dd>
                </div>
                <div>
                  <dt>{data.dataset.modelCount.toString().padStart(2, "0")}</dt>
                  <dd>{english ? "models" : "模型"}</dd>
                </div>
                <div>
                  <dt>{data.dataset.resultCount}</dt>
                  <dd>{english ? "records" : "推理轨迹"}</dd>
                </div>
                <div>
                  <dt>
                    {data.aggregate.officialPasses.toString().padStart(2, "0")}
                  </dt>
                  <dd>{english ? "offline passes" : "程序通过"}</dd>
                </div>
              </dl>
            </div>
            <HeroVisual language={language} />
          </div>
        </section>

        <section className="statement-band" aria-label="Conjecture statement">
          <div className="section-shell statement-inner">
            <span className="section-index">00 / STATEMENT</span>
            <div className="statement-copy">
              <p>
                {english
                  ? "For a polynomial map over the complex numbers,"
                  : "对复多项式映射"}
              </p>
              <BlockMath>{String.raw`F=(F_1,\ldots,F_d):\mathbb C^d\longrightarrow\mathbb C^d,\qquad \det J_F\in\mathbb C^\times`}</BlockMath>
              <p>
                {english ? (
                  <>
                    the conjecture asserts that <InlineMath>F</InlineMath> is a
                    polynomial automorphism. A counterexample must therefore
                    provide distinct points{" "}
                    <InlineMath>{String.raw`p\ne q`}</InlineMath> with{" "}
                    <InlineMath>{String.raw`F(p)=F(q)`}</InlineMath>.
                  </>
                ) : (
                  <>
                    非零常雅可比只给出每个有限点附近的局部逆。反例还需一份
                    <strong>全局碰撞证书</strong>：
                    <InlineMath>{String.raw`p\neq q,\;F(p)=F(q)`}</InlineMath>。
                  </>
                )}
              </p>
            </div>
            <div className="statement-note">
              <ShieldCheck size={21} />
              <p>
                {english
                  ? "Every counterexample result on this site is evaluated by an offline symbolic program. No LLM judge is used."
                  : "本站所有反例评测仅采用离线符号程序，不使用 LLM judge。"}
              </p>
            </div>
          </div>
        </section>

        <section className="atlas section-shell" id="atlas">
          <SectionLead
            index="01"
            eyebrow="MATHEMATICAL ATLAS"
            title={
              english
                ? "From the conjecture to the first counterexample in complex dimension three"
                : "从猜想到三维复空间的首个反例"
            }
            body={
              english
                ? "A counterexample is not a persuasive narrative but a finite, reproducible certificate: a nonzero constant Jacobian and a global collision."
                : "反例的核心不是长篇论证，而是两个可重复计算的事实：处处非奇异，以及至少一次全局重叠。"
            }
          />
          <div className="atlas-grid">
            <div className="timeline-panel">
              <h3>{english ? "Progress timeline" : "进展刻度"}</h3>
              <ol className="timeline">
                <li>
                  <time>1939</time>
                  <div>
                    <b>{english ? "Keller formulates the problem" : "Keller 提出问题"}</b>
                    <p>
                      {english
                        ? "Does a nonzero constant Jacobian force a polynomial map to be globally invertible?"
                        : "非零常雅可比是否强迫多项式全局可逆？"}
                    </p>
                  </div>
                </li>
                <li>
                  <time>1982</time>
                  <div>
                    <b>{english ? "Degree reduction" : "次数归约"}</b>
                    <p>
                      {english
                        ? "The general problem is reduced to special maps with cubic homogeneous parts."
                        : "一般问题可归约到具有三次齐次部分的特殊映射。"}
                    </p>
                    <a
                      href="https://doi.org/10.1007/BF01403080"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bass–Connell–Wright <ArrowUpRight size={13} />
                    </a>
                  </div>
                </li>
                <li>
                  <time>2022</time>
                  <div>
                    <b>
                      {english
                        ? "The 2D lower-bound frontier advances"
                        : "二维候选继续被推高"}
                    </b>
                    <p>
                      {english
                        ? "Further low-degree combinations are excluded if a two-dimensional counterexample exists."
                        : "若二维反例存在，低次数组合受到更强排除。"}
                    </p>
                    <a
                      href="https://arxiv.org/abs/2204.14178"
                      target="_blank"
                      rel="noreferrer"
                    >
                      degree bound <ArrowUpRight size={13} />
                    </a>
                  </div>
                </li>
                <li className="timeline-current">
                  <time>2026</time>
                  <div>
                    <b>
                      {english
                        ? "Explicit 3D counterexample"
                        : "三维显式反例"}
                    </b>
                    <p>
                      {english
                        ? "Component degrees (7, 6, 4), constant Jacobian −2, and three rational points in one fiber."
                        : "次数 (7, 6, 4)，常雅可比 −2，且有三个有理碰撞点。"}
                    </p>
                    <span className="source-links">
                      <a
                        href="https://isa-afp.org/entries/Jacobian_Counterexample.html"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AFP
                      </a>
                      <a
                        href="https://jacobianfun.org/jacobian-explained"
                        target="_blank"
                        rel="noreferrer"
                      >
                        explanation
                      </a>
                    </span>
                  </div>
                </li>
              </ol>
            </div>

            <article className="known-map">
              <div className="known-map-head">
                <div>
                  <span className="micro-label">FINITE CERTIFICATE</span>
                  <h3>
                    {english
                      ? "The first known 3D construction"
                      : "已知三维构造"}
                  </h3>
                </div>
                <span className="verified-badge">
                  <ShieldCheck size={15} />{" "}
                  {english ? "FORMALLY VERIFIED" : "已形式化核验"}
                </span>
              </div>
              <p className="formula-intro">
                {english ? "Set " : "令 "}
                <InlineMath>u=1+xy</InlineMath>
                {english ? ". Then" : "，则"}
              </p>
              <BlockMath>{String.raw`\begin{aligned}
F_1&=u^3z+y^2u(4+3xy),\\
F_2&=y+3xu^2z+3xy^2(4+3xy),\\
F_3&=2x-3x^2y-x^3z.
\end{aligned}`}</BlockMath>
              <div className="certificate-row">
                <div>
                  <span>{english ? "LOCAL CERTIFICATE" : "局部证书"}</span>
                  <InlineMath>{String.raw`\det J_F=-2`}</InlineMath>
                </div>
                <div>
                  <span>{english ? "DEGREE VECTOR" : "次数向量"}</span>
                  <InlineMath>{String.raw`(7,6,4)`}</InlineMath>
                </div>
              </div>
              <div className="collision">
                <span>{english ? "GLOBAL CERTIFICATE" : "全局证书"}</span>
                <BlockMath>{String.raw`\begin{gathered}
F(0,0,-\tfrac14)=F(1,-\tfrac32,\tfrac{13}2)\\
=F(-1,\tfrac32,\tfrac{13}2)=(-\tfrac14,0,0)
\end{gathered}`}</BlockMath>
              </div>
              <p className="scope-note">
                {english ? (
                  <>
                    Adding identity coordinates extends the construction to all{" "}
                    <InlineMath>d\ge 3</InlineMath>; dimension two remains a
                    separate open frontier.
                  </>
                ) : (
                  <>
                    直接添上恒等坐标可扩展到所有{" "}
                    <InlineMath>d\ge 3</InlineMath>；二维情形仍需单独解决。
                  </>
                )}
              </p>
            </article>
          </div>
        </section>

        <TaskSection
          data={data}
          likes={community.taskLikes}
          onLike={likeTask}
          communityOnline={communityOnline}
          language={language}
        />
        <ResultsDashboard data={data} language={language} />
        <PolynomialVerifier language={language} />
        <CommunityBoard
          apiUrl={COMMUNITY_API_URL}
          snapshot={community}
          online={communityOnline}
          refresh={refreshCommunity}
          getClientKey={getClientKey}
          language={language}
        />

        <section className="sources section-shell" id="sources">
          <span className="section-index">06 / SOURCES</span>
          <div>
            <h2>
              {english
                ? "Counterexamples turn conjectures into decidable evidence"
                : "反例验证是解决猜想的关键证据"}
            </h2>
            <p>
              {english
                ? "A single verified counterexample can settle a universal claim. This research interface is not an independent publication or proof repository: model outputs may be incomplete or wrong, novelty is not decided automatically, and every mathematical claim should be checked against the linked primary material."
                : "一个经过验证的反例可以否定一个全称猜想。本页面不是独立论文或证明库；模型输出可能错误，创新性不会自动判定，数学陈述应以原始来源为准。"}
            </p>
          </div>
          <div className="source-list">
            <a
              href="https://isa-afp.org/entries/Jacobian_Counterexample.html"
              target="_blank"
              rel="noreferrer"
            >
              <span>01</span>Archive of Formal Proofs
              <ArrowUpRight size={15} />
            </a>
            <a
              href="https://jacobianfun.org/jacobian-explained"
              target="_blank"
              rel="noreferrer"
            >
              <span>02</span>Counterexample explained
              <ArrowUpRight size={15} />
            </a>
            <a
              href="https://zzhang-iu.github.io/papers/direct-consequences-jacobian/index.html"
              target="_blank"
              rel="noreferrer"
            >
              <span>03</span>Direct consequences
              <ArrowUpRight size={15} />
            </a>
            <a
              href="https://www.theatlantic.com/technology/archive/2024/10/terence-tao-ai-interview/680153/"
              target="_blank"
              rel="noreferrer"
            >
              <span>04</span>Terence Tao on AI and proof assistants
              <ArrowUpRight size={15} />
            </a>
            <a
              href="https://doi.org/10.1515/9780691218304"
              target="_blank"
              rel="noreferrer"
            >
              <span>05</span>Pólya · Mathematics and Plausible Reasoning
              <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="acknowledgement">
            <span>ACKNOWLEDGEMENT</span>
            <p>
              {english
                ? "We thank the authors and maintainers of the formal counterexample materials, the benchmark contributors, and the open-source KaTeX and mathjs communities. “Certainly, let us learn proving, but also let us learn guessing.” — George Pólya."
                : "感谢形式化反例材料的作者与维护者、评测贡献者，以及 KaTeX 和 mathjs 开源社区。"}
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="section-shell footer-inner">
          <div className="footer-brand">
            <span className="brand-mark conjecture-mark" aria-hidden="true">
              ∃
            </span>
            <p>
              <b>Conjecture Frontier</b>
              <br />
              Counterexample Benchmark
            </p>
          </div>
          <div className="footer-meta">
            <p>Shanghai Artificial Intelligence Laboratory</p>
            <p>yufangchen at pjlab.org.cn</p>
            <p>Page assisted by Codex with GPT-5.6 Sol</p>
          </div>
          <a href="#top">
            {english ? "Back to top" : "回到顶部"}{" "}
            <ArrowDown className="arrow-up" size={16} />
          </a>
        </div>
      </footer>
    </>
  );
}

function SectionLead({
  index,
  eyebrow,
  title,
  body,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="section-lead">
      <span className="section-index">
        {index} / {eyebrow}
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
