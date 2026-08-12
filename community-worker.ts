export { CommunityStore } from "./src/worker/community-store";
import {
  COMMUNITY_MAX_REQUEST_BYTES,
  communityRequestCountry,
  communityRequestFingerprint,
  communitySecurityHeaders,
} from "./src/worker/community-security";

interface CommunityWorkerEnv {
  COMMUNITY: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  COMMUNITY_FINGERPRINT_SALT?: string;
  GITHUB_REPOSITORY?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ai4sgi.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
];

function allowedOrigins(env: CommunityWorkerEnv) {
  return (env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS
  )
    .map((origin) => origin.trim().replace(/\/$/, "").toLowerCase())
    .filter(Boolean);
}

function corsOrigin(request: Request, env: CommunityWorkerEnv) {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "");
  if (!origin) return null;
  return allowedOrigins(env).includes(origin.toLowerCase()) ? origin : false;
}

function withCors(response: Response, origin: string | null) {
  const headers = communitySecurityHeaders(new Headers(response.headers));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function githubMetadata(request: Request, env: CommunityWorkerEnv) {
  const repository = env.GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    return Response.json({ available: false, url: "https://github.com" });
  }
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL("/api/github", request.url), { method: "GET" });
  const cached = await edgeCache.match(cacheKey);
  if (cached) return cached;
  let stars: number | undefined;
  let source = "github-api";
  try {
    const upstream = await fetch(`https://api.github.com/repos/${repository}`, {
      signal: AbortSignal.timeout(4_500),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "OPBench-community-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!upstream.ok) throw new Error(`github_http_${upstream.status}`);
    const data = await upstream.json() as {
      stargazers_count?: number;
      html_url?: string;
    };
    if (!Number.isFinite(data.stargazers_count)) throw new Error("github_invalid_response");
    stars = data.stargazers_count;
  } catch {
    try {
      const [owner, name] = repository.split("/").map(encodeURIComponent);
      const fallback = await fetch(`https://img.shields.io/github/stars/${owner}/${name}.json`, {
        signal: AbortSignal.timeout(4_500),
        headers: { "User-Agent": "OPBench-community-worker" },
      });
      if (!fallback.ok) throw new Error(`shields_http_${fallback.status}`);
      const badge = await fallback.json() as { value?: string | number; message?: string };
      const value = String(badge.value ?? badge.message ?? "").replaceAll(",", "").trim().toLowerCase();
      const match = value.match(/^(\d+(?:\.\d+)?)([km])?$/);
      if (!match) throw new Error("shields_invalid_response");
      stars = Math.round(Number(match[1]) * (match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1));
      source = "shields-github-cache";
    } catch {
      stars = undefined;
    }
  }
  if (stars !== undefined) {
    const response = Response.json({
      available: true,
      repository,
      stars,
      source,
      url: `https://github.com/${repository}`,
    }, {
      headers: { "Cache-Control": "public, max-age=900, s-maxage=900" },
    });
    await edgeCache.put(cacheKey, response.clone());
    return response;
  }
  return Response.json({
    available: false,
    repository,
    url: `https://github.com/${repository}`,
  }, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: CommunityWorkerEnv) {
    const origin = corsOrigin(request, env);
    if (origin === false) {
      return Response.json({ error: "origin_not_allowed" }, { status: 403 });
    }

    if (request.method === "OPTIONS") {
      const headers = new Headers({
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      });
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
      }
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return withCors(
        Response.json({ ok: true, service: "jacobian-community-api" }),
        origin,
      );
    }
    if (url.pathname === "/api/github" && request.method === "GET") {
      return withCors(await githubMetadata(request, env), origin);
    }
    if (url.pathname !== "/api/community") {
      return withCors(
        Response.json({ error: "not_found" }, { status: 404 }),
        origin,
      );
    }

    let requestBody: string | undefined;
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
        return withCors(
          Response.json({ error: "unsupported_media_type" }, { status: 415 }),
          origin,
        );
      }
      const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
      if (declaredLength > COMMUNITY_MAX_REQUEST_BYTES) {
        return withCors(
          Response.json({ error: "payload_too_large" }, { status: 413 }),
          origin,
        );
      }
      requestBody = await request.text();
      if (new TextEncoder().encode(requestBody).byteLength > COMMUNITY_MAX_REQUEST_BYTES) {
        return withCors(
          Response.json({ error: "payload_too_large" }, { status: 413 }),
          origin,
        );
      }
    }

    const id = env.COMMUNITY.idFromName("jacobian-frontier-community-v1");
    const stub = env.COMMUNITY.get(id);
    const target = new URL("https://community.internal/");
    target.search = url.search;

    const headers = new Headers();
    const contentType = request.headers.get("Content-Type");
    const authorization = request.headers.get("Authorization");
    if (contentType) headers.set("Content-Type", contentType);
    if (authorization) headers.set("Authorization", authorization);
    headers.set(
      "X-Community-Fingerprint",
      await communityRequestFingerprint(request, env.COMMUNITY_FINGERPRINT_SALT),
    );
    headers.set("X-Community-Country", communityRequestCountry(request));

    const response = await stub.fetch(target, {
      method: request.method,
      headers,
      body: requestBody,
    });
    return withCors(response, origin);
  },
} satisfies ExportedHandler<CommunityWorkerEnv>;
