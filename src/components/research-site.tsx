"use client";

import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  GitFork,
  Menu,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BenchmarkData, CommunitySnapshot, Task } from "../lib/types";
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

const DEPLOY_TARGET =
  process.env.NEXT_PUBLIC_DEPLOY_TARGET ?? "server";
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
  const key = "jacobian-frontier-client-key";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export function ResearchSite({ data }: { data: BenchmarkData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [community, setCommunity] =
    useState<CommunitySnapshot>(EMPTY_COMMUNITY);
  const [communityOnline, setCommunityOnline] = useState(
    Boolean(COMMUNITY_API_URL),
  );
  const [github, setGithub] = useState<{
    available: boolean;
    stars?: number;
    url: string;
  }>({
    available: false,
    url: GITHUB_URL,
  });

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

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到顶部">
          <span className="brand-mark">Jƒ</span>
          <span>
            <b>Jacobian Frontier</b>
            <small>Counterexample Benchmark</small>
          </span>
        </a>
        <nav className={menuOpen ? "main-nav nav-open" : "main-nav"}>
          {[
            ["#atlas", "图谱"],
            ["#benchmark", "任务"],
            ["#results", "结果"],
            ["#verify", "验证器"],
            ["#community", "留言"],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <a
          className="github-cta"
          href={github.url}
          target="_blank"
          rel="noreferrer"
          title={github.available ? "在 GitHub 上关注项目" : "打开 GitHub 仓库"}
        >
          <GitFork size={17} />
          <span>Star / 关注</span>
          {github.available && <b>{github.stars?.toLocaleString()}</b>}
        </a>
        <button
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "关闭导航" : "打开导航"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main id="top">
        <section className="hero section-shell">
          <div className="hero-copy">
            <div className="eyebrow">
              <span>RESEARCH BENCHMARK · 2026</span>
              <span className="live-dot">确定性验证</span>
            </div>
            <h1>
              局部可逆，
              <br />
              <em>并不保证全局唯一。</em>
            </h1>
            <p className="hero-lead">
              一个用于反例构造能力的紧凑评测集：五级问题、{data.dataset.resultCount}
              条真实模型轨迹，以及可在浏览器中复算的符号证书。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#benchmark">
                查看五级任务 <ArrowDown size={16} />
              </a>
              <a className="button button-quiet" href="#verify">
                打开验证器 <ArrowUpRight size={16} />
              </a>
            </div>
            <dl className="hero-stats" aria-label="评测集概览">
              <div><dt>05</dt><dd>能力层级</dd></div>
              <div><dt>{data.dataset.modelCount.toString().padStart(2, "0")}</dt><dd>模型</dd></div>
              <div><dt>{data.dataset.resultCount}</dt><dd>推理轨迹</dd></div>
              <div><dt>{data.aggregate.officialPasses.toString().padStart(2, "0")}</dt><dd>程序通过</dd></div>
            </dl>
          </div>
          <HeroVisual />
        </section>

        <section className="statement-band" aria-label="猜想形式">
          <div className="section-shell statement-inner">
            <span className="section-index">00 / STATEMENT</span>
            <div>
              <p>对复多项式映射</p>
              <BlockMath>{String.raw`F:\mathbb C^d\to\mathbb C^d,\qquad \det J_F\in\mathbb C^\times`}</BlockMath>
              <p>
                非零常雅可比只给出每个有限点附近的局部逆。反例还需一份
                <strong>全局碰撞证书</strong>：
                <InlineMath>{String.raw`p\neq q,\;F(p)=F(q)`}</InlineMath>。
              </p>
            </div>
            <div className="statement-note">
              <ShieldCheck size={19} />
              <p>
                本站所有成绩来自离线符号程序；模型名、文风或自我声明都不参与判分。
              </p>
            </div>
          </div>
        </section>

        <section className="atlas section-shell" id="atlas">
          <SectionLead
            index="01"
            eyebrow="MATHEMATICAL ATLAS"
            title="从猜想，到一份有限证书"
            body="反例的核心不是长篇论证，而是两个可重复计算的事实：处处非奇异，以及至少一次全局重叠。"
          />
          <div className="atlas-grid">
            <div className="timeline-panel">
              <h3>进展刻度</h3>
              <ol className="timeline">
                <li>
                  <time>1939</time>
                  <div><b>Keller 提出问题</b><p>非零常雅可比是否强迫多项式全局可逆？</p></div>
                </li>
                <li>
                  <time>1982</time>
                  <div>
                    <b>次数归约</b>
                    <p>一般问题可归约到具有三次齐次部分的特殊映射。</p>
                    <a href="https://doi.org/10.1007/BF01403080" target="_blank" rel="noreferrer">Bass–Connell–Wright <ArrowUpRight size={12} /></a>
                  </div>
                </li>
                <li>
                  <time>2022</time>
                  <div>
                    <b>二维候选继续被推高</b>
                    <p>若二维反例存在，低次数组合受到更强排除。</p>
                    <a href="https://arxiv.org/abs/2204.14178" target="_blank" rel="noreferrer">degree bound <ArrowUpRight size={12} /></a>
                  </div>
                </li>
                <li className="timeline-current">
                  <time>2026</time>
                  <div>
                    <b>三维显式反例</b>
                    <p>次数 (7, 6, 4)，常雅可比 −2，且有三个有理碰撞点；形式化证明随后发布。</p>
                    <span className="source-links">
                      <a href="https://isa-afp.org/entries/Jacobian_Counterexample.html" target="_blank" rel="noreferrer">AFP</a>
                      <a href="https://jacobianfun.org/jacobian-explained" target="_blank" rel="noreferrer">explanation</a>
                    </span>
                  </div>
                </li>
              </ol>
            </div>

            <article className="known-map">
              <div className="known-map-head">
                <div>
                  <span className="micro-label">FINITE CERTIFICATE</span>
                  <h3>已知三维构造</h3>
                </div>
                <span className="verified-badge"><ShieldCheck size={14} /> 已形式化核验</span>
              </div>
              <p className="formula-intro">
                令 <InlineMath>u=1+xy</InlineMath>，则
              </p>
              <BlockMath>{String.raw`\begin{aligned}
F_1&=u^3z+y^2u(4+3xy),\\
F_2&=y+3xu^2z+3xy^2(4+3xy),\\
F_3&=2x-3x^2y-x^3z.
\end{aligned}`}</BlockMath>
              <div className="certificate-row">
                <div>
                  <span>局部证书</span>
                  <InlineMath>{String.raw`\det J_F=-2`}</InlineMath>
                </div>
                <div>
                  <span>次数向量</span>
                  <InlineMath>{String.raw`(7,6,4)`}</InlineMath>
                </div>
              </div>
              <div className="collision">
                <span>全局证书</span>
                <BlockMath>{String.raw`\begin{gathered}
F(0,0,-\tfrac14)=F(1,-\tfrac32,\tfrac{13}2)\\
=F(-1,\tfrac32,\tfrac{13}2)=(-\tfrac14,0,0)
\end{gathered}`}</BlockMath>
              </div>
              <p className="scope-note">
                直接添上恒等坐标可扩展到所有 <InlineMath>d\ge 3</InlineMath>；
                二维情形仍需单独解决。
              </p>
            </article>
          </div>
        </section>

        <TaskSection
          data={data}
          likes={community.taskLikes}
          onLike={likeTask}
          communityOnline={communityOnline}
        />
        <ResultsDashboard data={data} />
        <PolynomialVerifier />
        <CommunityBoard
          apiUrl={COMMUNITY_API_URL}
          snapshot={community}
          online={communityOnline}
          refresh={refreshCommunity}
          getClientKey={getClientKey}
        />

        <section className="sources section-shell">
          <span className="section-index">06 / SOURCES</span>
          <div>
            <h2>证据链，而非权威链</h2>
            <p>
              页面陈述以可复算恒等式、离线验证记录与公开形式化材料为依据。模型输出可能包含错误，故原始轨迹与评测器结论并列展示。
            </p>
          </div>
          <div className="source-list">
            <a href="https://isa-afp.org/entries/Jacobian_Counterexample.html" target="_blank" rel="noreferrer"><span>01</span>Archive of Formal Proofs<ArrowUpRight size={14} /></a>
            <a href="https://jacobianfun.org/jacobian-explained" target="_blank" rel="noreferrer"><span>02</span>Counterexample explained<ArrowUpRight size={14} /></a>
            <a href="https://zzhang-iu.github.io/papers/direct-consequences-jacobian/index.html" target="_blank" rel="noreferrer"><span>03</span>Direct consequences<ArrowUpRight size={14} /></a>
          </div>
        </section>
      </main>

      <footer>
        <div className="section-shell footer-inner">
          <div>
            <span className="brand-mark">Jƒ</span>
            <p>Jacobian Frontier<br />构造 · 证书 · 复算</p>
          </div>
          <p className="footer-note">
            数据快照 {new Date(data.generatedAt).toLocaleDateString("zh-CN")}
            <br />评测框架与网站相互独立。
          </p>
          <a href="#top">回到顶部 <ArrowDown className="arrow-up" size={15} /></a>
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
      <span className="section-index">{index} / {eyebrow}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
