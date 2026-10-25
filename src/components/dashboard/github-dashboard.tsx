"use client";

import type { GitHubUser } from "@/lib/contracts";
import { GitHubBriefActions } from "./github-brief-actions";
import { PageShell } from "./page-shell";
import { briefMessages } from "./brief-messages";
import { BriefPlaceholder } from "./brief-placeholder";
import { BriefPanel } from "./brief-panel";
import { BriefDetails } from "./brief-details";
import { useBriefInteractions } from "./use-brief-interactions";
import { SiteHeader } from "./site-header";
import { SourceList } from "./source-list";
import { useGitHubSources } from "./use-github-sources";

export function GitHubDashboard({
  user,
  briefAvailable = true,
}: {
  user: GitHubUser;
  briefAvailable?: boolean;
}) {
  const { state, refresh, generate } = useGitHubSources();
  const {
    expandedId,
    setExpandedId,
    resetView,
    revealSource,
    copyBrief,
    copyStatus,
  } = useBriefInteractions(state.brief, state.snapshot.items);
  const busy = state.loading || state.generating;
  const empty = !state.loading && !state.error && !state.snapshot.items.length;
  const partialEmpty = empty && state.snapshot.coverage === "partial";
  function getBriefStatus() {
    if (state.generating) return "generating";
    if (state.loading) return "loading";
    if (state.expired) return "expired";
    if (state.error) return "sourceError";
    if (partialEmpty) return "partialEmpty";
    if (empty) return "empty";
    if (state.briefError) return "briefError";
    if (!briefAvailable) return "unconfigured";
    return "ready";
  }
  const briefStatus = getBriefStatus();
  const message = briefMessages[briefStatus];
  const errorMessage =
    briefStatus === "sourceError"
      ? state.error
      : briefStatus === "briefError"
        ? state.briefError
        : null;

  return (
    <PageShell
      header={
        <SiteHeader user={state.expired ? undefined : user} mode="live" />
      }
      eyebrow={
        <>
          Your GitHub work <span aria-hidden="true">·</span> Public sources
        </>
      }
      title={
        state.brief?.title ??
        (state.expired
          ? "Let’s reconnect your GitHub."
          : empty && !partialEmpty
            ? "A quiet moment in your public work."
            : "Pick up where you left off.")
      }
    >
      <p className="sr-only" role="status">
        {state.brief ? "Your work brief is ready." : message.title}
      </p>
      {state.brief ? (
        <>
          <BriefPanel
            brief={state.brief}
            sources={state.snapshot.items}
            onSourceSelect={revealSource}
          />
          <BriefDetails
            brief={state.brief}
            sources={state.snapshot.items}
            onSourceSelect={revealSource}
          />
        </>
      ) : (
        <BriefPlaceholder
          loading={busy}
          title={message.title}
          description={errorMessage ?? message.description}
        />
      )}
      <GitHubBriefActions
        state={state}
        briefAvailable={briefAvailable}
        onGenerate={() => {
          resetView();
          void generate();
        }}
        onCopy={copyBrief}
        copyStatus={copyStatus}
      />
      {!state.expired && (
        <SourceList
          snapshot={state.snapshot}
          loading={state.loading}
          busy={busy}
          retryAt={state.retryAt}
          error={!!state.error}
          errorMessage={state.error ?? undefined}
          sample={false}
          expandedId={expandedId}
          onToggle={(id) =>
            setExpandedId((current) => (current === id ? null : id))
          }
          onRefresh={() => {
            resetView();
            void refresh();
          }}
        />
      )}
    </PageShell>
  );
}
