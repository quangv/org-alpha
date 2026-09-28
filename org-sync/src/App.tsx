import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface SyncResult {
  status: "ok" | "error";
  message: string;
}

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    invoke<string | null>("get_watch_folder").then(setFolder);

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
      await invoke("set_watch_folder", { folder: path });
      setFolder(path);
      setError(null);
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

  return (
    <div className="app">
      <h1>org-sync</h1>

      <div className="section">
        <label>Watched Folder</label>
        <div className="folder-row">
          <span className="folder-path">{folder ?? "None selected"}</span>
          <button onClick={pickFolder}>Choose</button>
        </div>
      </div>

      {folder && (
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
