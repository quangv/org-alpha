import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const token = req.headers.get("x-github-token");

  if (!q || !token) {
    return NextResponse.json({ error: "Missing q or token" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=30`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  const data = await res.json();
  console.log("GitHub search status:", res.status, "total_count:", data.total_count, "items:", data.items?.length, "incomplete:", data.incomplete_results);
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  return NextResponse.json(data);
}
