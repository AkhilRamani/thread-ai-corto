"use client";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SourceKindIcon } from "./source-kind-icon";
import { dateLabel } from "@/components/investigator/evidence-surface";
import type { SourceSnapshot, WorkBrief } from "@/lib/contracts";
import { sampleBrief, sampleSnapshot } from "@/lib/brief-sample";
import { BriefPanel } from "./brief-panel";
import { WorkArea, Inspector } from "./work-area";
import { WorkDetails } from "./work-details";
import { useGitHubSources, type SourceState } from "./use-github-sources";
import { sourceSelection } from "@/lib/source-selection";
import { briefToText } from "@/lib/brief-text";

export function BriefDashboard(props: {
  sample: boolean;
  aiAvailable: boolean;
  active?: boolean;
  onExpired?: () => void;
}) {
  return props.sample ? <SampleBrief {...props} /> : <LiveBrief {...props} />;
}
function LiveBrief({
  aiAvailable,
  active,
  onExpired,
}: {
  aiAvailable: boolean;
  active?: boolean;
  onExpired?: () => void;
}) {
  const { state, refresh, generate } = useGitHubSources();
  useEffect(() => {
    if (state.expired) onExpired?.();
  }, [state.expired, onExpired]);
  return (
    <BriefContent
      active={active}
      state={state}
      aiAvailable={aiAvailable}
      onExpired={onExpired}
      onRefresh={() => void refresh()}
      onGenerate={() => void generate()}
    />
  );
}
function SampleBrief({
  aiAvailable,
  active,
}: {
  aiAvailable: boolean;
  active?: boolean;
}) {
  const [brief, setBrief] = useState<WorkBrief | null>(sampleBrief);
  return (
    <BriefContent
      sample
      active={active}
      state={{
        snapshot: sampleSnapshot,
        brief,
        loading: false,
        generating: false,
        error: null,
        briefError: null,
        expired: false,
        retryAt: null,
        briefRetryAt: null,
      }}
      aiAvailable={aiAvailable}
      onRefresh={() => setBrief(null)}
      onGenerate={() => setBrief(sampleBrief)}
    />
  );
}
function BriefContent({
  state,
  sample = false,
  active = true,
  aiAvailable,
  onRefresh,
  onGenerate,
  onExpired,
}: {
  state: SourceState;
  sample?: boolean;
  active?: boolean;
  aiAvailable: boolean;
  onRefresh: () => void;
  onGenerate: () => void;
  onExpired?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const item = state.snapshot.items.find((source) => source.id === selected);
  const busy = state.loading || state.generating;
  const cooling = !!state.retryAt || !!state.briefRetryAt;
  function refresh() {
    setSelected(null);
    setCopyStatus("");
    onRefresh();
  }
  return (
    <WorkArea
      inspector={
        active &&
        item && (
          <Inspector title={item.title} onClose={() => setSelected(null)}>
            <WorkDetails
              key={item.id}
              item={item}
              sample={sample}
              onExpired={onExpired}
            />
          </Inspector>
        )
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-ui-title tracking-[-0.03em]">PR brief</h1>
          <p className="mt-2 text-ui-body text-muted-foreground">
            Your public GitHub work.
          </p>
        </div>
        <Button
          variant="ai"
          aria-busy={state.generating}
          disabled={
            busy ||
            cooling ||
            !state.snapshot.items.length ||
            !aiAvailable ||
            state.expired
          }
          onClick={() => {
            setSelected(null);
            setCopyStatus("");
            onGenerate();
          }}
        >
          {state.generating
            ? "Preparing brief…"
            : state.brief
              ? sample
                ? "Replay brief"
                : "Regenerate brief"
              : sample
                ? "Show example brief"
                : "Generate my brief"}
        </Button>
      </div>
      {(state.error || state.briefError) && (
        <p
          className="mb-5 rounded-lg bg-secondary p-4 text-ui-body"
          role="alert"
        >
          {state.error ?? state.briefError}
        </p>
      )}
      {state.brief ? (
        <>
          <BriefPanel
            brief={state.brief}
            sources={state.snapshot.items}
            onSourceSelect={setSelected}
          />
          <div className="mt-4 flex items-center justify-end gap-3 text-ui-meta text-muted-foreground">
            <span className="text-right" role="status">
              {copyStatus}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    briefToText(state.brief!, state.snapshot.items, sample),
                  );
                  setCopyStatus("Copied brief.");
                } catch {
                  setCopyStatus(
                    "Copy unavailable. Select the brief text to copy it.",
                  );
                }
              }}
            >
              Copy brief
            </Button>
          </div>
          {state.brief.nextStep && (
            <section className="mt-6" aria-label="Suggested next step">
              <p className="mb-2 font-mono text-ui-label uppercase text-muted-foreground">
                Suggested next step
              </p>
              <p className="text-ui-body">{state.brief.nextStep.text}</p>
            </section>
          )}
          {state.brief.observations.map((observation, index) => (
            <p key={index} className="mt-3 text-ui-body">
              {observation.text}{" "}
              {observation.sourceIds.map((id) => (
                <button
                  key={id}
                  className="ml-2 underline"
                  onClick={() => setSelected(id)}
                >
                  View source #
                  {state.snapshot.items.find((s) => s.id === id)?.number}
                </button>
              ))}
            </p>
          ))}
        </>
      ) : (
        <section
          className="flex min-h-[300px] flex-col justify-center rounded-panel bg-muted p-8"
          aria-busy={busy}
        >
          <h2 className="text-ui-section">
            {busy
              ? state.generating
                ? "Preparing your brief…"
                : "Loading your GitHub work…"
              : state.snapshot.items.length
                ? "Pick up where you left off."
                : "No work returned in this scope."}
          </h2>
          <p className="mt-3 max-w-[550px] text-ui-body text-muted-foreground">
            {state.snapshot.items.length
              ? "Inspect your PRs and assigned issues, then generate a short brief with a suggested next step."
              : "This view covers public authored pull requests and open assigned issues. Check source coverage below."}
          </p>
        </section>
      )}
      {!aiAvailable && (
        <p className="mt-4 text-ui-meta">
          OpenAI must be configured to generate a brief. Sources remain
          available.
        </p>
      )}
      <section className="mt-8" aria-label="Source work">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-ui-section">Source work</h2>
          <button
            className="text-ui-body underline underline-offset-4 disabled:opacity-40"
            disabled={busy || !!state.retryAt || state.expired}
            onClick={refresh}
          >
            Refresh sources
          </button>
        </div>
        <div className="space-y-2">
          {state.snapshot.items.map((source) => (
            <button
              key={source.id}
              aria-label={`Inspect ${source.title}`}
              aria-pressed={source.id === selected}
              onClick={() => setSelected(source.id)}
              className={`flex min-h-[86px] w-full items-center gap-5 rounded-lg px-4 py-4 text-left hover:bg-muted max-[600px]:gap-3 max-[600px]:px-2 ${source.id === selected ? "bg-secondary" : ""}`}
            >
              <SourceKindIcon kind={source.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-ui-item font-medium break-words">
                  {source.title}
                </span>
                <span className="mt-1 block text-ui-meta break-words text-muted-foreground">
                  {source.repository} · #{source.number} ·{" "}
                  {source.kind === "issue" ? "Issue" : "PR"} · {source.status} ·{" "}
                  {dateLabel(source.updatedAt)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
        {!state.loading && !state.snapshot.items.length && (
          <p className="py-4 text-ui-body text-muted-foreground">
            {state.error
              ? "Sources could not be loaded."
              : "No matching public sources were returned."}
          </p>
        )}
        {cooling && (
          <p role="status" className="mt-4 text-ui-meta">
            A provider is limiting requests. Actions will become available after
            the cooldown.
          </p>
        )}
        <BriefCoverage snapshot={state.snapshot} sample={sample} />
      </section>
      {!sample && (
        <p className="mt-5 text-ui-meta text-muted-foreground">
          Generating sends these public titles and descriptions to OpenAI. No
          request is made until you generate.
        </p>
      )}
    </WorkArea>
  );
}
function BriefCoverage({
  snapshot,
  sample,
}: {
  snapshot: SourceSnapshot;
  sample: boolean;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      className="mt-5 border-t text-ui-meta text-muted-foreground"
    >
      <AccordionItem value="source-coverage" className="border-0">
        <AccordionTrigger className="py-3 text-ui-meta font-normal">
          <span>
            Source coverage{snapshot.coverage === "partial" ? " · Partial" : ""}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3">
          <p>
            {sample
              ? "Fixed synthetic sources. Replaying does not call GitHub or OpenAI."
              : `Fetched ${dateLabel(snapshot.fetchedAt)}. Recent authored PRs cover ${sourceSelection.recentDays} days; open authored PRs and assigned issues may be older.`}
          </p>
          {snapshot.collections?.map((collection) => (
            <p key={collection.label}>
              {collection.label}: {collection.returned}
              {collection.total !== null && ` of ${collection.total}`}
              {collection.capped && " · capped"}
              {collection.incomplete && " · incomplete"}
              {collection.error && ` · ${collection.error}`}
            </p>
          ))}
          <p>
            This is a selected public snapshot. Descriptions do not establish
            code correctness or deployment.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
