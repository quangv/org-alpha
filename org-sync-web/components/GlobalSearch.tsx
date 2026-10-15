"use client";

import { useEffect, useRef, useState } from "react";
import { searchCode, SearchResult } from "@/lib/github";

interface Props {
  token: string;
  owner: string;
  repo: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function GlobalSearch({ token, owner, repo, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchCode(token, owner, repo, trimmed);
        setResults(res);
      } catch (e: any) {
        const status = e?.status ?? e?.response?.status;
        if (status === 403 || status === 429) {
          setError("Rate limited. Please wait a moment and try again.");
        } else {
          setError("Search failed. Please try again.");
        }
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token, owner, repo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full bg-transparent text-gray-100 px-4 py-3 text-sm outline-none border-b border-gray-700 placeholder-gray-500"
          placeholder={`Search in ${owner}/${repo}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-gray-500 text-xs text-center">Searching…</div>
          )}
          {error && (
            <div className="px-4 py-3 text-red-400 text-xs text-center">{error}</div>
          )}
          {!loading && !error && query.trim() && results.length === 0 && (
            <div className="px-4 py-3 text-gray-500 text-xs text-center">No results found</div>
          )}
          {!loading && !error && results.map((result) => (
            <button
              key={result.path}
              className="w-full text-left px-4 py-2 hover:bg-gray-800 border-b border-gray-800 last:border-0 cursor-pointer"
              onClick={() => { onSelect(result.path); onClose(); }}
            >
              <div className="text-gray-300 text-xs truncate">{result.path}</div>
              {result.fragment && (
                <div className="text-gray-500 text-xs truncate mt-0.5">{result.fragment}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
