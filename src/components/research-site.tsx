"use client";

import { ArrowDown, ArrowUpRight, Database, Menu, ShieldCheck, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunitySnapshot, ConjectureData, FrontierNewsItem, Language, SiteData } from "../lib/types";
import { CommunityBoard } from "./community-board";
import { ConjectureVisual } from "./conjecture-visual";
import { BlockMath, InlineMath } from "./math";
import { ResultsDashboard } from "./results-dashboard";
import { SymbolicLab } from "./symbolic-lab";
import { MathText, TaskSection } from "./task-section";
import { ReferencesSection } from "./references-section";
import { GlobalTraffic } from "./global-traffic";

const EMPTY_COMMUNITY: CommunitySnapshot = {
  taskLikes: {},
  likedTasks: [],
  messages: [],
  pendingCount: 0,
  traffic: { total: 0, countries: {} },
};
const DEPLOY_TARGET = process.env.NEXT_PUBLIC_DEPLOY_TARGET ?? "server";
const SITE_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const EXTERNAL_COMMUNITY_BASE = (process.env.NEXT_PUBLIC_COMMUNITY_API_URL ?? "").replace(/\/+$/, "");
const COMMUNITY_RELAY_BASE = "https://ai4sgi-conjecture-community.pages.dev";
const CONFIGURED_COMMUNITY_BASES = (process.env.NEXT_PUBLIC_COMMUNITY_API_URLS ?? "")
  .split(",")
  .map((value) => value.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const COMMUNITY_API_URLS = [...new Set([
  ...(DEPLOY_TARGET === "github-pages" ? [COMMUNITY_RELAY_BASE] : []),
  ...CONFIGURED_COMMUNITY_BASES,
  ...(EXTERNAL_COMMUNITY_BASE ? [EXTERNAL_COMMUNITY_BASE] : []),
  ...(DEPLOY_TARGET === "github-pages" ? [] : [SITE_BASE_PATH]),
])].map((base) => `${base}/api/community`);
const COMMUNITY_CACHE_KEY = "opbench-community-public-snapshot-v1";
const COMMUNITY_ENDPOINT_KEY = "opbench-community-api-endpoint-v1";
const GITHUB_REPOSITORY = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";
const GITHUB_URL = `https://github.com/${GITHUB_REPOSITORY}`;
const BUILD_GITHUB_STARS = Number(process.env.NEXT_PUBLIC_GITHUB_STARS);
const BUILD_GITHUB_AVAILABLE = Number.isFinite(BUILD_GITHUB_STARS) && BUILD_GITHUB_STARS >= 0;
let ephemeralClientKey = "";

function getClientKey() {
  const key = "opbench-client-key";
  try {
    let value = window.localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      window.localStorage.setItem(key, value);
    }
    return value;
  } catch {
    ephemeralClientKey ||= crypto.randomUUID();
    return ephemeralClientKey;
  }
}

function isCommunitySnapshot(value: unknown): value is CommunitySnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommunitySnapshot>;
  return Boolean(
    candidate.taskLikes
    && typeof candidate.taskLikes === "object"
    && Array.isArray(candidate.messages)
    && typeof candidate.pendingCount === "number",
  );
}

function readCachedCommunity() {
  try {
    const value = JSON.parse(window.localStorage.getItem(COMMUNITY_CACHE_KEY) ?? "null") as unknown;
    return isCommunitySnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

function cacheCommunity(snapshot: CommunitySnapshot) {
  try {
    window.localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // The live snapshot remains usable when private browsing blocks storage.
  }
}

function readPreferredCommunityEndpoint() {
  try {
    return window.localStorage.getItem(COMMUNITY_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function cachePreferredCommunityEndpoint(apiUrl: string) {
  try {
    window.localStorage.setItem(COMMUNITY_ENDPOINT_KEY, apiUrl);
  } catch {
    // Endpoint selection remains valid for the current page lifetime.
  }
}

export function ResearchSite({ site, news }: { site: SiteData; news: FrontierNewsItem[] }) {
  const [language, setLanguage] = useState<Language>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState(site.conjectures[0]?.id ?? "");
  const [community, setCommunity] = useState<CommunitySnapshot>(EMPTY_COMMUNITY);
  const [communityOnline, setCommunityOnline] = useState(false);
  const [communityApiUrl, setCommunityApiUrl] = useState<string | null>(COMMUNITY_API_URLS[0] ?? null);
  const activeCommunityApiRef = useRef<string | null>(null);
  const communitySortRef = useRef("recent");
  const [github, setGithub] = useState<{ available: boolean; stars?: number; url: string }>({
    available: BUILD_GITHUB_AVAILABLE,
    stars: BUILD_GITHUB_AVAILABLE ? BUILD_GITHUB_STARS : undefined,
    url: GITHUB_URL,
  });
  const english = language === "en";
  const conjecture = useMemo(
    () => site.conjectures.find((item) => item.id === activeId) ?? site.conjectures[0],
    [activeId, site.conjectures],
  );
  const data = conjecture.benchmarkData;

  useEffect(() => {
    document.documentElement.lang = english ? "en" : "zh-CN";
  }, [english]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("conjecture");
    if (requested && site.conjectures.some((item) => item.slug === requested || item.id === requested)) {
      setActiveId(site.conjectures.find((item) => item.slug === requested || item.id === requested)!.id);
    }
  }, [site.conjectures]);

  const refreshCommunity = useCallback(async (sort?: string) => {
    if (sort) communitySortRef.current = sort;
    if (!COMMUNITY_API_URLS.length) {
      setCommunityOnline(false);
      return;
    }
    const preferred = activeCommunityApiRef.current
      ?? readPreferredCommunityEndpoint();
    const endpoints = [...new Set([
      ...(preferred ? [preferred] : []),
      ...COMMUNITY_API_URLS,
    ])];
    try {
      const query = new URLSearchParams({
        sort: communitySortRef.current,
        clientKey: getClientKey(),
      });
      const result = await Promise.any(endpoints.map(async (apiUrl) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetch(`${apiUrl}?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const snapshot = (await response.json()) as unknown;
          if (!response.ok || !isCommunitySnapshot(snapshot) || snapshot.unavailable) {
            throw new Error("unavailable");
          }
          return { apiUrl, snapshot };
        } finally {
          window.clearTimeout(timeout);
        }
      }));
      const { apiUrl, snapshot } = result;
      activeCommunityApiRef.current = apiUrl;
      setCommunityApiUrl(apiUrl);
      cachePreferredCommunityEndpoint(apiUrl);
      cacheCommunity(snapshot);
      setCommunity(snapshot);
      setCommunityOnline(true);
    } catch {
      setCommunityOnline(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCachedCommunity();
    if (cached) setCommunity(cached);
    void refreshCommunity();
    const reconnect = () => void refreshCommunity();
    const reconnectWhenVisible = () => {
      if (document.visibilityState === "visible") reconnect();
    };
    const reconnectTimer = window.setInterval(reconnect, 30_000);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    document.addEventListener("visibilitychange", reconnectWhenVisible);
    const githubEndpoint = EXTERNAL_COMMUNITY_BASE
      ? `${EXTERNAL_COMMUNITY_BASE}/api/github`
      : DEPLOY_TARGET === "github-pages"
        ? `https://api.github.com/repos/${GITHUB_REPOSITORY}`
        : `${SITE_BASE_PATH}/api/github`;
    void fetch(githubEndpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error("github unavailable");
        const payload = (await response.json()) as {
          available?: boolean;
          stars?: number;
          url?: string;
          stargazers_count?: number;
          html_url?: string;
        };
        return "stargazers_count" in payload
          ? { available: true, stars: payload.stargazers_count, url: payload.html_url ?? GITHUB_URL }
          : { available: Boolean(payload.available), stars: payload.stars, url: payload.url ?? GITHUB_URL };
      })
      .then((result) => {
        if (result.available) setGithub(result);
      })
      .catch(() => undefined);
    return () => {
      window.clearInterval(reconnectTimer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      document.removeEventListener("visibilitychange", reconnectWhenVisible);
    };
  }, [refreshCommunity]);

  async function likeTask(conjectureId: string, task: string) {
    if (!communityApiUrl || !communityOnline) return "error" as const;
    const target = `${conjectureId}:${task}`;
    try {
      const response = await fetch(communityApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like_task", conjecture: conjectureId, task, clientKey: getClientKey() }),
      });
      if (!response.ok) return "error" as const;
      const result = (await response.json()) as { likes: number; liked: boolean };
      setCommunity((current) => {
        const snapshot = {
          ...current,
          taskLikes: { ...current.taskLikes, [target]: result.likes },
          likedTasks: result.liked
            ? [...new Set([...(current.likedTasks ?? []), target])]
            : (current.likedTasks ?? []).filter((candidate) => candidate !== target),
        };
        cacheCommunity(snapshot);
        return snapshot;
      });
      return result.liked ? ("liked" as const) : ("unliked" as const);
    } catch {
      setCommunityOnline(false);
      void refreshCommunity();
      return "error" as const;
    }
  }

  function selectConjecture(id: string) {
    const selected = site.conjectures.find((item) => item.id === id);
    if (!selected) return;
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("conjecture", selected.slug);
    window.history.replaceState({}, "", url);
  }

  const navigation = english
    ? [["#atlas", "Atlas"], ["#benchmark", "Benchmark"], ["#results", "Evaluation"], ["#verify", "Symbolic Lab"], ["#community", "Community"], ["#references", "References"], ["#global-reach", "Global reach"]]
    : [["#atlas", "进展"], ["#benchmark", "题目"], ["#results", "结果"], ["#verify", "验证器"], ["#community", "讨论"], ["#references", "参考资料"], ["#global-reach", "全球访问"]];

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={english ? "Back to top" : "回到顶部"}>
          <span className="brand-mark conjecture-mark" aria-hidden="true">∃</span>
          <span><b>OPBench</b><small>OpenProblemBench</small></span>
        </a>
        <nav className={menuOpen ? "main-nav nav-open" : "main-nav"}>
          {navigation.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
        </nav>
        <div className="header-actions">
          <label className="language-switcher"><select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="zh">中文</option></select></label>
          <a className="github-cta" href={github.url} target="_blank" rel="noreferrer"><Star size={17} /><span>Star</span><b aria-label={github.available ? `${github.stars ?? 0} GitHub stars` : "GitHub stars unavailable"}>{github.available ? (github.stars ?? 0).toLocaleString() : "—"}</b></a>
        </div>
        <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? (english ? "Close navigation" : "关闭导航") : english ? "Open navigation" : "打开导航"} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
      </header>

      <main id="top">
        <section className="hero-home section-shell">
          <div className="hero-intro">
            <div className="eyebrow hero-eyebrow"><span>OPENPROBLEMBENCH · 2026</span><span className="live-dot">{english ? "DETERMINISTIC VERIFICATION" : "确定性验证"}</span></div>
            <h1>{english ? "Open problems, finite certificates" : "开放问题，有限证书"}</h1>
            <p className="hero-lead">{english ? "OPBench is an extensible benchmark and public research interface for AI attempts on open mathematical problems—centered on outputs that independent programs can verify." : "OPBench 是面向 AI 开放数学问题作答的可拓展评测集与公共研究界面，核心是可由独立程序核验的输出。"}</p>
          </div>

          <div className="conjecture-selector" aria-label="Conjecture selector">
            <span>{english ? "SELECT A CONJECTURE" : "选择猜想"}</span>
            {site.conjectures.map((item) => (
              <button className={item.id === conjecture.id ? "active" : ""} type="button" key={item.id} onClick={() => selectConjecture(item.id)}>
                <b>{english ? item.title : item.titleZh}</b>
                <small>{english ? item.proposed : item.proposedZh}</small>
              </button>
            ))}
          </div>

          <section className="frontier-news" aria-label="Frontier news">
            <div className="frontier-news-head"><div><span className="micro-label">{english ? "FRONTIER NEWS" : "前沿动态"}</span><h2>{english ? "AI-assisted mathematics, with the verification status attached" : "保留核验状态的 AI 数学进展"}</h2></div><p>{english ? "Published attempts, expert review, exact certificates, and formal proofs are labeled separately." : "公开尝试、专家审核、精确证书与形式化证明分别标注。"}</p></div>
            <div className="frontier-news-timeline">
              {news.map((item, index) => <a href={item.link} target="_blank" rel="noreferrer" key={item.id} className={index === 0 ? "featured" : ""}><time>{item.date.replaceAll("-", ".")}</time><span>{english ? item.label : item.labelZh}</span><h3>{english ? item.title : item.titleZh}</h3><p>{english ? item.content : item.contentZh}</p><div className="frontier-news-meta"><small>{english ? item.statusLabel : item.statusLabelZh}</small><small>{item.source}</small><ArrowUpRight size={17} /></div></a>)}
            </div>
          </section>

          <div className="hero-case-grid" key={conjecture.id}>
            <div className="hero-case-copy">
              <span className="micro-label">{english ? conjecture.overview.eyebrow : conjecture.overview.eyebrowZh}</span>
              <h2>{english ? conjecture.title : conjecture.titleZh}</h2>
              <p>{english ? conjecture.overview.summary : conjecture.overview.summaryZh}</p>
              <p className="conjecture-status"><ShieldCheck size={17} /> {english ? conjecture.status : conjecture.statusZh}</p>
              <div className="hero-actions"><a className="button button-primary" href="#benchmark">{english ? conjecture.overview.primaryAction : conjecture.overview.primaryActionZh} <ArrowDown size={17} /></a><a className="button button-quiet" href="#verify">{english ? "Open verification contract" : "打开验证协议"} <ArrowUpRight size={17} /></a></div>
              <dl className="hero-stats" aria-label="Benchmark overview">
                <div><dt>{String(data.dataset.taskCount).padStart(2, "0")}</dt><dd>{english ? "problems" : "问题"}</dd></div>
                <div><dt>{String(data.dataset.modelCount).padStart(2, "0")}</dt><dd>{english ? "models" : "模型"}</dd></div>
                <div><dt>{data.dataset.resultCount}</dt><dd>{english ? "records" : "记录"}</dd></div>
                <div><dt>{String(data.aggregate.officialPasses).padStart(2, "0")}</dt><dd>{english ? "offline passes" : "离线通过"}</dd></div>
              </dl>
              <div className="data-provenance"><Database size={15} /><span>{conjecture.problemSource}</span><span>{conjecture.resultsPath}/</span></div>
            </div>
            <ConjectureVisual conjecture={conjecture} language={language} />
          </div>
        </section>

        <section className="statement-band" aria-label="Conjecture statement">
          <div className="section-shell statement-inner">
            <span className="section-index">00 / STATEMENT</span>
            <div className="statement-copy"><p>{english ? conjecture.statement.intro : conjecture.statement.introZh}</p><BlockMath>{conjecture.statement.formula}</BlockMath><MathText>{english ? conjecture.statement.explanation : conjecture.statement.explanationZh}</MathText></div>
            <div className="statement-note"><ShieldCheck size={21} /><MathText>{english ? conjecture.statement.note : conjecture.statement.noteZh}</MathText></div>
          </div>
        </section>

        <section className="atlas section-shell" id="atlas">
          <SectionLead index="01" eyebrow="MATHEMATICAL ATLAS" title={english ? conjecture.atlas.title : conjecture.atlas.titleZh} body={english ? conjecture.atlas.body : conjecture.atlas.bodyZh} />
          <div className="atlas-grid data-atlas-grid">
            <div className="timeline-panel"><h3>{english ? "Progress timeline" : "进展时间线"}</h3><ol className="timeline">{conjecture.atlas.events.map((event, index) => <li className={index === conjecture.atlas.events.length - 1 ? "timeline-current" : ""} key={`${event.year}-${event.title}`}><time>{event.year}</time><div><b>{english ? event.title : event.titleZh}</b><MathText>{english ? event.description : event.descriptionZh}</MathText><span className="source-links">{event.links.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{link.label} <ArrowUpRight size={13} /></a>)}</span></div></li>)}</ol></div>
            <AtlasFrontierPanel conjecture={conjecture} language={language} />
          </div>
        </section>

        <TaskSection data={data} content={conjecture.benchmark} conjectureId={conjecture.id} likes={community.taskLikes} likedTasks={community.likedTasks ?? []} onLike={likeTask} communityOnline={communityOnline} language={language} />
        <ResultsDashboard data={data} content={conjecture.evaluation} language={language} />
        <SymbolicLab conjecture={conjecture} language={language} />

        <CommunityBoard snapshot={community} online={communityOnline} apiUrl={communityApiUrl} refresh={refreshCommunity} getClientKey={getClientKey} language={language} conjectures={site.conjectures} activeConjectureId={conjecture.id} />
        <ReferencesSection conjecture={conjecture} language={language} />
        <GlobalTraffic traffic={community.traffic} online={communityOnline} language={language} />
      </main>

      <footer className="site-footer"><div><b>OPBench · OpenProblemBench</b><p>{english ? "A verifiable open-problem benchmark and discussion platform by Shanghai Artificial Intelligence Laboratory." : "上海人工智能实验室出品的开放问题可验证评测与讨论平台。"}</p></div><div><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a><a href="mailto:yufangchen@pjlab.org.cn">yufangchen@pjlab.org.cn</a></div></footer>
    </>
  );
}

function AtlasFrontierPanel({ conjecture, language }: { conjecture: ConjectureData; language: Language }) {
  const english = language === "en";

  if (conjecture.id === "jacobian_conjecture") {
    return (
      <aside className="atlas-side-card jacobian-frontier-card">
        <span>{english ? "CURRENT FRONTIER" : "当前前沿"}</span>
        <div className="known-map-head">
          <div>
            <span className="micro-label">FINITE CERTIFICATE</span>
            <h3>{english ? "The first known 3D construction" : "已知首个三维构造"}</h3>
          </div>
          <span className="verified-badge"><ShieldCheck size={15} />{english ? "FORMALLY VERIFIED" : "已形式化验证"}</span>
        </div>
        <p className="formula-intro">{english ? "Set" : "令"} <InlineMath>{"u=1+xy"}</InlineMath>. {english ? "Then" : "则"}</p>
        <BlockMath>{String.raw`\begin{aligned}
F_1&=u^3z+y^2u(4+3xy),\\
F_2&=y+3xu^2z+3xy^2(4+3xy),\\
F_3&=2x-3x^2y-x^3z.
\end{aligned}`}</BlockMath>
        <div className="certificate-row">
          <div><span>{english ? "LOCAL CERTIFICATE" : "局部证书"}</span><InlineMath>{String.raw`\det J_F=-2`}</InlineMath></div>
          <div><span>{english ? "DEGREE VECTOR" : "次数向量"}</span><InlineMath>{"(7,6,4)"}</InlineMath></div>
        </div>
        <div className="collision">
          <span>{english ? "GLOBAL CERTIFICATE" : "全局证书"}</span>
          <BlockMath>{String.raw`\begin{gathered}
F(0,0,-\tfrac14)=F(1,-\tfrac32,\tfrac{13}2)\\
=F(-1,\tfrac32,\tfrac{13}2)=(-\tfrac14,0,0).
\end{gathered}`}</BlockMath>
        </div>
        <p className="scope-note">{english ? "Adding identity coordinates extends this construction to every dimension d >= 3; dimension 2 remains open." : "补上恒等坐标即可将这一构造扩展到所有 d >= 3；二维情形仍未解决。"}</p>
      </aside>
    );
  }

  const frontier = conjecture.atlas.frontier;
  return (
    <aside className="atlas-side-card">
      <span>{english ? "CURRENT FRONTIER" : "当前前沿"}</span>
      <h3>{frontier ? (english ? frontier.title : frontier.titleZh) : (english ? conjecture.status : conjecture.statusZh)}</h3>
      <MathText>{frontier ? (english ? frontier.summary : frontier.summaryZh) : (english ? conjecture.visualization.caption : conjecture.visualization.captionZh)}</MathText>
      <BlockMath>{frontier?.formula ?? conjecture.visualization.example}</BlockMath>
      {frontier?.facts.length ? (
        <div className="atlas-frontier-facts">
          {frontier.facts.map((fact) => (
            <div key={fact.label}>
              <span>{english ? fact.label : fact.labelZh}</span>
              <MathText>{english ? fact.text : fact.textZh}</MathText>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function SectionLead({ index, eyebrow, title, body }: { index: string; eyebrow: string; title: string; body: string }) {
  return <div className="section-lead"><span className="section-index">{index} / {eyebrow}</span><h2>{title}</h2><p>{body}</p></div>;
}
