"use client";

import { useEffect, useRef, useState } from "react";
import FileTree, { FileTreeHandle } from "@/components/FileTree";
import Editor from "@/components/Editor";
import RepoSelector from "@/components/RepoSelector";
import GlobalSearch from "@/components/GlobalSearch";

const STORAGE_KEY = "org-sync-repo";
const lastFileKey = (owner: string, repo: string) => `org-sync-last-file:${owner}/${repo}`;

interface Props {
  token: string;
}

export default function EditorShell({ token }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [savedRepo, setSavedRepo] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fileTreeRef = useRef<FileTreeHandle>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "F") {
        if (owner && repo) {
          e.preventDefault();
          setShowSearch(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [owner, repo]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { owner, repo } = JSON.parse(saved);
      setSavedRepo(`${owner}/${repo}`);
      setOwner(owner);
      setRepo(repo);
      const lastFile = localStorage.getItem(lastFileKey(owner, repo));
      if (lastFile) setSelectedPath(lastFile);
    }
  }, []);

  function selectRepo(o: string, r: string, remember: boolean) {
    setOwner(o);
    setRepo(r);
    const lastFile = localStorage.getItem(lastFileKey(o, r));
    setSelectedPath(lastFile ?? null);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: o, repo: r }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function selectPath(path: string) {
    setSelectedPath(path);
    setNavOpen(false);
    if (owner && repo) localStorage.setItem(lastFileKey(owner, repo), path);
  }

  function clearRepo() {
    setOwner(null);
    setRepo(null);
    setSelectedPath(null);
    setNavOpen(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <>
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Mobile top bar — only shown when a repo is loaded */}
      {owner && repo && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 md:hidden">
          <span className="text-xs text-gray-400 truncate">{owner}/{repo}</span>
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="text-gray-400 hover:text-gray-200 ml-2 shrink-0 text-lg leading-none"
            aria-label="Toggle file tree"
          >
            ☰
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar — always visible on md+, drawer on mobile */}
        {owner && repo && (
          <>
            {/* Mobile drawer backdrop */}
            {navOpen && (
              <div
                className="fixed inset-0 z-10 bg-black/50 md:hidden"
                onClick={() => setNavOpen(false)}
              />
            )}
            <aside
              className={`
                flex flex-col border-r border-gray-800 overflow-auto
                md:relative md:w-56 md:flex
                fixed inset-y-0 left-0 z-20 w-64 bg-gray-950 transition-transform duration-200
                md:translate-x-0 md:transition-none
                ${navOpen ? "translate-x-0" : "-translate-x-full"}
              `}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                <span className="text-xs text-gray-400 truncate">{owner}/{repo}</span>
                <div className="flex items-center ml-auto shrink-0">
                  <button
                    onClick={() => fileTreeRef.current?.startNewFile()}
                    className="text-gray-600 hover:text-gray-400 text-xs px-1"
                    title="New file"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="text-gray-600 hover:text-gray-400 text-xs px-1"
                    title="Search files (⌘⇧F)"
                  >
                    🔍
                  </button>
                  <button
                    onClick={clearRepo}
                    className="text-gray-600 hover:text-gray-400 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <FileTree
                ref={fileTreeRef}
                token={token}
                owner={owner}
                repo={repo}
                selectedPath={selectedPath}
                onSelect={selectPath}
              />
            </aside>
          </>
        )}

        <main className="flex-1 overflow-hidden">
          {!owner || !repo ? (
            <RepoSelector defaultValue={savedRepo ?? undefined} onSelect={selectRepo} />
          ) : selectedPath ? (
            <Editor key={selectedPath} token={token} owner={owner} repo={repo} path={selectedPath} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a file
            </div>
          )}
        </main>
      </div>
    </div>

    {showSearch && owner && repo && (
      <GlobalSearch
        token={token}
        owner={owner}
        repo={repo}
        onSelect={selectPath}
        onClose={() => setShowSearch(false)}
      />
    )}
    </>
  );
}
