"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ImpactResult,
  InvestigationResult,
  ProjectResponse,
  ProjectSelection,
  ProjectSnapshot,
} from "@/lib/contracts";
import { sampleRecording } from "@/lib/sample-data";
export type ProjectState = {
  snapshot?: ProjectSnapshot;
  investigation?: InvestigationResult;
  impact?: ImpactResult;
  receipt?: string;
  busy: "sources" | "investigate" | "impact" | null;
  message?: string;
  error?: string;
  expired?: boolean;
  notionExpired?: boolean;
  cooldownUntil: number;
};
const empty: ProjectState = { busy: null, cooldownUntil: 0 };
export function useProject(sample: boolean) {
  const [state, setState] = useState<ProjectState>(() =>
    sample
      ? {
          ...empty,
          snapshot: sampleRecording.snapshot,
          investigation: sampleRecording.investigation,
        }
      : empty,
  );
  const current = useRef<AbortController | null>(null);
  const cooldown = useRef(0);
  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const invalidate = useCallback(
    (keepSources = false, dropNotion = false) => {
      cancel();
      setState((s) => ({
        ...empty,
        cooldownUntil: s.cooldownUntil,
        ...(keepSources && s.snapshot
          ? {
              snapshot: dropNotion
                ? {
                    ...s.snapshot,
                    selection: { ...s.snapshot.selection, pageIds: [] },
                    evidence: s.snapshot.evidence.filter(
                      (e) => e.provider === "github",
                    ),
                    fingerprint: "",
                    limitations: [
                      "Notion disconnected. GitHub evidence remains available.",
                    ],
                  }
                : s.snapshot,
            }
          : {}),
      }));
    },
    [cancel],
  );
  async function run(
    operation: "sources" | "investigate" | "impact",
    selection: ProjectSelection,
    question?: string,
  ) {
    if (current.current || Date.now() < cooldown.current) return;
    const controller = new AbortController();
    current.current = controller;
    setState((s) => ({
      ...s,
      busy: operation,
      message: undefined,
      error: undefined,
      impact: undefined,
      ...(operation !== "impact"
        ? { investigation: undefined, receipt: undefined }
        : {}),
      ...(operation === "sources" ? { snapshot: undefined } : {}),
    }));
    try {
      let result: ProjectResponse;
      if (sample) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 450);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
        result =
          operation === "sources"
            ? { snapshot: sampleRecording.snapshot }
            : operation === "investigate"
              ? {
                  snapshot: sampleRecording.snapshot,
                  investigation: sampleRecording.investigation,
                }
              : question?.trim().toLowerCase() ===
                    sampleRecording.question.toLowerCase() &&
                  sampleRecording.impact
                ? {
                    snapshot: sampleRecording.snapshot,
                    impact: sampleRecording.impact,
                  }
                : {
                    error: "recorded-question",
                    message:
                      "This recorded example covers the five-minute expiry question only. Use a connected project for another change.",
                  };
      } else {
        const response = await fetch(`/api/project/${operation}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selection,
            ...(operation === "impact"
              ? { question, receipt: state.receipt }
              : {}),
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        result = await response.json();
        if (!response.ok && !result.error)
          throw new Error("The request could not be completed.");
      }
      if (current.current !== controller || controller.signal.aborted) return;
      const until =
        result.retryAfter || result.snapshot?.retryAfter
          ? Date.now() +
            (result.retryAfter ?? result.snapshot!.retryAfter!) * 1000
          : cooldown.current;
      cooldown.current = until;
      setState((s) => {
        if (result.error === "unauthorized" && result.provider === "github")
          return {
            ...empty,
            expired: true,
            error: result.message,
            cooldownUntil: until,
          };
        const changed =
          (result.provider === "notion" && result.error === "unauthorized") ||
          result.contextChanged ||
          (result.error &&
            operation !== "sources" &&
            result.snapshot &&
            result.snapshot.fingerprint !== s.snapshot?.fingerprint);
        return {
          ...s,
          busy: null,
          snapshot: result.snapshot ?? s.snapshot,
          investigation: changed
            ? undefined
            : (result.investigation ?? s.investigation),
          receipt: changed ? undefined : (result.receipt ?? s.receipt),
          impact: result.impact,
          message: result.contextChanged ? result.message : undefined,
          error: result.error
            ? (result.message ?? "The operation failed.")
            : undefined,
          notionExpired:
            result.provider === "notion" && result.error === "unauthorized",
          cooldownUntil: until,
        };
      });
    } catch (error) {
      if (current.current !== controller || controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        busy: null,
        error:
          error instanceof Error
            ? error.message
            : "The request failed. Try again.",
      }));
    } finally {
      if (current.current === controller) current.current = null;
    }
  }
  function showSampleState(value: string) {
    cancel();
    if (value === "ready")
      setState({
        ...empty,
        snapshot: sampleRecording.snapshot,
        investigation: sampleRecording.investigation,
      });
    if (value === "before")
      setState({ ...empty, snapshot: sampleRecording.snapshot });
    if (value === "no-findings")
      setState({
        ...empty,
        snapshot: sampleRecording.snapshot,
        investigation: {
          ...sampleRecording.investigation,
          output: {
            overview:
              "No defensible disagreement was established in this synthetic scenario.",
            findings: [],
            limitations: [
              "This sample state demonstrates the presentation only.",
            ],
          },
        },
      });
    if (value === "partial")
      setState({
        ...empty,
        snapshot: {
          ...sampleRecording.snapshot,
          evidence: sampleRecording.snapshot.evidence.filter(
            (e) => e.provider === "github",
          ),
          limitations: [
            "Simulated Notion access failure. GitHub sources remain inspectable.",
          ],
        },
      });
    if (value === "error")
      setState({
        ...empty,
        snapshot: sampleRecording.snapshot,
        error:
          "Simulated model failure. Sources remain available; run the recorded example again.",
      });
    if (value === "empty")
      setState({
        ...empty,
        snapshot: {
          ...sampleRecording.snapshot,
          evidence: [],
          limitations: ["No usable text in this synthetic scenario."],
        },
      });
  }
  return { state, run, invalidate, showSampleState };
}
