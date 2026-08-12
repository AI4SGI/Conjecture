export const dynamic = "force-dynamic";

export async function GET() {
  const repository = process.env.GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      signal: AbortSignal.timeout(4_500),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "jacobian-frontier",
      },
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`github_http_${response.status}`);
    const data = (await response.json()) as {
      stargazers_count: number;
      html_url: string;
      visibility?: string;
    };
    return Response.json({
      available: true,
      repository,
      stars: data.stargazers_count,
      url: data.html_url,
      visibility: data.visibility,
    });
  } catch {
    try {
      const [owner, name] = repository.split("/").map(encodeURIComponent);
      const response = await fetch(`https://img.shields.io/github/stars/${owner}/${name}.json`, {
        signal: AbortSignal.timeout(4_500),
        headers: { "User-Agent": "OPBench" },
        next: { revalidate: 900 },
      });
      if (!response.ok) throw new Error(`shields_http_${response.status}`);
      const badge = (await response.json()) as { value?: string | number; message?: string };
      const value = String(badge.value ?? badge.message ?? "").replaceAll(",", "").trim().toLowerCase();
      const match = value.match(/^(\d+(?:\.\d+)?)([km])?$/);
      if (!match) throw new Error("shields_invalid_response");
      const stars = Math.round(Number(match[1]) * (match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1));
      return Response.json({
        available: true,
        repository,
        stars,
        source: "shields-github-cache",
        url: `https://github.com/${repository}`,
      });
    } catch {
      return Response.json({
        available: false,
        repository,
        url: `https://github.com/${repository}`,
      });
    }
  }
}
