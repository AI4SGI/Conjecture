import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repository =
  process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "Conjecture";
const pagesBasePath = isGitHubPages ? `/${repository}` : "";

if (process.env.NODE_ENV === "development" && !isGitHubPages) {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? "export" : "standalone",
  basePath: pagesBasePath,
  trailingSlash: isGitHubPages,
  images: {
    unoptimized: isGitHubPages,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
