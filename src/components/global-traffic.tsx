"use client";

import World from "@svg-maps/world";
import { Globe2, MapPin } from "lucide-react";
import type { CommunitySnapshot, Language } from "../lib/types";

function countryFill(count: number, maximum: number) {
  if (!count) return "#ded8ca";
  const strength = maximum <= 1 ? 1 : Math.log(count + 1) / Math.log(maximum + 1);
  const lightness = 62 - strength * 34;
  return `hsl(18 72% ${lightness}%)`;
}

export function GlobalTraffic({
  traffic,
  online,
  language,
}: {
  traffic?: CommunitySnapshot["traffic"];
  online: boolean;
  language: Language;
}) {
  const english = language === "en";
  const countries = traffic?.countries ?? {};
  const maximum = Math.max(1, ...Object.values(countries));
  const byId = new Map(World.locations.map((location) => [location.id.toUpperCase(), location.name]));
  const leaders = Object.entries(countries)
    .filter(([code, count]) => code !== "ZZ" && count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

  return (
    <section className="global-traffic" id="global-reach">
      <div className="section-shell global-traffic-inner">
        <div className="global-traffic-copy">
          <span className="section-index">07 / GLOBAL REACH</span>
          <span className="traffic-kicker"><Globe2 size={17} /> {online ? (english ? "LIVE AGGREGATE" : "实时汇总") : (english ? "BACKEND OFFLINE" : "后端离线")}</span>
          <h2>{english ? "A growing, global research audience" : "持续增长的全球研究访问"}</h2>
          <p>
            {english
              ? "Cumulative visits are recorded by the first-party Cloudflare backend and aggregated only by country. Raw IP addresses are never stored or displayed."
              : "累计访问由自有 Cloudflare 后端记录，仅按国家聚合；原始 IP 地址不会被存储或展示。"}
          </p>
          <div className="traffic-total">
            <strong>{(traffic?.total ?? 0).toLocaleString()}</strong>
            <span>{english ? "cumulative visits" : "累计访问量"}</span>
          </div>
          {leaders.length ? (
            <ol className="traffic-leaders">
              {leaders.map(([code, count]) => (
                <li key={code}>
                  <span><MapPin size={13} /> {byId.get(code) ?? code}</span>
                  <b>{count.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="traffic-empty">{english ? "The first country-level visit will light up the map." : "首条国家级访问记录将点亮地图。"}</p>
          )}
        </div>
        <div className="traffic-map-panel">
          <svg viewBox={World.viewBox} role="img" aria-label={english ? "World map of cumulative visits by country" : "按国家显示累计访问的世界地图"}>
            {World.locations.map((location) => {
              const code = location.id.toUpperCase();
              const count = countries[code] ?? 0;
              return (
                <path key={location.id} d={location.path} fill={countryFill(count, maximum)} data-visits={count}>
                  <title>{`${location.name}: ${count.toLocaleString()}`}</title>
                </path>
              );
            })}
          </svg>
          <div className="traffic-map-legend">
            <span>{english ? "No visits" : "暂无访问"}</span>
            <i /><i /><i /><i />
            <span>{english ? "More visits" : "更多访问"}</span>
          </div>
          <p>
            {english ? "Map geometry" : "地图数据"}: <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/world" target="_blank" rel="noreferrer">SVG Maps / MapSVG · CC BY 4.0</a>
          </p>
        </div>
      </div>
    </section>
  );
}
