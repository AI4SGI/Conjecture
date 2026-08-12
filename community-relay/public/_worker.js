const FORWARDED_PATHS = new Set([
  "/api/community",
  "/api/github",
  "/health",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      url.pathname = "/health";
      return env.COMMUNITY_SERVICE.fetch(new Request(url, request));
    }
    if (!FORWARDED_PATHS.has(url.pathname)) {
      return Response.json(
        { error: "not_found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    return env.COMMUNITY_SERVICE.fetch(request);
  },
};
