"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { briefToText } from "@/lib/brief-text";
import { BriefPanel } from "./brief-panel";
import { BriefPlaceholder } from "./brief-placeholder";
import { SampleControls } from "./sample-controls";
import { SiteHeader } from "./site-header";
import { SourceReferences } from "./source-references";
import { SourceList } from "./source-list";
import { useSampleDashboard } from "./use-sample-dashboard";

export function SampleDashboard() {
  const { state, scenario, selectScenario, refresh, generate } =
    useSampleDashboard();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const copyVersion = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = state.operation !== "idle";
  const sourcesLoading =
    state.operation === "loading" || state.operation === "refreshing";
  const generating = state.operation === "generating";
  const hasSources = state.snapshot.items.length > 0 && !state.sourceError;
  const title =
    state.brief?.title ??
    (state.sourceError
      ? "Let’s get your sources back."
      : !hasSources && !sourcesLoading
        ? "A quiet moment in your public work."
        : "Pick up where you left off.");

  useEffect(
    () => () => {
      copyVersion.current++;
    },
    [],
  );

  function resetView() {
    setExpandedId(null);
    setCopyStatus("");
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
    if (!state.brief) return;
    const version = ++copyVersion.current;
    try {
      await navigator.clipboard.writeText(
        briefToText(state.brief, state.snapshot.items, true),
      );
      if (version === copyVersion.current)
        setCopyStatus("Copied with source references.");
    } catch {
      if (version === copyVersion.current)
        setCopyStatus(
          "Copy is unavailable. You can select and copy the brief text instead.",
        );
    }
  }

  const statusText = generating
    ? "Preparing the sample brief."
    : sourcesLoading
      ? "Loading sample sources."
      : state.sourceError
        ? "Sources could not be loaded."
        : state.brief
          ? "Sample brief ready."
          : state.briefError
            ? "The brief could not be generated. Sources are still available."
            : hasSources
              ? "Sources ready."
              : "No matching public activity.";

  return (
    <>
      <a
        className="fixed top-[-100px] left-4 z-10 rounded-3xl bg-black px-5 py-3 text-white focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-[904px] px-[22px] pt-12 pb-10 max-[600px]:px-5 max-[600px]:pb-8"
        id="main"
      >
        <div className="mb-8">
          <p className="mb-8 flex items-center gap-2.5 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase max-[600px]:mb-6 max-[600px]:gap-2 max-[600px]:text-[10px]">
            Your GitHub brief <span aria-hidden="true">·</span> Sample data
          </p>
          <h1
            className="scroll-mt-8 text-[clamp(30px,3.1vw,40px)] leading-[1.2] tracking-[-0.03em] text-balance focus:not-focus-visible:outline-none max-[600px]:text-[32px]"
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {statusText}
        </p>
        {state.brief ? (
          <BriefPanel
            brief={state.brief}
            sources={state.snapshot.items}
            onSourceSelect={revealSource}
          />
        ) : (
          <BriefPlaceholder
            loading={sourcesLoading || generating}
            title={
              generating
                ? "Finding the thread…"
                : sourcesLoading
                  ? "Gathering your sources…"
                  : state.sourceError
                    ? "Your brief starts with your sources."
                    : state.briefError
                      ? "The brief couldn’t be generated."
                      : !hasSources
                        ? "Nothing to summarise just yet."
                        : "Your sources are ready."
            }
            description={
              generating
                ? "Connecting the sample activity into a short, source-backed brief."
                : sourcesLoading
                  ? "Your brief will be ready to generate once the source list is loaded."
                  : state.sourceError
                    ? "Retry the source request below to continue."
                    : state.briefError
                      ? "Your sources are still here. Try again when you’re ready."
                      : !hasSources
                        ? "You can still explore how a brief works with the sample activity."
                        : "Turn the activity below into a short overview and a useful starting point."
            }
          />
        )}
        {state.brief?.observations.length ? (
          <div className="mt-8 grid gap-6">
            {state.brief.observations.map((observation, index) => (
              <div key={index}>
                <p>{observation.text}</p>
                <SourceReferences
                  sourceIds={observation.sourceIds}
                  sources={state.snapshot.items}
                  onSourceSelect={revealSource}
                  label={`Sources for observation ${index + 1}`}
                />
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-12 max-[600px]:mt-8">
          {state.brief?.nextStep && (
            <div>
              <h2 className="mb-3 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase">
                Suggested next step
              </h2>
              <p className="max-w-[720px] text-pretty">
                {state.brief.nextStep.text}
              </p>
              <SourceReferences
                sourceIds={state.brief.nextStep.sourceIds}
                sources={state.snapshot.items}
                onSourceSelect={revealSource}
                label="Sources for the suggested next step"
              />
            </div>
          )}
          {!state.sourceError && !sourcesLoading && (
            <div className="mt-7 flex flex-wrap items-center gap-3 first:mt-0">
              <Button
                disabled={generating}
                onClick={() => {
                  resetView();
                  if (hasSources) generate();
                  else selectScenario("ready");
                }}
              >
                {generating
                  ? "Preparing brief…"
                  : !hasSources
                    ? "Explore sample activity"
                    : state.brief
                      ? "Regenerate brief"
                      : state.briefError
                        ? "Try again"
                        : "Generate my brief"}
              </Button>
              {state.brief && (
                <Button variant="ghost" onClick={copyBrief}>
                  {copyStatus.startsWith("Copied") ? "Copied" : "Copy brief"}
                </Button>
              )}
            </div>
          )}
          {copyStatus && (
            <p className="mt-4 text-[14px] text-muted-foreground" role="status">
              {copyStatus}
            </p>
          )}
        </div>
        <SourceList
          snapshot={state.snapshot}
          loading={sourcesLoading}
          busy={busy}
          error={state.sourceError}
          expandedId={expandedId}
          onToggle={(id) =>
            setExpandedId((current) => (current === id ? null : id))
          }
          onRefresh={() => {
            resetView();
            refresh();
          }}
        />
        <SampleControls
          value={scenario}
          onChange={(value) => {
            resetView();
            selectScenario(value);
            headingRef.current?.focus({ preventScroll: true });
            headingRef.current?.scrollIntoView({
              block: "start",
              behavior: "instant",
            });
          }}
        />
      </main>
    </>
  );
}
