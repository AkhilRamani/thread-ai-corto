"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BriefResponse,
  SourcesResponse,
  SourceSnapshot,
  WorkBrief,
} from "@/lib/contracts";

export type SourceState = {
  snapshot: SourceSnapshot;
  brief: WorkBrief | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  briefError: string | null;
  expired: boolean;
  retryAt: number | null;
  briefRetryAt: number | null;
};
const emptySnapshot: SourceSnapshot = {
  items: [],
  fetchedAt: "",
  coverage: "complete",
};
const initialState: SourceState = {
  snapshot: emptySnapshot,
  brief: null,
  loading: true,
  generating: false,
  error: null,
  briefError: null,
  expired: false,
  retryAt: null,
  briefRetryAt: null,
};
const retryTime = (seconds?: number) =>
  seconds ? Date.now() + seconds * 1000 : null;

// One controller owns sources and their brief so stale requests cannot mix snapshots.
export function useGitHubSources() {
  const [state, setState] = useState<SourceState>(initialState);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback((operation: "sources" | "brief") => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const generating = operation === "brief";
    return fetch(generating ? "/api/brief" : "/api/github/sources", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(generating ? 50_000 : 20_000),
      ]),
    })
      .then(async (response) => {
        const result: BriefResponse | SourcesResponse = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || "error" in result) {
          const message =
            "error" in result
              ? result.message
              : "The request did not complete. Please try again.";
          if (response.status === 401) {
            setState({
              ...initialState,
              loading: false,
              error: message,
              expired: true,
            });
          } else {
            const failure = "error" in result ? result : null;
            const freshSnapshot =
              failure && "snapshot" in failure ? failure.snapshot : undefined;
            const sourceFailure =
              !generating ||
              (failure && "stage" in failure && failure.stage === "sources");
            setState((current) => ({
              ...current,
              loading: false,
              generating: false,
              snapshot: freshSnapshot ?? current.snapshot,
              error: generating ? null : message,
              briefError: generating ? message : null,
              retryAt: retryTime(
                sourceFailure ? failure?.retryAfter : freshSnapshot?.retryAfter,
              ),
              briefRetryAt: sourceFailure
                ? current.briefRetryAt
                : retryTime(failure?.retryAfter),
            }));
          }
        } else {
          setState((current) => ({
            ...current,
            loading: false,
            generating: false,
            snapshot: result.snapshot,
            brief: "brief" in result ? result.brief : null,
            retryAt: retryTime(result.snapshot.retryAfter),
            briefRetryAt: generating ? null : current.briefRetryAt,
          }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          const message =
            "The request did not complete. Check your connection and try again.";
          setState((current) => ({
            ...current,
            loading: false,
            generating: false,
            error: generating ? null : message,
            briefError: generating ? message : null,
          }));
        }
      })
      .finally(() => {
        if (pending.current === controller) pending.current = null;
      });
  }, []);

  const refresh = useCallback(
    (recheckSession = false) => {
      if (!recheckSession && state.retryAt && state.retryAt > Date.now())
        return;
      setState((current) => ({
        ...initialState,
        briefRetryAt: current.briefRetryAt,
      }));
      return load("sources");
    },
    [load, state.retryAt],
  );

  const generate = useCallback(() => {
    if (
      pending.current ||
      state.loading ||
      state.expired ||
      !state.snapshot.items.length ||
      (state.retryAt && state.retryAt > Date.now()) ||
      (state.briefRetryAt && state.briefRetryAt > Date.now())
    )
      return;
    setState((current) => ({
      ...current,
      brief: null,
      briefError: null,
      error: null,
      generating: true,
      retryAt: null,
    }));
    return load("brief");
  }, [
    load,
    state.loading,
    state.expired,
    state.snapshot.items.length,
    state.retryAt,
    state.briefRetryAt,
  ]);

  useEffect(() => {
    const deadlines = [state.retryAt, state.briefRetryAt].filter(
      (value): value is number => value !== null,
    );
    if (!deadlines.length) return;
    const timer = setTimeout(
      () =>
        setState((current) => ({
          ...current,
          retryAt:
            current.retryAt && current.retryAt > Date.now()
              ? current.retryAt
              : null,
          briefRetryAt:
            current.briefRetryAt && current.briefRetryAt > Date.now()
              ? current.briefRetryAt
              : null,
        })),
      Math.max(0, Math.min(...deadlines) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.retryAt, state.briefRetryAt]);

  useEffect(() => {
    void load("sources");
    return () => pending.current?.abort();
  }, [load]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh(true);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refresh]);

  return { state, refresh, generate };
}
