import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Config {
  folder: string | null;
  github_repo: string | null;
}

interface SyncResult {
  status: "ok" | "error";
  message: string;
}

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<string>("");
  const [repoInput, setRepoInput] = useState<string>("");
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
    try {
      await invoke("set_github_repo", { repo: repoInput.trim() });
      setGithubRepo(repoInput.trim());
      setRepoSaved(true);
      setError(null);
      setTimeout(() => setRepoSaved(false), 2000);
    } catch (e) {
      setError(e as string);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await invoke("trigger_sync");
      const now = new Date().toLocaleString();
      setLastSync(`sync: ${now}`);
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
            placeholder="https://github.com/user/repo.git"
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
          Last sync: {lastSync}
        </div>
      )}

      {error && (
        <div className="section status error">
          Error: {error}
        </div>
      )}
    </div>
  );
}

export default App;
