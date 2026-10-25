"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceSnapshot, SourcesResponse } from "@/lib/contracts";

type SourceState = {
  snapshot: SourceSnapshot;
  loading: boolean;
  error: string | null;
  expired: boolean;
  retryAt: number | null;
};
const emptySnapshot: SourceSnapshot = {
  items: [],
  fetchedAt: "",
  coverage: "complete",
};

export function useGitHubSources() {
  const [state, setState] = useState<SourceState>({
    snapshot: emptySnapshot,
    loading: true,
    error: null,
    expired: false,
    retryAt: null,
  });
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    return fetch("/api/github/sources", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    })
      .then(async (response) => {
        const result: SourcesResponse = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || "error" in result) {
          const message =
            "error" in result
              ? result.message
              : "Sources could not be loaded. Please try again.";
          setState({
            snapshot: emptySnapshot,
            loading: false,
            error: message,
            expired: response.status === 401,
            retryAt:
              "error" in result && result.retryAfter
                ? Date.now() + result.retryAfter * 1000
                : null,
          });
        } else {
          setState({
            snapshot: result.snapshot,
            loading: false,
            error: null,
            expired: false,
            retryAt: result.snapshot.retryAfter
              ? Date.now() + result.snapshot.retryAfter * 1000
              : null,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            snapshot: emptySnapshot,
            loading: false,
            error:
              "The request did not complete. Check your connection and try again.",
            expired: false,
            retryAt: null,
          });
      });
  }, []);

  const refresh = useCallback(
    (recheckSession = false) => {
      if (!recheckSession && state.retryAt && state.retryAt > Date.now())
        return;
      setState({
        snapshot: emptySnapshot,
        loading: true,
        error: null,
        expired: false,
        retryAt: null,
      });
      return load();
    },
    [load, state.retryAt],
  );

  useEffect(() => {
    if (!state.retryAt) return;
    const timer = setTimeout(
      () => {
        setState((current) => ({ ...current, retryAt: null }));
      },
      Math.max(0, state.retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.retryAt]);

  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);

  useEffect(() => {
    // A restored browser page must recheck its session, including after sign-out.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh(true);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refresh]);

  return { state, refresh };
}
