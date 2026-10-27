"use client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RepositoryOption, RepositoryOptions } from "@/lib/contracts";
export function RepositoryPicker({
  value,
  onChange,
  disabled,
  sample,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  sample: boolean;
}) {
  const [repositories, setRepositories] = useState<RepositoryOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const waiting = retryAt > 0;
  const request = useRef<AbortController | null>(null);
  const load = useCallback(
    (query: string, controller: AbortController) =>
      fetch("/api/project/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body: RepositoryOptions & {
            message?: string;
            retryAfter?: number;
          } = await response.json();
          if (request.current !== controller || controller.signal.aborted)
            return;
          if (!response.ok) {
            setError(
              body.message ?? "Repositories could not be loaded. Try again.",
            );
            if (body.retryAfter) {
              setRetryAt(Date.now() + body.retryAfter * 1000);
            }
            return;
          }
          setRepositories(body.repositories);
          setHint(
            !body.repositories.length
              ? query
                ? "No public repositories match. Try another name or owner/repository."
                : "No public repositories were found for this account. Use Find another public repository below."
              : query
                ? `${body.repositories.length} public repositories found.${body.capped ? " Refine your search to see other matches." : ""}`
                : body.capped
                  ? "Showing up to 30 recently updated public repositories. Search below for another."
                  : "Your public repositories, ordered by recent updates.",
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Repositories could not be loaded. Check your connection and retry.",
            );
        })
        .finally(() => {
          if (request.current === controller && !controller.signal.aborted)
            setLoading(false);
        }),
    [],
  );
  function beginLoad(query: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    void load(query, controller);
  }
  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    request.current = controller;
    void load("", controller);
    return () => request.current?.abort();
  }, [load, sample]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(
      () => setRetryAt(0),
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const listed = repositories.some((repo) => repo.fullName === value);
  return (
    <div>
      <label className="block text-ui-body font-medium" htmlFor="repository">
        GitHub repository
      </label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || loading}
      >
        <SelectTrigger
          id="repository"
          className="mt-2"
          aria-describedby="repository-hint"
        >
          <SelectValue
            placeholder={
              loading
                ? "Loading public repositories…"
                : "Choose a public repository"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {value && !listed && <SelectItem value={value}>{value}</SelectItem>}
          {repositories.map((repo) => (
            <SelectItem key={repo.fullName} value={repo.fullName}>
              {repo.fullName}
            </SelectItem>
          ))}
          {!value && !repositories.length && (
            <SelectItem value="unavailable" disabled>
              No repositories available
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <p
        className="mt-2 text-ui-meta text-muted-foreground"
        id="repository-hint"
        role="status"
      >
        {sample
          ? "This recorded example uses a fixed synthetic repository."
          : loading
            ? "Loading from your connected GitHub account."
            : hint || "Choose the repository for this investigation."}
      </p>
      {error && (
        <div className="mt-3 text-ui-meta" role="alert">
          <p>{error}</p>
          <Button
            variant="link"
            size="sm"
            disabled={loading || waiting}
            onClick={() => beginLoad(query)}
          >
            Retry repositories
          </Button>
          {waiting && (
            <p className="text-ui-meta text-muted-foreground">
              Wait for GitHub’s retry delay before searching again.
            </p>
          )}
        </div>
      )}
      {!sample && (
        <Accordion type="single" collapsible className="mt-3 text-ui-meta">
          <AccordionItem value="repository-search" className="border-0">
            <AccordionTrigger className="py-3 text-ui-meta font-normal text-muted-foreground underline underline-offset-4">
              Find another public repository
            </AccordionTrigger>
            <AccordionContent>
              <form
                className="mt-3 flex gap-2 max-[600px]:flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!waiting && !loading) beginLoad(query.trim());
                }}
              >
                <label htmlFor="repository-query" className="sr-only">
                  Search public repositories
                </label>
                <input
                  id="repository-query"
                  className="min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-ui-body"
                  value={query}
                  placeholder="Search by name or owner/repository"
                  maxLength={140}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  className="h-12"
                  disabled={loading || waiting || disabled}
                >
                  Search GitHub
                </Button>
              </form>
              <p className="mt-2 text-ui-meta text-muted-foreground">
                Search results appear in the repository dropdown above.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
