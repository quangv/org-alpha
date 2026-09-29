"use client";

import { useState } from "react";

interface Props {
  onSelect: (owner: string, repo: string) => void;
}

export default function RepoSelector({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const match = input.trim().match(/^(?:https:\/\/github\.com\/)?([^/]+)\/([^/]+?)(\.git)?$/);
    if (!match) {
      setError("Use owner/repo or a GitHub URL");
      return;
    }
    setError("");
    onSelect(match[1], match[2]);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-sm">
      <p className="text-gray-400">Enter a GitHub repo to get started</p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="bg-gray-800 text-gray-100 px-3 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-gray-600 w-64 text-sm"
          placeholder="owner/repo or GitHub URL"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
        >
          Open
        </button>
      </form>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
