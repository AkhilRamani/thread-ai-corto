"use client";
import { useCallback, useEffect, useState } from "react";
import type { Evidence, SourceItem } from "@/lib/contracts";
import { sampleRecording } from "@/lib/sample-data";
import { EvidenceDetails } from "@/components/investigator/evidence-details";
import { dateLabel } from "@/components/investigator/evidence-surface";
import { Button } from "@/components/ui/button";

export function WorkDetails({
  item,
  sample,
  onExpired,
}: {
  item: SourceItem;
  sample: boolean;
  onExpired?: () => void;
}) {
  const [state, setState] = useState<{
    source?: Evidence;
    discussion?: Evidence[];
    error?: string;
    retryAt?: number;
  }>({});
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(
    (signal: AbortSignal) =>
      fetch("/api/github/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: item.repository,
          number: item.number,
        }),
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(22_000)]),
      })
        .then(async (response) => {
          const data = await response.json();
          if (signal.aborted) return;
          if (response.status === 401) {
            onExpired?.();
            return;
          }
          setState(
            response.ok && !data.error
              ? data
              : {
                  error: data.message ?? "Details could not be loaded.",
                  retryAt: data.retryAfter
                    ? Date.now() + data.retryAfter * 1000
                    : undefined,
                },
          );
        })
        .catch(() => {
          if (!signal.aborted)
            setState({ error: "Details could not be loaded. Try again." });
        }),
    [item.repository, item.number, onExpired],
  );
  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, sample, attempt]);
  useEffect(() => {
    if (!state.retryAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, state.retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.retryAt]);
  const discussion = sample
    ? sampleRecording.snapshot.evidence
        .filter(
          (e) =>
            item.number === 142 &&
            e.provider === "github" &&
            e.layer === "detail" &&
            ["comment", "review"].includes(e.kind),
        )
        .slice(0, 3)
    : state.discussion;
  return (
    <>
      <p className="text-ui-meta text-muted-foreground">
        {item.kind === "pull-request" ? "PR" : "Issue"} #{item.number} ·{" "}
        {item.repository}
      </p>
      {!sample && item.url && (
        <a
          className="mt-3 inline-block text-ui-body underline underline-offset-4"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          Open in GitHub
        </a>
      )}
      <dl className="my-6 grid grid-cols-[80px_1fr] gap-y-2 border-y py-5 text-ui-body">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{state.source?.status ?? item.status}</dd>
        {(state.source?.author ?? item.author) && (
          <>
            <dt className="text-muted-foreground">Author</dt>
            <dd>{state.source?.author ?? item.author}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Updated</dt>
        <dd>{dateLabel(state.source?.updatedAt ?? item.updatedAt)}</dd>
      </dl>
      <h3 className="mb-3 text-ui-item">Description</h3>
      <p className="whitespace-pre-wrap text-ui-body break-words">
        {(state.source?.passages[0]?.text ?? item.description) ||
          "No description supplied."}
      </p>
      <h3 className="mt-7 mb-4 border-t pt-6 text-ui-item">
        Discussion and reviews
      </h3>
      {sample && (
        <p className="mb-4 text-ui-meta text-muted-foreground">
          Illustrative synthetic discussion. No live source is linked.
        </p>
      )}
      {state.error ? (
        <div role="alert" className="text-ui-body">
          <p>{state.error}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            disabled={!!state.retryAt && state.retryAt > now}
            onClick={() => {
              setState({});
              setAttempt((n) => n + 1);
            }}
          >
            Retry details
          </Button>
          {!!state.retryAt && state.retryAt > now && (
            <p className="mt-2 text-ui-meta">
              Wait for the provider cooldown before retrying.
            </p>
          )}
        </div>
      ) : !discussion ? (
        <p role="status" className="text-ui-body text-muted-foreground">
          Loading discussion…
        </p>
      ) : discussion.length ? (
        <EvidenceDetails sources={discussion} sample={sample} />
      ) : (
        <p className="text-ui-body text-muted-foreground">
          No discussion entries were returned in the inspected page.
        </p>
      )}
      {state.source?.limitations.length ? (
        <p className="mt-5 text-ui-meta text-muted-foreground">
          {state.source.limitations.join(" ")}
        </p>
      ) : null}
    </>
  );
}
