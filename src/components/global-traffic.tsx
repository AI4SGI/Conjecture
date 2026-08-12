"use client";

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, GeometryCollection } from "geojson";
import { Globe2, MapPin } from "lucide-react";
import { feature } from "topojson-client";
import type { GeometryCollection as TopologyGeometryCollection, Objects, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { ISO_NUMERIC_TO_ALPHA2 } from "../data/iso-numeric-to-alpha2";
import type { CommunitySnapshot, Language } from "../lib/types";

interface CountryProperties {
  name?: string;
}

type AtlasObjects = Objects<CountryProperties> & {
  countries: TopologyGeometryCollection<CountryProperties>;
};

interface CountryShape {
  code: string;
  name: string;
  path: string;
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 555;
const topology = atlas as unknown as Topology<AtlasObjects>;
const sourceFeatures = feature(topology, topology.objects.countries) as FeatureCollection<Geometry, CountryProperties>;
const china = sourceFeatures.features.find((item) => String(item.id).padStart(3, "0") === "156");
const taiwan = sourceFeatures.features.find((item) => String(item.id).padStart(3, "0") === "158");
const combinedChina: Feature<GeometryCollection, CountryProperties> | undefined = china && taiwan
  ? {
      type: "Feature",
      id: "156",
      properties: { name: "China" },
      geometry: {
        type: "GeometryCollection",
        geometries: [china.geometry, taiwan.geometry],
      },
    }
  : undefined;
const mapFeatures = sourceFeatures.features
  .filter((item) => String(item.id).padStart(3, "0") !== "158")
  .map((item) => String(item.id).padStart(3, "0") === "156" && combinedChina ? combinedChina : item);
const projection = geoNaturalEarth1().fitExtent(
  [[12, 12], [MAP_WIDTH - 12, MAP_HEIGHT - 12]],
  { type: "Sphere" },
);
const pathGenerator = geoPath(projection);
const COUNTRY_SHAPES: CountryShape[] = mapFeatures.map((item) => {
  const numeric = String(item.id ?? "").padStart(3, "0");
  const sourceCode = ISO_NUMERIC_TO_ALPHA2[numeric] ?? numeric;
  const code = sourceCode === "TW" ? "CN" : sourceCode;
  return {
    code,
    name: code === "CN" ? "China" : item.properties?.name ?? code,
    path: pathGenerator(item) ?? "",
  };
});
const SPHERE_PATH = pathGenerator({ type: "Sphere" }) ?? "";
const GRATICULE_PATH = pathGenerator(geoGraticule10()) ?? "";

function countryFill(count: number, maximum: number) {
  if (!count) return "#ded8ca";
  const strength = maximum <= 1 ? 1 : Math.log(count + 1) / Math.log(maximum + 1);
  const lightness = 62 - strength * 34;
  return `hsl(18 72% ${lightness}%)`;
}

function normalizedCountries(source: Record<string, number>) {
  const countries = { ...source };
  if (countries.TW) {
    countries.CN = (countries.CN ?? 0) + countries.TW;
    delete countries.TW;
  }
  return countries;
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
  const countries = normalizedCountries(traffic?.countries ?? {});
  const maximum = Math.max(1, ...Object.values(countries));
  const regionNames = new Intl.DisplayNames([english ? "en" : "zh-CN"], { type: "region" });
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
                  <span><MapPin size={13} /> {regionNames.of(code) ?? code}</span>
                  <b>{count.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="traffic-empty">{english ? "The first country-level visit will light up the map." : "首条国家级访问记录将点亮地图。"}</p>
          )}
        </div>
        <div className="traffic-map-panel">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label={english ? "World map of cumulative visits by country" : "按国家显示累计访问的世界地图"}>
            <path className="traffic-map-sphere" d={SPHERE_PATH} />
            <path className="traffic-map-graticule" d={GRATICULE_PATH} />
            <g className="traffic-map-countries">
              {COUNTRY_SHAPES.map((country, index) => {
                const count = countries[country.code] ?? 0;
                return (
                  <path key={`${country.code}-${index}`} d={country.path} fill={countryFill(count, maximum)} data-country={country.code} data-visits={count}>
                    <title>{`${country.name}: ${count.toLocaleString()}`}</title>
                  </path>
                );
              })}
            </g>
          </svg>
          <div className="traffic-map-legend">
            <span>{english ? "No visits" : "暂无访问"}</span>
            <i /><i /><i /><i />
            <span>{english ? "More visits" : "更多访问"}</span>
          </div>
          <p>
            {english ? "Map geometry" : "地图数据"}: <a href="https://github.com/topojson/world-atlas" target="_blank" rel="noreferrer">Natural Earth / World Atlas · public domain</a>
          </p>
        </div>
      </div>
    </section>
  );
}
