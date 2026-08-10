import site from "../data/site.json";
import frontierNews from "../data/frontier-news.json";
import { ResearchSite } from "../components/research-site";
import type { FrontierNewsItem, SiteData } from "../lib/types";

export default function Home() {
  return (
    <ResearchSite
      site={site as SiteData}
      news={frontierNews as FrontierNewsItem[]}
    />
  );
}
