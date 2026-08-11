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
