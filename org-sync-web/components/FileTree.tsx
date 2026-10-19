"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FileEntry, listFiles, createFile } from "@/lib/github";

interface Props {
  token: string;
  owner: string;
  repo: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export interface FileTreeHandle {
  startNewFile: () => void;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
}

const FileTree = forwardRef<FileTreeHandle, Props>(function FileTree(
  { token, owner, repo, selectedPath, onSelect },
  ref
) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    startNewFile: () => startCreating(""),
  }));

  function load() {
    setLoading(true);
    setLoadError(null);
    listFiles(token, owner, repo)
      .then((files) => setNodes(files))
      .catch((e) => setLoadError(e?.message ?? "Failed to load files"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [token, owner, repo]);

  async function toggleDir(node: TreeNode) {
    if (node.type !== "dir") return;
    if (node.expanded) {
      setNodes((prev) => updateNode(prev, node.path, { expanded: false, children: undefined }));
    } else {
      const children = await listFiles(token, owner, repo, node.path);
      setNodes((prev) => updateNode(prev, node.path, { expanded: true, children }));
    }
  }

  function startCreating(parentPath: string) {
    setCreatingInPath(parentPath);
    setNewName("");
    setCreateError(null);
  }

  function cancelCreate() {
    setCreatingInPath(null);
    setNewName("");
    setCreateError(null);
  }

  async function confirmCreate() {
    if (creatingInPath === null || !newName.trim()) return;
    const name = newName.trim();
    const path = creatingInPath === "" ? name : `${creatingInPath}/${name}`;
    setCreateError(null);
    try {
      await createFile(token, owner, repo, path, `create ${path}`);
      setCreatingInPath(null);
      setNewName("");
      load();
      onSelect(path);
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create file");
    }
  }

  if (loading) return <div className="p-3 text-gray-500 text-sm">Loading…</div>;
  if (loadError) return (
    <div className="p-3 text-red-400 text-sm">
      <p>Failed to load files.</p>
      <p className="text-gray-500 text-xs mt-1">{loadError}</p>
      <button onClick={load} className="mt-2 text-xs text-gray-400 underline">Retry</button>
    </div>
  );

  const shared: CreateProps = { creatingInPath, newName, createError, onStart: startCreating, onNameChange: setNewName, onConfirm: confirmCreate, onCancel: cancelCreate };

  return (
    <div className="overflow-auto flex flex-col">
      <NodeList nodes={nodes} depth={0} selectedPath={selectedPath} onSelect={onSelect} onToggle={toggleDir} createProps={shared} />
      {creatingInPath === "" && (
        <NewFileInput depth={0} value={newName} error={createError} onChange={setNewName} onConfirm={confirmCreate} onCancel={cancelCreate} />
      )}
    </div>
  );
});

export default FileTree;

interface CreateProps {
  creatingInPath: string | null;
  newName: string;
  createError: string | null;
  onStart: (path: string) => void;
  onNameChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function NewFileInput({ depth, value, error, onChange, onConfirm, onCancel }: { depth: number; value: string; error: string | null; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="py-1" style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: "12px" }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); if (e.key === "Escape") onCancel(); }}
        placeholder="filename.md"
        className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-0.5 outline-none border border-gray-600 focus:border-gray-400"
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function updateNode(nodes: TreeNode[], path: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, ...patch };
    if (n.children) return { ...n, children: updateNode(n.children, path, patch) };
    return n;
  });
}

function NodeList({
  nodes,
  depth,
  selectedPath,
  onSelect,
  onToggle,
  createProps,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (node: TreeNode) => void;
  createProps: CreateProps;
}) {
  const { creatingInPath, newName, createError, onStart, onNameChange, onConfirm, onCancel } = createProps;

  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={`group/row flex items-center gap-1.5 py-1 text-sm cursor-pointer select-none hover:bg-gray-800 ${
              selectedPath === node.path ? "bg-gray-700 text-white" : "text-gray-300"
            }`}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => (node.type === "dir" ? onToggle(node) : onSelect(node.path))}
          >
            <span className="text-gray-500 text-xs w-3 shrink-0">
              {node.type === "dir" ? (node.expanded ? "▾" : "▸") : ""}
            </span>
            <span className="truncate flex-1">{node.name}</span>
            {node.type === "dir" && creatingInPath === null && (
              <button
                onClick={(e) => { e.stopPropagation(); onStart(node.path); }}
                title="New file here"
                className="opacity-0 group-hover/row:opacity-100 text-gray-500 hover:text-gray-200 text-xs px-1 mr-1 leading-none shrink-0"
              >
                +
              </button>
            )}
          </div>
          {node.expanded && node.children && (
            <>
              <NodeList
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onToggle={onToggle}
                createProps={createProps}
              />
              {creatingInPath === node.path && (
                <NewFileInput depth={depth + 1} value={newName} error={createError} onChange={onNameChange} onConfirm={onConfirm} onCancel={onCancel} />
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
