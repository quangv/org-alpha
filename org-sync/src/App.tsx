import { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { search, getSearchQuery, searchPanelOpen } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { marked } from "marked";
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

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

// --- File Tree ---

interface NewFileInputRowProps {
  depth: number;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function NewFileInputRow({ depth, value, onChange, onConfirm, onCancel }: NewFileInputRowProps) {
  return (
    <div className="tree-item new-file-item" style={{ paddingLeft: 12 + depth * 14 }}>
      <span className="tree-icon file-icon">·</span>
      <input
        className="new-file-input"
        placeholder="filename.md"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
    </div>
  );
}

interface TreeSharedProps {
  selectedPath: string | null;
  onSelect: (path: string, isDir: boolean) => void;
  onFolderSelect: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  creatingInPath: string | null;
  newFileName: string;
  onNewFileNameChange: (v: string) => void;
  onConfirmNewFile: () => void;
  onCancelNewFile: () => void;
  refreshKey: number;
  autoExpandTo: string | null;
}

interface TreeNodeProps extends TreeSharedProps {
  entry: DirEntry;
  depth: number;
}

function TreeNode({ entry, depth, selectedPath, onSelect, onFolderSelect, onNewFile, creatingInPath, newFileName, onNewFileNameChange, onConfirmNewFile, onCancelNewFile, refreshKey, autoExpandTo }: TreeNodeProps) {
  const isCreatingHere = creatingInPath === entry.path;
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);

  useEffect(() => {
    if (isCreatingHere && !expanded) {
      invoke<DirEntry[]>("read_dir", { path: entry.path }).then((kids) => {
        setChildren(kids);
        setExpanded(true);
      });
    }
  }, [isCreatingHere]);

  useEffect(() => {
    if (expanded) {
      invoke<DirEntry[]>("read_dir", { path: entry.path }).then(setChildren);
    }
  }, [refreshKey]);

  // Auto-expand when we're an ancestor of the target path
  useEffect(() => {
    if (entry.is_dir && autoExpandTo && autoExpandTo.startsWith(entry.path + "/") && !expanded) {
      invoke<DirEntry[]>("read_dir", { path: entry.path }).then((kids) => {
        setChildren(kids);
        setExpanded(true);
      });
    }
  }, [autoExpandTo]);

  async function expand() {
    if (expanded) return;
    const kids = await invoke<DirEntry[]>("read_dir", { path: entry.path });
    setChildren(kids);
    setExpanded(true);
  }

  async function toggleCollapse(e: React.MouseEvent) {
    e.stopPropagation();
    if (!expanded) {
      await expand();
    } else {
      setExpanded(false);
    }
  }

  const isSelected = selectedPath === entry.path;
  const shared: TreeSharedProps = { selectedPath, onSelect, onFolderSelect, onNewFile, creatingInPath, newFileName, onNewFileNameChange, onConfirmNewFile, onCancelNewFile, refreshKey, autoExpandTo };

  return (
    <div>
      <div
        className={`tree-item${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => {
          if (entry.is_dir) {
            expand();
            onFolderSelect(entry.path);
          } else {
            onSelect(entry.path, false);
          }
        }}
      >
        {entry.is_dir ? (
          <span className="tree-icon" onClick={toggleCollapse}>{expanded ? "▾" : "▸"}</span>
        ) : (
          <span className="tree-icon file-icon">·</span>
        )}
        <span className="tree-name">{entry.name}</span>
        {entry.is_dir && (
          <button
            className="tree-new-file-btn"
            title="New file here"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); onNewFile(entry.path); }}
          >+</button>
        )}
      </div>
      {entry.is_dir && expanded && (
        <>
          {children.map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} {...shared} />
          ))}
          {isCreatingHere && (
            <NewFileInputRow
              depth={depth + 1}
              value={newFileName}
              onChange={onNewFileNameChange}
              onConfirm={onConfirmNewFile}
              onCancel={onCancelNewFile}
            />
          )}
        </>
      )}
    </div>
  );
}

interface FileTreeProps extends TreeSharedProps {
  rootPath: string;
}

function FileTree({ rootPath, ...shared }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);

  useEffect(() => {
    invoke<DirEntry[]>("read_dir", { path: rootPath }).then(setEntries);
  }, [rootPath, shared.refreshKey]);

  return (
    <div className="file-tree">
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={0} {...shared} />
      ))}

      {shared.creatingInPath === rootPath && (
        <NewFileInputRow
          depth={0}
          value={shared.newFileName}
          onChange={shared.onNewFileNameChange}
          onConfirm={shared.onConfirmNewFile}
          onCancel={shared.onCancelNewFile}
        />
      )}
    </div>
  );
}

// --- Markdown Editor ---

const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

interface MarkdownEditorHandle { print: () => void; }

const MarkdownEditor = forwardRef<MarkdownEditorHandle, { path: string; synced: boolean }>(function MarkdownEditor({ path, synced }, ref) {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const matchCounterRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    invoke<string>("read_file", { path }).then((c) => {
      setContent(c);
      setSaved(true);
    });
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [path]);

  const handleChange = useCallback((val: string) => {
    setContent(val);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await invoke("write_file", { path, content: val });
      setSaved(true);
    }, 800);
  }, [path]);

  const handleUpdate = useCallback((update: ViewUpdate) => {
    const panelEl = editorRef.current?.editor?.querySelector(".cm-panel.cm-search");
    if (!searchPanelOpen(update.state) || !panelEl) {
      matchCounterRef.current = null;
      return;
    }

    // Ensure our counter span exists inside the panel
    let counter = panelEl.querySelector<HTMLSpanElement>(".cm-search-count");
    if (!counter) {
      counter = document.createElement("span");
      counter.className = "cm-search-count";
      panelEl.appendChild(counter);
      matchCounterRef.current = counter;
    }

    const query = getSearchQuery(update.state);
    const searchStr = query.search;
    if (!searchStr) { counter.textContent = ""; return; }

    const docStr = update.state.doc.toString();
    const q = query.caseSensitive ? searchStr : searchStr.toLowerCase();
    const hay = query.caseSensitive ? docStr : docStr.toLowerCase();

    const positions: number[] = [];
    let pos = 0;
    while (pos < hay.length) {
      const idx = hay.indexOf(q, pos);
      if (idx === -1) break;
      positions.push(idx);
      pos = idx + 1;
    }

    const sel = update.state.selection.main;
    const ci = positions.findIndex(p => p === sel.from);
    if (positions.length === 0) {
      counter.textContent = "No results";
    } else if (ci >= 0) {
      counter.textContent = `${ci + 1} / ${positions.length}`;
    } else {
      counter.textContent = `${positions.length} matches`;
    }
  }, []);

  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(() => [markdown(), search()], []);
  const filename = path.split("/").pop() ?? path;

  const previewHtml = useMemo(() => showPreview ? marked(content) as string : "", [content, showPreview]);

  useImperativeHandle(ref, () => ({ print: handlePrint }));

  function handlePrint() {
    const body = marked(content) as string;
    const html = `<!DOCTYPE html><html><head><title>${filename}</title><style>
      body { font-family: Georgia, serif; max-width: 740px; margin: 40px auto; padding: 0 24px; font-size: 15px; line-height: 1.7; color: #111; }
      h1,h2,h3,h4,h5,h6 { margin: 1.4em 0 0.4em; font-weight: 600; line-height: 1.25; }
      h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
      p { margin: 0.8em 0; }
      pre { background: #f6f6f6; border-radius: 4px; padding: 12px 16px; font-size: 13px; }
      code { font-family: monospace; font-size: 0.9em; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
      pre code { background: none; padding: 0; }
      blockquote { border-left: 3px solid #ccc; margin: 0; padding: 0 16px; color: #555; }
      img { max-width: 100%; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; }
      hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
      ul, ol { padding-left: 1.5em; margin: 0.6em 0; }
      a { color: #396cd8; }
    </style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`;
    invoke("print_html", { html });
  }

  return (
    <div className="editor-pane">
      <div className="editor-header">
        <span className="editor-filename">{filename}</span>
        <div className="editor-header-right">
          {synced && <span className="sync-indicator">synced</span>}
          <span className={`save-indicator${saved ? " saved" : ""}`}>
            {saved ? "saved" : "saving…"}
          </span>
          <button
            className={`icon-btn preview-toggle${showPreview ? " active" : ""}`}
            title={showPreview ? "Hide preview" : "Show preview"}
            onClick={() => setShowPreview((v) => !v)}
          >⊞</button>
        </div>
      </div>
      <div className={`editor-body${showPreview ? " split" : ""}`}>
        <CodeMirror
          ref={editorRef}
          className="editor-textarea"
          value={content}
          onChange={handleChange}
          onUpdate={handleUpdate}
          extensions={extensions}
          theme={isDark ? oneDark : "light"}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        />
        {showPreview && (
          <div ref={previewRef} className="preview-pane" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        )}
      </div>
    </div>
  );
});

// --- Settings Panel ---

interface SettingsProps {
  config: Config;
  onClose: () => void;
  onFolderChange: (f: string) => void;
}

function SettingsPanel({ config, onClose, onFolderChange }: SettingsProps) {
  const [repoInput, setRepoInput] = useState(config.github_repo ?? "");
  const [githubRepo, setGithubRepo] = useState(config.github_repo ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenExists, setTokenExists] = useState(!!config.github_token);
  const [replacingToken, setReplacingToken] = useState(false);
  const [repoSaved, setRepoSaved] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    try {
      await invoke("set_folder", { folder: path });
      onFolderChange(path);
      setError(null);
    } catch (e) {
      setError(e as string);
    }
  }

  async function saveRepo() {
    const url = repoInput.trim();
    if (!url.startsWith("https://")) {
      setError("Use an HTTPS URL, e.g. https://github.com/user/repo");
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
      setTokenExists(true);
      setReplacingToken(false);
      setTokenInput("");
      setTokenSaved(true);
      setError(null);
      setTimeout(() => setTokenSaved(false), 2000);
    } catch (e) {
      setError(e as string);
    }
  }

  const repoChanged = repoInput.trim() !== githubRepo;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

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
          {tokenExists && !replacingToken ? (
            <div className="repo-row">
              <span className="token-saved-label">{tokenSaved ? "Saved!" : "Token saved"}</span>
              <button onClick={() => setReplacingToken(true)}>Replace</button>
            </div>
          ) : (
            <div className="repo-row">
              <input
                className="repo-input"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveToken()}
                autoFocus={replacingToken}
              />
              <button onClick={saveToken} disabled={!tokenInput.trim()}>Save</button>
              {replacingToken && (
                <button onClick={() => { setReplacingToken(false); setTokenInput(""); }}>Cancel</button>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <label>Local Folder</label>
          <div className="folder-row">
            <span className="folder-path">{config.folder ?? "None selected"}</span>
            <button onClick={pickFolder}>Choose</button>
          </div>
        </div>

        {error && (
          <div className="section status error">
            <pre className="error-text">{error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Help Modal ---

function ErrorToast({ msg }: { msg: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = msg.trim().split("\n");
  const summary = lines[0].length > 60 ? lines[0].slice(0, 57) + "…" : lines[0];
  const hasDetails = lines.length > 1 || lines[0].length > 60;

  return (
    <div className="toast error">
      <div className="toast-body">
        <span>{expanded ? msg : summary}</span>
        {hasDetails && (
          <button className="toast-details-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Less" : "Details"}
          </button>
        )}
      </div>
      <button
        className="toast-copy-btn"
        onClick={() => navigator.clipboard.writeText(msg)}
        title="Copy"
      >
        Copy
      </button>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Help</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="help-content">
          <div className="help-item">
            <strong>Saved</strong>
            <p>Your file has been written to disk. Happens automatically ~800ms after you stop typing.</p>
          </div>
          <div className="help-item">
            <strong>Synced (↑ toast)</strong>
            <p>Your changes have been committed and pushed to GitHub. Triggered automatically when files change, or manually with the ↑ button.</p>
          </div>
          <div className="help-item">
            <strong>Opening files</strong>
            <p>Markdown files (.md) open in the editor. All other files open in their default macOS app.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main App ---

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [config, setConfig] = useState<Config>({ folder: null, github_repo: null, github_token: null });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [autoExpandTo, setAutoExpandTo] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "ok" | "error"; msg: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const editorHandle = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    invoke<Config>("get_config").then((c) => {
      setConfig(c);
      setFolder(c.folder);
      if (!c.folder || !c.github_repo) {
        setShowSettings(true);
      } else {
        const last = localStorage.getItem(`lastOpenFile:${c.folder}`);
        if (last) { setSelectedPath(last); setAutoExpandTo(last); }
      }
    });

    const unlisten = listen<SyncResult>("sync-result", (event) => {
      setSyncing(false);
      if (event.payload.status === "error" || event.payload.message !== "up to date") {
        setSyncStatus({ type: event.payload.status, msg: event.payload.message });
        setTimeout(() => setSyncStatus(null), event.payload.status === "error" ? 12000 : 4000);
      }
    });

    const unlistenPrint = listen("print", () => {
      editorHandle.current?.print();
    });

    return () => { unlisten.then((f) => f()); unlistenPrint.then((f) => f()); };
  }, []);

  function storeLastOpen(filePath: string) {
    if (!folder) return;
    const folderDepth = folder.split("/").length;
    const parts = filePath.split("/");
    // store for root folder and every intermediate subfolder
    for (let i = folderDepth; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join("/");
      if (ancestor) localStorage.setItem(`lastOpenFile:${ancestor}`, filePath);
    }
  }

  async function handleSelect(path: string, _isDir: boolean) {
    const isMarkdown = path.endsWith(".md") || path.endsWith(".markdown");
    if (isMarkdown) {
      setSelectedPath(path);
      setAutoExpandTo(null);
      storeLastOpen(path);
    } else {
      try {
        await invoke("open_native", { path });
      } catch (e) {
        const msg = `Could not open file: ${e}`;
        setSyncStatus({ type: "error", msg });
        setTimeout(() => setSyncStatus(null), 12000);
      }
    }
  }

  function handleFolderSelect(folderPath: string) {
    const last = localStorage.getItem(`lastOpenFile:${folderPath}`);
    if (last) { setSelectedPath(last); setAutoExpandTo(last); }
  }

  function startCreatingFile(parentPath?: string) {
    setNewFileName("");
    setCreatingInPath(parentPath ?? folder);
  }

  async function confirmNewFile() {
    if (!creatingInPath || !newFileName.trim()) {
      setCreatingInPath(null);
      return;
    }
    let name = newFileName.trim();
    if (!name.endsWith(".md")) name += ".md";
    const path = `${creatingInPath}/${name}`;
    try {
      await invoke("create_file", { path });
      setTreeRefreshKey((k) => k + 1);
      setSelectedPath(path);
    } catch (e) {
      setSyncStatus({ type: "error", msg: e as string });
      setTimeout(() => setSyncStatus(null), 12000);
    }
    setCreatingInPath(null);
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await invoke<string>("trigger_sync");
      if (result !== "up to date") {
        setSyncStatus({ type: "ok", msg: result });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } catch (e) {
      setSyncStatus({ type: "error", msg: e as string });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="layout">
      {folder ? (
        <>
          <div className="sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">{folder.split("/").pop()}</span>
              <div className="sidebar-actions">
                <button className="icon-btn" title="New file" onClick={() => startCreatingFile()}>+</button>
                <button
                  className="icon-btn"
                  title="Sync now"
                  onClick={syncNow}
                  disabled={syncing}
                >
                  {syncing ? "⟳" : "↑"}
                </button>
                <button className="icon-btn" title="Help" onClick={() => setShowHelp(true)}>?</button>
                <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>⚙</button>
              </div>
            </div>
            <FileTree
              rootPath={folder}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onFolderSelect={handleFolderSelect}
              onNewFile={startCreatingFile}
              creatingInPath={creatingInPath}
              newFileName={newFileName}
              onNewFileNameChange={setNewFileName}
              onConfirmNewFile={confirmNewFile}
              onCancelNewFile={() => setCreatingInPath(null)}
              refreshKey={treeRefreshKey}
              autoExpandTo={autoExpandTo}
            />
          </div>
          <div className="main-area">
            {selectedPath ? (
              <MarkdownEditor key={selectedPath} ref={editorHandle} path={selectedPath} synced={syncStatus?.type === "ok"} />
            ) : (
              <div className="empty-state">Select a file to edit</div>
            )}
          </div>
        </>
      ) : (
        <div className="setup-screen">
          <h1>org-sync</h1>
          <p>Sync a GitHub repo to a local folder and edit markdown files.</p>
          <p>
            <a href="#" onClick={(e) => { e.preventDefault(); setShowSettings(true); }}>
              Open Settings to get started →
            </a>
          </p>
        </div>
      )}

      {syncStatus?.type === "error" && (
        <ErrorToast msg={syncStatus.msg} />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showSettings && (
        <SettingsPanel
          config={{ ...config, folder }}
          onClose={() => setShowSettings(false)}
          onFolderChange={(f) => {
            setFolder(f);
            setConfig((c) => ({ ...c, folder: f }));
            setShowSettings(false);
            const last = localStorage.getItem(`lastOpenFile:${f}`);
            setSelectedPath(last ?? null);
            setAutoExpandTo(last ?? null);
          }}
        />
      )}
    </div>
  );
}

export default App;
