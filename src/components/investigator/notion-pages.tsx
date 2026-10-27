"use client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  ListChecks,
  LockKeyhole,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderIcon } from "./provider-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PageOption, PageOptions } from "@/lib/contracts";
import { dateLabel } from "./evidence-surface";

export function NotionPages({
  repository,
  selected,
  knownPages,
  onChange,
  onDisconnect,
  connected,
  available,
  disabled,
  sample,
}: {
  repository: string;
  selected: string[];
  knownPages: PageOption[];
  onChange: (ids: string[]) => void;
  onDisconnect: () => void;
  connected: boolean;
  available: boolean;
  disabled: boolean;
  sample: boolean;
}) {
  const [pages, setPages] = useState(knownPages);
  const [initialSelection] = useState(selected);
  const [loading, setLoading] = useState(connected && !sample);
  const [loaded, setLoaded] = useState(sample);
  const [error, setError] = useState("");
  const [capped, setCapped] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const waiting = retryAt > 0;
  const request = useRef<AbortController | null>(null);
  const load = useCallback(
    (keep: string[], controller: AbortController) =>
      fetch("/api/project/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body: PageOptions & { message?: string; retryAfter?: number } =
            await response.json();
          if (request.current !== controller || controller.signal.aborted)
            return;
          if (!response.ok) {
            setError(
              body.message ?? "Shared pages could not be loaded. Try again.",
            );
            if (body.retryAfter) {
              setRetryAt(Date.now() + body.retryAfter * 1000);
            }
            return;
          }
          setPages((previous) => [
            ...new Map(
              [
                ...previous.filter((page) => keep.includes(page.id)),
                ...body.pages,
              ].map((page) => [page.id, page]),
            ).values(),
          ]);
          setCapped(body.capped);
          setLoaded(true);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Shared pages could not be loaded. Check your connection and retry.",
            );
        })
        .finally(() => {
          if (request.current === controller && !controller.signal.aborted)
            setLoading(false);
        }),
    [],
  );
  function beginLoad(keep: string[]) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    void load(keep, controller);
  }
  useEffect(() => {
    if (!connected || sample) return;
    const controller = new AbortController();
    request.current = controller;
    void load(initialSelection, controller);
    return () => request.current?.abort();
  }, [connected, sample, load, initialSelection]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(
      () => setRetryAt(0),
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const connectAction = `/api/auth/notion${repository ? `?repository=${encodeURIComponent(repository)}` : ""}`;
  return (
    <Card
      className="gap-0 overflow-hidden rounded-[20px] bg-secondary py-0"
      role="group"
      aria-labelledby="notion-setup-title"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-secondary py-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-background">
            <ProviderIcon provider="notion" />
          </span>
          <div>
            <p className="mb-1 text-ui-meta text-muted-foreground">
              Step 2 · Plans
            </p>
            <CardTitle>
              <h3 id="notion-setup-title" className="text-ui-item font-medium">
                Notion
              </h3>
            </CardTitle>
          </div>
        </div>
        <Badge
          className="bg-background"
          variant={connected && !error ? "secondary" : "outline"}
        >
          {connected && !error && <Check aria-hidden />}
          {sample && connected
            ? "Example connection"
            : error
              ? "Needs attention"
              : connected
                ? "Connected"
                : available
                  ? "Connect to continue"
                  : "Unavailable"}
        </Badge>
      </CardHeader>
      <CardContent className="rounded-[18px] border-t bg-background p-6 shadow-[0_-2px_8px_rgb(0_0_0/3%)]">
        {!connected ? (
          <div>
            {available ? (
              <>
                <ol
                  className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-5"
                  aria-label="Notion connection steps"
                >
                  <li className="flex flex-1 items-center justify-between gap-2">
                    <span className="flex flex-1 flex-col items-center gap-2 text-center text-ui-meta">
                      <ArrowUpRight className="size-5" aria-hidden />
                      Open Notion
                    </span>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </li>
                  <li className="flex flex-1 items-center justify-between gap-2">
                    <span className="flex flex-1 flex-col items-center gap-2 text-center text-ui-meta">
                      <FileText className="size-5" aria-hidden />
                      Share pages
                    </span>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </li>
                  <li className="flex flex-1 flex-col items-center gap-2 text-center text-ui-meta">
                    <ListChecks className="size-5" aria-hidden />
                    Choose pages here
                  </li>
                </ol>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <form action={connectAction} method="post">
                    <Button type="submit" disabled={disabled}>
                      Connect Notion <ArrowUpRight aria-hidden />
                    </Button>
                  </form>
                  <p className="inline-flex items-center gap-2 text-ui-meta text-muted-foreground">
                    <LockKeyhole className="size-4" aria-hidden />
                    Read-only access
                  </p>
                </div>
                <p className="mt-3 text-ui-meta text-muted-foreground">
                  Your repository choice is kept when you return.
                </p>
              </>
            ) : (
              <div className="rounded-xl bg-muted px-4 py-4 text-ui-body">
                <p>Notion connection hasn’t been enabled for this app yet.</p>
                <p className="mt-1 text-ui-meta text-muted-foreground">
                  You can still preview GitHub sources.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {!sample && (
              <p className="text-ui-body">
                Choose up to five pages for this project.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-ui-meta">
              <p
                className="inline-flex items-center gap-1.5 font-medium"
                role="status"
              >
                {selected.length > 0 && (
                  <Check className="size-3.5" aria-hidden />
                )}
                {selected.length} of 5 pages selected
              </p>
              {selected.length > 0 && !sample && (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => onChange([])}
                  disabled={disabled || loading}
                >
                  Clear selection
                </button>
              )}
            </div>
            {loading && (
              <p
                className="mt-4 text-ui-meta text-muted-foreground"
                role="status"
              >
                Loading shared pages…
              </p>
            )}
            {error && (
              <div
                className="mt-4 rounded-xl bg-muted p-4 text-ui-meta"
                role="alert"
              >
                <p>{error}</p>
                <Button
                  variant="link"
                  size="sm"
                  disabled={waiting || loading}
                  onClick={() => beginLoad(selected)}
                >
                  Try loading pages again
                </Button>
                {waiting && (
                  <p>Wait for Notion’s retry delay before trying again.</p>
                )}
                <form action={connectAction} method="post">
                  <button
                    type="submit"
                    className="block underline underline-offset-4"
                  >
                    Reconnect Notion{" "}
                    <ArrowUpRight className="inline size-3" aria-hidden />
                  </button>
                </form>
              </div>
            )}
            {loaded && !loading && !error && pages.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed p-4 text-ui-body">
                <p>No shared pages are available yet.</p>
                <p className="mt-1 text-ui-meta text-muted-foreground">
                  Manage page access in Notion, then reload this list.
                </p>
              </div>
            )}
            {pages.length > 0 && (
              <div
                className="mt-3 max-h-[360px] space-y-2 overflow-y-auto p-1"
                aria-busy={loading}
                role="group"
                aria-label="Shared Notion pages"
              >
                {pages.map((page) => {
                  const checked = selected.includes(page.id);
                  const unavailable =
                    sample ||
                    disabled ||
                    loading ||
                    (!checked && selected.length >= 5);
                  return (
                    <label
                      key={page.id}
                      htmlFor={`notion-page-${page.id}`}
                      className={`flex items-center gap-4 rounded-xl p-4 text-ui-body ${checked ? "bg-secondary" : "border-border bg-background hover:bg-muted"} ${unavailable ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background">
                        <FileText
                          className="size-5 text-muted-foreground"
                          aria-hidden
                        />
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        <span
                          id={`notion-page-title-${page.id}`}
                          className="block font-medium"
                        >
                          {page.title}
                        </span>
                        <span
                          id={`notion-page-date-${page.id}`}
                          className="text-ui-meta text-muted-foreground"
                        >
                          Updated {dateLabel(page.updatedAt)}
                        </span>
                      </span>
                      <Checkbox
                        id={`notion-page-${page.id}`}
                        aria-labelledby={`notion-page-title-${page.id}`}
                        aria-describedby={`notion-page-date-${page.id}`}
                        checked={checked}
                        disabled={unavailable}
                        onCheckedChange={(value) =>
                          onChange(
                            value === true
                              ? [...selected, page.id]
                              : selected.filter((id) => id !== page.id),
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            )}
            {selected
              .filter((id) => !pages.some((page) => page.id === id))
              .map((id) => (
                <p className="mt-2 text-ui-meta" key={id}>
                  A selected page is unavailable in this list.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      onChange(
                        selected.filter((selectedId) => selectedId !== id),
                      )
                    }
                  >
                    Remove selection
                  </button>
                </p>
              ))}
            {capped && (
              <p className="mt-2 text-ui-meta text-muted-foreground">
                This list is limited to 30 shared pages. Manage page access in
                Notion to narrow it, then reload.
              </p>
            )}
            {selected.length >= 5 && (
              <p className="mt-2 text-ui-meta text-muted-foreground">
                Five-page limit reached. Remove a page to choose another.
              </p>
            )}
            {!sample && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-ui-meta">
                <form action={connectAction} method="post">
                  <button
                    type="submit"
                    className="underline underline-offset-4"
                    disabled={disabled}
                  >
                    Manage page access{" "}
                    <ArrowUpRight className="inline size-3" aria-hidden />
                  </button>
                </form>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  disabled={loading || waiting || disabled}
                  onClick={() => beginLoad(selected)}
                >
                  Reload pages
                </button>
                <Accordion type="single" collapsible className="ml-auto">
                  <AccordionItem
                    value="connection-settings"
                    className="border-0"
                  >
                    <AccordionTrigger className="py-3 text-ui-meta font-normal underline underline-offset-4">
                      Connection settings
                    </AccordionTrigger>
                    <AccordionContent>
                      <button
                        type="button"
                        className="mt-3 min-h-9 underline underline-offset-4"
                        disabled={disabled}
                        onClick={onDisconnect}
                      >
                        Disconnect Notion
                      </button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
