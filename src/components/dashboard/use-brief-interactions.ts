"use client";

import { useEffect, useRef, useState } from "react";
import { briefToText } from "@/lib/brief-text";
import type { SourceItem, WorkBrief } from "@/lib/contracts";

export function useBriefInteractions(
  brief: WorkBrief | null,
  sources: SourceItem[],
  sample = false,
) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<{
    brief: WorkBrief;
    message: string;
  } | null>(null);
  const copyVersion = useRef(0);
  useEffect(
    () => () => {
      copyVersion.current++;
    },
    [brief],
  );

  function resetView() {
    setExpandedId(null);
    setCopied(null);
    copyVersion.current++;
  }

  function revealSource(id: string) {
    setExpandedId(id);
    requestAnimationFrame(() => {
      const target = document.getElementById(`source-${id}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
    });
  }

  async function copyBrief() {
    if (!brief) return;
    const version = ++copyVersion.current;
    let message: string;
    try {
      await navigator.clipboard.writeText(briefToText(brief, sources, sample));
      message = "Copied with source references.";
    } catch {
      message =
        "Copy is unavailable. You can select and copy the brief text instead.";
    }
    if (version === copyVersion.current) setCopied({ brief, message });
  }

  return {
    expandedId,
    setExpandedId,
    resetView,
    revealSource,
    copyBrief,
    copyStatus: copied?.brief === brief ? (copied?.message ?? "") : "",
  };
}
