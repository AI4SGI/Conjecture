import benchmark from "../data/benchmark.json";
import { ResearchSite } from "../components/research-site";
import type { BenchmarkData } from "../lib/types";

export default function Home() {
  return <ResearchSite data={benchmark as BenchmarkData} />;
}
