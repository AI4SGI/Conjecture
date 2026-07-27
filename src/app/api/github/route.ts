export const dynamic = "force-dynamic";

export async function GET() {
  const repository = process.env.GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "jacobian-frontier",
      },
      next: { revalidate: 900 },
    });
    if (!response.ok) {
      return Response.json({
        available: false,
        repository,
        url: `https://github.com/${repository}`,
      });
    }
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
    return Response.json({
      available: false,
      repository,
      url: `https://github.com/${repository}`,
    });
  }
}
