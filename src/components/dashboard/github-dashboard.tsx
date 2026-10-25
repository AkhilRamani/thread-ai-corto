"use client";

import { useState } from "react";
import Link from "next/link";
import type { GitHubUser } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { BriefPlaceholder } from "./brief-placeholder";
import { SiteHeader } from "./site-header";
import { SourceList } from "./source-list";
import { useGitHubSources } from "./use-github-sources";

export function GitHubDashboard({ user }: { user: GitHubUser }) {
  const { state, refresh } = useGitHubSources();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const empty = !state.loading && !state.error && !state.snapshot.items.length;
  const partialEmpty = empty && state.snapshot.coverage === "partial";
  return (
    <>
      <a
        className="fixed top-[-100px] left-4 z-10 rounded-3xl bg-black px-5 py-3 text-white focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader user={state.expired ? undefined : user} mode="live" />
      <main
        className="mx-auto w-full max-w-[904px] px-[22px] pt-12 pb-10 max-[600px]:px-5 max-[600px]:pb-8"
        id="main"
      >
        <div className="mb-8">
          <p className="mb-8 flex items-center gap-2.5 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase max-[600px]:mb-6 max-[600px]:gap-2 max-[600px]:text-[10px]">
            Your GitHub work <span aria-hidden="true">·</span> Public sources
          </p>
          <h1 className="scroll-mt-8 text-[clamp(30px,3.1vw,40px)] leading-[1.2] tracking-[-0.03em] text-balance focus:not-focus-visible:outline-none max-[600px]:text-[32px]">
            {state.expired
              ? "Let’s reconnect your GitHub."
              : empty && !partialEmpty
                ? "A quiet moment in your public work."
                : "Pick up where you left off."}
          </h1>
        </div>
        <p className="sr-only" role="status">
          {state.loading
            ? "Loading GitHub sources."
            : (state.error ?? `${state.snapshot.items.length} sources loaded.`)}
        </p>
        <BriefPlaceholder
          loading={state.loading}
          title={
            state.loading
              ? "Gathering your sources…"
              : state.expired
                ? "Your GitHub connection has expired."
                : state.error
                  ? "Your work will be here when GitHub returns."
                  : partialEmpty
                    ? "The search is incomplete."
                    : empty
                      ? "No matching public activity."
                      : "Your sources are ready to explore."
          }
          description={
            state.expired
              ? "Reconnect to continue. Your previous sources have been cleared."
              : state.error
                ? state.error
                : partialEmpty
                  ? "Some collections could not be retrieved. Retry the sources below before drawing conclusions."
                  : empty
                    ? "Private repositories are not included. Try the sample to see a representative brief."
                    : state.loading
                      ? "Looking for recent pull requests and open threads."
                      : "Open a source below to pick up the context. Live AI briefs are not available yet; the sample shows how they will work."
          }
        />
        <div className="mt-7 flex flex-wrap items-center gap-3">
          {state.expired && (
            <Button asChild>
              <a href="/api/auth/github">Reconnect GitHub</a>
            </Button>
          )}
          <Button variant={state.expired ? "ghost" : "secondary"} asChild>
            <Link href="/sample">Explore sample brief</Link>
          </Button>
        </div>
        {!state.expired && (
          <SourceList
            snapshot={state.snapshot}
            loading={state.loading}
            busy={state.loading}
            retryAt={state.retryAt}
            error={!!state.error}
            errorMessage={state.error ?? undefined}
            sample={false}
            expandedId={expandedId}
            onToggle={(id) =>
              setExpandedId((current) => (current === id ? null : id))
            }
            onRefresh={() => {
              setExpandedId(null);
              void refresh();
            }}
          />
        )}
      </main>
    </>
  );
}
