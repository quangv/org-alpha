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
): Promise<{ content: string; sha: string; base64: string }> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  if (Array.isArray(data) || data.type !== "file") throw new Error("Not a file");
  const base64 = data.content.replace(/\n/g, "");
  const content = Buffer.from(base64, "base64").toString("utf-8");
  return { content, sha: data.sha, base64 };
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

export async function createFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string
): Promise<void> {
  const cleanPath = path.replace(/^\//, "");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: "" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg: string = data.message ?? `HTTP ${res.status}`;
    if (msg.toLowerCase().includes("sha")) throw new Error("A file already exists at that path.");
    throw new Error(msg);
  }
}

export async function deleteFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  message: string
): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}

export async function trashFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<void> {
  const { base64, sha } = await readFile(token, owner, repo, path);
  const trashPath = `~trash/${path}`;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${trashPath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: `trash: ${path}`, content: base64 }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  await deleteFile(token, owner, repo, path, sha, `trash: remove ${path}`);
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
