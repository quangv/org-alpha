import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Config {
  folder: string | null;
  github_repo: string | null;
  github_token: string | null;
}

interface SyncResult {
  status: "ok" | "error";
  message: string;
}

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<string>("");
  const [repoInput, setRepoInput] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [repoSaved, setRepoSaved] = useState(false);

  useEffect(() => {
    invoke<Config>("get_config").then((config) => {
      setFolder(config.folder);
      const repo = config.github_repo ?? "";
      setGithubRepo(repo);
      setRepoInput(repo);
      setTokenInput(config.github_token ?? "");
    });

    const unlisten = listen<SyncResult>("sync-result", (event) => {
      setSyncing(false);
      if (event.payload.status === "ok") {
        setLastSync(event.payload.message);
        setError(null);
      } else {
        setError(event.payload.message);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    try {
      await invoke("set_folder", { folder: path });
      setFolder(path);
      setError(null);
    } catch (e) {
      setError(e as string);
    }
  }

  async function saveRepo() {
    const url = repoInput.trim();
    if (!url.startsWith("https://")) {
      setError("Use an HTTPS URL, e.g. https://github.com/user/repo.git");
      return;
    }
    try {
      await invoke("set_github_repo", { repo: url });
      setGithubRepo(url);
      setRepoSaved(true);
      setError(null);
      setTimeout(() => setRepoSaved(false), 2000);
    } catch (e) {
      setError(e as string);
    }
  }

  async function saveToken() {
    try {
      await invoke("set_github_token", { token: tokenInput.trim() });
      setTokenSaved(true);
      setError(null);
      setTimeout(() => setTokenSaved(false), 2000);
    } catch (e) {
      setError(e as string);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await invoke<string>("trigger_sync");
      setLastSync(result);
      setError(null);
    } catch (e) {
      setError(e as string);
    } finally {
      setSyncing(false);
    }
  }

  const repoChanged = repoInput.trim() !== githubRepo;
  const configured = !!folder && !!githubRepo;

  return (
    <div className="app">
      <h1>org-sync</h1>

      <div className="section">
        <label>GitHub Repo</label>
        <div className="repo-row">
          <input
            className="repo-input"
            type="text"
            placeholder="https://github.com/user/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && repoChanged && saveRepo()}
          />
          <button onClick={saveRepo} disabled={!repoInput.trim() || !repoChanged}>
            {repoSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="section">
        <label>
          GitHub Token{" "}
          <a
            href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="help-link"
          >
            (how to create one)
          </a>
        </label>
        <div className="repo-row">
          <input
            className="repo-input"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveToken()}
          />
          <button onClick={saveToken} disabled={!tokenInput.trim()}>
            {tokenSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="section">
        <label>Local Folder</label>
        <div className="folder-row">
          <span className="folder-path">{folder ?? "None selected"}</span>
          <button onClick={pickFolder} disabled={!githubRepo}>Choose</button>
        </div>
      </div>

      {configured && (
        <div className="section">
          <button className="sync-btn" onClick={syncNow} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      )}

      {lastSync && (
        <div className="section status ok">
          {lastSync === "up to date" ? "Up to date" : `Last sync: ${lastSync}`}
        </div>
      )}

      {error && (
        <div className="section status error">
          <div className="error-row">
            <pre className="error-text">{error}</pre>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(error)}>Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
