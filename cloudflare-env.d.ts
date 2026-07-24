/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS: Fetcher;
  COMMUNITY: DurableObjectNamespace;
  COMMUNITY_ADMIN_KEY?: string;
  GITHUB_REPOSITORY?: string;
}
