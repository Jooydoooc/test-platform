"use client";

import { useState } from "react";

// Copy a share link to the clipboard. The absolute URL is built client-side so
// it works from whatever origin the teacher is on.
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url =
      typeof window !== "undefined" ? window.location.origin + path : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — select-and-copy fallback isn't worth the weight here.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
