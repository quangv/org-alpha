import { Octokit } from "@octokit/rest";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export async function listFiles(
  token: string,
  owner: string,
  repo: string,
  path = ""
): Promise<FileEntry[]> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  if (!Array.isArray(data)) return [];
  return data
    .filter((e) => !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: e.path, type: e.type as "file" | "dir" }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}

export async function readFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ content: string; sha: string }> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  if (Array.isArray(data) || data.type !== "file") throw new Error("Not a file");
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

export interface SearchResult {
  path: string;
  fragment: string;
}

export async function searchCode(
  token: string,
  owner: string,
  repo: string,
  query: string
): Promise<SearchResult[]> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.search.code({
    q: `${query} repo:${owner}/${repo}`,
    per_page: 30,
    mediaType: { previews: ["text-match"] },
  } as any);
  return (data.items as any[]).map((item) => ({
    path: item.path as string,
    fragment: (item.text_matches?.[0]?.fragment as string) ?? "",
  }));
}

export async function writeFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  message: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
  });
}
