"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { PageShell } from "./page-shell";
import { briefMessages } from "./brief-messages";
import { BriefPanel } from "./brief-panel";
import { BriefPlaceholder } from "./brief-placeholder";
import { SampleControls } from "./sample-controls";
import { SiteHeader } from "./site-header";
import { BriefDetails } from "./brief-details";
import { useBriefInteractions } from "./use-brief-interactions";
import { SourceList } from "./source-list";
import { useSampleDashboard } from "./use-sample-dashboard";

export function SampleDashboard() {
  const { state, scenario, selectScenario, refresh, generate } =
    useSampleDashboard();
  const {
    expandedId,
    setExpandedId,
    copyStatus,
    resetView,
    revealSource,
    copyBrief,
  } = useBriefInteractions(state.brief, state.snapshot.items, true);
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

  function getBriefStatus() {
    if (generating) return "generating";
    if (sourcesLoading) return "loading";
    if (state.sourceError) return "sourceError";
    if (state.briefError) return "briefError";
    if (!hasSources) return "empty";
    return "ready";
  }
  const message = briefMessages[getBriefStatus()];

  return (
    <PageShell
      header={<SiteHeader />}
      eyebrow={
        <>
          Your GitHub brief <span aria-hidden="true">·</span> Sample data
        </>
      }
      title={title}
      headingRef={headingRef}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {state.brief ? "Sample brief ready." : message.title}
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
          title={message.title}
          description={message.description}
        />
      )}
      {state.brief && (
        <BriefDetails
          brief={state.brief}
          sources={state.snapshot.items}
          onSourceSelect={revealSource}
        />
      )}
      <div
        className={state.brief?.nextStep ? "mt-7" : "mt-12 max-[600px]:mt-8"}
      >
        {!state.sourceError && !sourcesLoading && (
          <div className="mt-7 flex flex-wrap items-center gap-3 first:mt-0">
            <Button
              variant={state.brief ? "ghost" : "default"}
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
    </PageShell>
  );
}
