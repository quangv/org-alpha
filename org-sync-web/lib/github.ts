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

const treeCache = new Map<string, string[]>();

async function fetchTree(token: string, owner: string, repo: string): Promise<string[]> {
  const key = `${owner}/${repo}`;
  if (treeCache.has(key)) return treeCache.get(key)!;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw Object.assign(new Error("Failed to fetch tree"), { status: res.status });
  const data = await res.json();
  const paths: string[] = (data.tree as any[])
    .filter((item) => item.type === "blob")
    .map((item) => item.path as string);
  treeCache.set(key, paths);
  return paths;
}

// Search is filename-only for now; full-content search is a possible future addition.
export async function searchCode(
  token: string,
  owner: string,
  repo: string,
  query: string
): Promise<SearchResult[]> {
  const paths = await fetchTree(token, owner, repo);
  const lower = query.toLowerCase();
  return paths
    .filter((p) => p.toLowerCase().includes(lower))
    .slice(0, 30)
    .map((path) => ({ path, fragment: "" }));
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
