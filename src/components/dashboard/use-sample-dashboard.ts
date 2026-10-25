"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceSnapshot, WorkBrief } from "@/lib/contracts";
import {
  partialBrief,
  sampleBrief,
  sampleSnapshot,
  sparseBrief,
  sparseSnapshot,
} from "@/lib/sample-data";

export const sampleScenarios = [
  ["ready", "Brief ready"],
  ["before-generation", "Before generation"],
  ["loading", "Loading sources"],
  ["empty", "No public activity"],
  ["partial", "Partial coverage"],
  ["source-error", "GitHub unavailable"],
  ["brief-error", "Brief unavailable"],
  ["sparse", "Limited context"],
] as const;

export type SampleScenario = (typeof sampleScenarios)[number][0];
export type DashboardState = {
  snapshot: SourceSnapshot;
  brief: WorkBrief | null;
  operation: "idle" | "loading" | "refreshing" | "generating";
  sourceError: boolean;
  briefError: boolean;
};

function stateForScenario(scenario: SampleScenario): DashboardState {
  const state: DashboardState = {
    snapshot: sampleSnapshot,
    brief: sampleBrief,
    operation: "idle",
    sourceError: false,
    briefError: false,
  };
  switch (scenario) {
    case "before-generation":
      return { ...state, brief: null };
    case "loading":
      return { ...state, brief: null, operation: "loading" };
    case "empty":
      return {
        ...state,
        brief: null,
        snapshot: { ...sampleSnapshot, items: [] },
      };
    case "partial":
      return {
        ...state,
        brief: partialBrief,
        snapshot: {
          ...sampleSnapshot,
          coverage: "partial",
          items: sampleSnapshot.items.slice(0, 1),
        },
      };
    case "source-error":
      return {
        ...state,
        brief: null,
        sourceError: true,
        snapshot: { ...sampleSnapshot, items: [] },
      };
    case "brief-error":
      return { ...state, brief: null, briefError: true };
    case "sparse":
      return { ...state, snapshot: sparseSnapshot, brief: sparseBrief };
    default:
      return state;
  }
}

// Only this controller simulates latency. Presentational components know nothing
// about fixtures or providers; the next slice can supply real request results.
export function useSampleDashboard() {
  const [state, setState] = useState(() => stateForScenario("ready"));
  const [scenario, setScenario] = useState<SampleScenario>("ready");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function cancelPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function selectScenario(next: SampleScenario) {
    cancelPending();
    setScenario(next);
    setState(stateForScenario(next));
    if (next === "loading") {
      timer.current = setTimeout(() => {
        setState(stateForScenario("before-generation"));
        setScenario("before-generation");
        timer.current = null;
      }, 1600);
    }
  }

  function refresh() {
    if (state.operation !== "idle") return;
    cancelPending();
    setState((current) => ({
      ...current,
      operation: "refreshing",
      brief: null,
      briefError: false,
      sourceError: false,
    }));
    timer.current = setTimeout(() => {
      setState(stateForScenario("before-generation"));
      setScenario("before-generation");
      timer.current = null;
    }, 900);
  }

  function generate() {
    if (
      state.operation !== "idle" ||
      state.sourceError ||
      !state.snapshot.items.length
    )
      return;
    cancelPending();
    setState((current) => ({
      ...current,
      brief: null,
      briefError: false,
      operation: "generating",
    }));
    timer.current = setTimeout(() => {
      setState((current) => ({
        ...current,
        operation: "idle",
        brief:
          current.snapshot.coverage === "partial"
            ? partialBrief
            : scenario === "sparse"
              ? sparseBrief
              : sampleBrief,
      }));
      if (scenario !== "partial" && scenario !== "sparse") setScenario("ready");
      timer.current = null;
    }, 1200);
  }

  return { state, scenario, selectScenario, refresh, generate };
}
