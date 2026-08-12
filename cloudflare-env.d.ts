/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS: Fetcher;
  COMMUNITY: DurableObjectNamespace;
  COMMUNITY_ADMIN_KEY?: string;
  COMMUNITY_AI_API_KEY?: string;
  COMMUNITY_AI_BASE_URL?: string;
  COMMUNITY_AI_MODEL_NAME?: string;
  COMMUNITY_AI_HOST_OVERRIDES?: string;
  COMMUNITY_ALLOWED_TARGETS?: string;
  COMMUNITY_FINGERPRINT_SALT?: string;
  GITHUB_REPOSITORY?: string;
}
