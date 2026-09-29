"use client";

import { useEffect, useState } from "react";
import FileTree from "@/components/FileTree";
import Editor from "@/components/Editor";
import RepoSelector from "@/components/RepoSelector";

const STORAGE_KEY = "org-sync-repo";

interface Props {
  token: string;
}

export default function EditorShell({ token }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { owner, repo } = JSON.parse(saved);
      setOwner(owner);
      setRepo(repo);
    }
  }, []);

  function selectRepo(o: string, r: string) {
    setOwner(o);
    setRepo(r);
    setSelectedPath(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: o, repo: r }));
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-56 border-r border-gray-800 overflow-auto flex flex-col">
        {owner && repo ? (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <span className="text-xs text-gray-400 truncate">{owner}/{repo}</span>
              <button
                onClick={() => { setOwner(null); setRepo(null); setSelectedPath(null); localStorage.removeItem(STORAGE_KEY); }}
                className="text-gray-600 hover:text-gray-400 text-xs ml-1 shrink-0"
              >
                ✕
              </button>
            </div>
            <FileTree
              token={token}
              owner={owner}
              repo={repo}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </>
        ) : (
          <div className="flex-1" />
        )}
      </aside>
      <main className="flex-1 overflow-hidden">
        {!owner || !repo ? (
          <RepoSelector onSelect={selectRepo} />
        ) : selectedPath ? (
          <Editor key={selectedPath} token={token} owner={owner} repo={repo} path={selectedPath} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Select a file
          </div>
        )}
      </main>
    </div>
  );
}
