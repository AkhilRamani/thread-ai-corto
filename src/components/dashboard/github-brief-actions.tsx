import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SourceState } from "./use-github-sources";

export function GitHubBriefActions({
  state,
  briefAvailable,
  onGenerate,
  onCopy,
  copyStatus,
}: {
  state: SourceState;
  briefAvailable: boolean;
  onGenerate: () => void;
  onCopy: () => void;
  copyStatus: string;
}) {
  const hasSources = !!state.snapshot.items.length && !state.error;
  const busy = state.loading || state.generating;
  return (
    <>
      {hasSources && !state.expired && (
        <p
          className="mt-6 max-w-[640px] text-[13px] leading-5 text-muted-foreground"
          id="generation-disclosure"
        >
          Generate refreshes your public sources and sends their titles, bounded
          descriptions, repositories, labels, statuses, and dates to OpenAI. No
          repository files, diffs, or discussion history are fetched. The brief
          is AI-generated; check its sources before acting.
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {hasSources && !state.expired && (
          <Button
            variant={state.brief ? "ghost" : "default"}
            disabled={
              busy || !briefAvailable || !!state.retryAt || !!state.briefRetryAt
            }
            aria-describedby="generation-disclosure"
            onClick={onGenerate}
          >
            {state.generating
              ? "Generating brief…"
              : state.brief
                ? "Regenerate brief"
                : state.briefError
                  ? "Try again"
                  : "Generate my brief"}
          </Button>
        )}
        {state.brief && (
          <Button variant="ghost" onClick={onCopy}>
            {copyStatus.startsWith("Copied") ? "Copied" : "Copy brief"}
          </Button>
        )}
        {state.expired && (
          <Button asChild>
            <a href="/api/auth/github">Reconnect GitHub</a>
          </Button>
        )}
        {!hasSources && !state.loading && (
          <Button variant={state.expired ? "ghost" : "secondary"} asChild>
            <Link href="/sample">Explore sample brief</Link>
          </Button>
        )}
      </div>
      {!briefAvailable && hasSources && (
        <Link
          className="mt-4 inline-block text-[14px] text-muted-foreground underline underline-offset-4"
          href="/sample"
        >
          Explore sample brief
        </Link>
      )}
      {state.briefRetryAt && (
        <p className="mt-4 text-[14px] text-muted-foreground" role="status">
          Brief generation will be available at{" "}
          <time dateTime={new Date(state.briefRetryAt).toISOString()}>
            {new Date(state.briefRetryAt).toLocaleTimeString()}
          </time>
          . You can keep exploring your sources.
        </p>
      )}
      {copyStatus && (
        <p className="mt-4 text-[14px] text-muted-foreground" role="status">
          {copyStatus}
        </p>
      )}
    </>
  );
}
