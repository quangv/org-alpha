"use client";

import { useEffect, useRef, useState } from "react";
import { readFile, writeFile } from "@/lib/github";

interface Props {
  token: string;
  owner: string;
  repo: string;
  path: string;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);

function isImage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

export default function Editor({ token, owner, repo, path }: Props) {
  const [content, setContent] = useState("");
  const [sha, setSha] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const dirty = useRef(false);

  const image = isImage(path);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setContent("");
    setSha("");
    setStatus("idle");
    setImageDataUrl(null);
    if (image) {
      readFile(token, owner, repo, path).then(({ base64, sha }) => {
        const ext = path.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
        setImageDataUrl(`data:${mime};base64,${base64}`);
        setSha(sha);
      });
    } else {
      readFile(token, owner, repo, path).then(({ content, sha }) => {
        setContent(content);
        setSha(sha);
        dirty.current = false;
      });
    }
  }, [token, owner, repo, path, image]);

  async function save(value: string) {
    if (!sha || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      await writeFile(token, owner, repo, path, value, sha, `sync: ${now}`);
      const { sha: newSha } = await readFile(token, owner, repo, path);
      setSha(newSha);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save(content);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-xs text-gray-500">
        <span>{path}</span>
        <span>
          {saving && "Saving…"}
          {!saving && status === "saved" && "Saved"}
          {!saving && status === "error" && "Error saving"}
        </span>
      </div>
      {image ? (
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imageDataUrl && <img src={imageDataUrl} alt={path} className="max-w-full max-h-full object-contain" />}
        </div>
      ) : (
        <textarea
          className="flex-1 bg-gray-950 text-gray-100 font-mono text-sm p-4 resize-none outline-none"
          value={content}
          onChange={(e) => { setContent(e.target.value); dirty.current = true; }}
          onBlur={() => { if (dirty.current) { dirty.current = false; save(content); } }}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
      )}
    </div>
  );
}
