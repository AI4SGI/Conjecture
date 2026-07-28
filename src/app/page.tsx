import benchmark from "../data/benchmark.json";
import frontierNews from "../data/frontier-news.json";
import { ResearchSite } from "../components/research-site";
import type { BenchmarkData, FrontierNewsItem } from "../lib/types";

export default function Home() {
  return (
    <ResearchSite
      data={benchmark as BenchmarkData}
      news={frontierNews as FrontierNewsItem[]}
    />
  );
}
