"use client";

import { useEffect, useState } from "react";
import { FileEntry, listFiles } from "@/lib/github";

interface Props {
  token: string;
  owner: string;
  repo: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
}

export default function FileTree({ token, owner, repo, selectedPath, onSelect }: Props) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listFiles(token, owner, repo)
      .then((files) => setNodes(files))
      .finally(() => setLoading(false));
  }, [token, owner, repo]);

  async function toggleDir(node: TreeNode) {
    if (node.type !== "dir") return;
    if (node.expanded) {
      setNodes((prev) => updateNode(prev, node.path, { expanded: false, children: undefined }));
    } else {
      const children = await listFiles(token, owner, repo, node.path);
      setNodes((prev) => updateNode(prev, node.path, { expanded: true, children }));
    }
  }

  if (loading) return <div className="p-3 text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="overflow-auto">
      <NodeList nodes={nodes} depth={0} selectedPath={selectedPath} onSelect={onSelect} onToggle={toggleDir} />
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
}: {
  nodes: TreeNode[];
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (node: TreeNode) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 text-sm cursor-pointer select-none hover:bg-gray-800 ${
              selectedPath === node.path ? "bg-gray-700 text-white" : "text-gray-300"
            }`}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => (node.type === "dir" ? onToggle(node) : onSelect(node.path))}
          >
            <span className="text-gray-500 text-xs w-3">
              {node.type === "dir" ? (node.expanded ? "▾" : "▸") : ""}
            </span>
            {node.name}
          </div>
          {node.expanded && node.children && (
            <NodeList
              nodes={node.children}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          )}
        </div>
      ))}
    </>
  );
}
