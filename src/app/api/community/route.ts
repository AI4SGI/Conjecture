import { getCloudflareContext } from "@opennextjs/cloudflare";

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
    const response = await stub.fetch(
      `https://community.internal/?sort=${url.searchParams.get("sort") ?? "recent"}`,
    );
    return new Response(response.body, response);
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  try {
    const stub = await communityStub();
    const body = await request.text();
    const response = await stub.fetch("https://community.internal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: request.headers.get("Authorization") ?? "",
      },
      body,
    });
    return new Response(response.body, response);
  } catch {
    return unavailable();
  }
}
