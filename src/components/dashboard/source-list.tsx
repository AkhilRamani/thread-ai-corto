import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceRow } from "./source-row";
import type { SourceSnapshot } from "@/lib/contracts";
import { sourceSelection } from "@/lib/source-selection";

type SourceListProps = {
  snapshot: SourceSnapshot;
  loading: boolean;
  busy: boolean;
  error: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRefresh: () => void;
  sample?: boolean;
  errorMessage?: string;
  retryAt?: number | null;
};

export function SourceList({
  snapshot,
  loading,
  busy,
  error,
  expandedId,
  onToggle,
  onRefresh,
  sample = true,
  errorMessage,
  retryAt,
}: SourceListProps) {
  const coverageDetails =
    snapshot.collections?.filter(
      (collection) =>
        collection.error || collection.capped || collection.incomplete,
    ) ?? [];
  return (
    <section
      className="mt-20 max-[600px]:mt-16"
      aria-labelledby="sources-heading"
      aria-busy={loading}
    >
      <div className="flex items-center justify-between gap-6 max-[600px]:gap-3">
        <h2
          className="text-[24px] leading-[1.2] tracking-[-0.04em]"
          id="sources-heading"
        >
          Sources
        </h2>
        <Button
          className="max-[600px]:text-[14px]"
          variant="link"
          size="link"
          onClick={onRefresh}
          disabled={busy || !!retryAt}
        >
          {loading
            ? "Refreshing…"
            : error
              ? "Retry sources"
              : "Refresh sources"}
        </Button>
      </div>
      <p className="mt-2 text-[12px] tracking-normal text-muted-foreground max-[600px]:max-w-[260px] max-[600px]:leading-5">
        {sample ? (
          "Public pull requests & assigned issues · Sample snapshot, 25 Oct 2026"
        ) : (
          <>
            Public work only · Recent authored PRs ({sourceSelection.recentDays}{" "}
            days, up to {sourceSelection.recentPRs}), open authored PRs (up to{" "}
            {sourceSelection.openPRs}), assigned issues (up to{" "}
            {sourceSelection.assignedIssues}).
            {snapshot.fetchedAt && (
              <>
                {" "}
                Retrieved{" "}
                <time dateTime={snapshot.fetchedAt}>
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(snapshot.fetchedAt))}{" "}
                  UTC
                </time>
                .
              </>
            )}
          </>
        )}
      </p>
      {snapshot.coverage === "partial" && (
        <p
          className="mt-6 border-l-2 border-[#777] bg-muted px-5 py-4 text-[14px]"
          role="status"
        >
          {sample
            ? "Issues could not be retrieved. This brief only covers the available pull request."
            : "Only part of your public activity could be retrieved. Available sources are shown below."}
        </p>
      )}
      {retryAt && (
        <p
          className="mt-6 border-l-2 border-[#777] bg-muted px-5 py-4 text-[14px]"
          role="status"
        >
          GitHub is limiting requests. Refresh will be available at{" "}
          <time dateTime={new Date(retryAt).toISOString()}>
            {new Date(retryAt).toLocaleTimeString()}
          </time>
          .
        </p>
      )}
      {!sample && coverageDetails.length > 0 && (
        <ul className="mt-4 space-y-2 pl-5 text-[13px] text-muted-foreground">
          {coverageDetails.map((collection) => (
            <li key={collection.label}>
              {collection.label}:{" "}
              {collection.error ??
                (collection.capped
                  ? `showing the latest ${collection.returned} of ${collection.total} matches. `
                  : "")}
              {collection.incomplete
                ? " GitHub reported incomplete search results."
                : ""}
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <div aria-label="Loading sources" className="mt-5">
          {[0, 1].map((index) => (
            <div
              className="grid min-h-28 grid-cols-[48px_minmax(0,1fr)] items-center gap-5 border-b max-[600px]:grid-cols-[40px_minmax(0,1fr)] max-[600px]:gap-3.5"
              key={index}
            >
              <Skeleton className="size-12 rounded-xl max-[600px]:size-10 max-[600px]:rounded-[10px]" />
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-5 w-56 max-w-full" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="max-w-[560px] py-10" role="alert">
          <h3 className="mb-3 text-[20px]">Sources couldn’t be loaded.</h3>
          <p className="text-muted-foreground">
            {errorMessage ??
              "Try again to load your sources. A brief needs source data first."}
          </p>
        </div>
      ) : snapshot.items.length === 0 ? (
        <div className="max-w-[560px] py-10">
          <h3 className="mb-3 text-[20px]">
            {snapshot.coverage === "partial"
              ? "No sources available in this partial snapshot."
              : "No matching public activity."}
          </h3>
          <p className="text-muted-foreground">
            {snapshot.coverage === "partial"
              ? "Some collections could not be fully searched. Retry before concluding there is no matching work."
              : "No recent authored pull requests, open authored pull requests, or assigned issues were found. Private work is not included."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 list-none p-0">
          {snapshot.items.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              expanded={expandedId === source.id}
              onToggle={() => onToggle(source.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
