import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  COMMUNITY_MAX_REQUEST_BYTES,
  communityRequestCountry,
  communityRequestFingerprint,
} from "../../../worker/community-security";

export const dynamic = "force-dynamic";

async function communityStub() {
  const { env } = getCloudflareContext();
  const id = env.COMMUNITY.idFromName("jacobian-frontier-community-v1");
  return env.COMMUNITY.get(id);
}

function unavailable() {
  return Response.json(
    {
      taskLikes: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
      messages: [],
      pendingCount: 0,
      unavailable: true,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    const stub = await communityStub();
    const url = new URL(request.url);
    const target = new URL("https://community.internal/");
    target.search = url.search;
    const response = await stub.fetch(target);
    return new Response(response.body, response);
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ error: "unsupported_media_type" }, { status: 415 });
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > COMMUNITY_MAX_REQUEST_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    const { env } = getCloudflareContext();
    const stub = await communityStub();
    const response = await stub.fetch("https://community.internal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: request.headers.get("Authorization") ?? "",
        "X-Community-Fingerprint": await communityRequestFingerprint(
          request,
          env.COMMUNITY_FINGERPRINT_SALT,
        ),
        "X-Community-Country": communityRequestCountry(request),
      },
      body,
    });
    return new Response(response.body, response);
  } catch {
    return unavailable();
  }
}
