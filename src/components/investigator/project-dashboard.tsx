"use client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkArea, Inspector } from "@/components/dashboard/work-area";
import type { GitHubUser, ProjectSelection } from "@/lib/contracts";
import { sampleRecording } from "@/lib/sample-data";
import { ProjectSetup } from "./project-setup";
import { ProviderIcon } from "./provider-icon";
import { EvidenceSurface, dateLabel } from "./evidence-surface";
import { EvidenceDetails } from "./evidence-details";
import { Findings } from "./findings";
import { ImpactAssessment } from "./impact-assessment";
import { InvestigationLoading } from "./investigation-loading";
import { useProject } from "./use-project";

export function ProjectDashboard({
  sample = false,
  active = true,
  aiAvailable = true,
  notionAvailable = true,
  notionConnected = false,
  notice,
  initialRepository = "",
  onExpired,
}: {
  user?: GitHubUser;
  sample?: boolean;
  active?: boolean;
  aiAvailable?: boolean;
  notionAvailable?: boolean;
  notionConnected?: boolean;
  notice?: string;
  initialRepository?: string;
  onExpired?: () => void;
}) {
  const { state, run, invalidate, showSampleState } = useProject(sample);
  const [selection, setSelection] = useState<ProjectSelection>(
    sample
      ? sampleRecording.snapshot.selection
      : { repository: initialRepository, pageIds: [] },
  );
  const [editing, setEditing] = useState(!sample);
  const [connected, setConnected] = useState(notionConnected || sample);
  const [disconnectError, setDisconnectError] = useState("");
  const [selectedFinding, setSelectedFinding] = useState(0);
  const [inspection, setInspection] = useState<
    { kind: "finding" } | { kind: "source"; id: string } | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.expired) onExpired?.();
  }, [state.expired, onExpired]);
  useEffect(() => {
    if (!state.cooldownUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.cooldownUntil]);
  const cooling = state.cooldownUntil > now;
  const snapshot = state.snapshot,
    result = state.investigation,
    busy = !!state.busy;
  const usable =
    snapshot &&
    ["github", "notion"].every((provider) =>
      snapshot.evidence.some(
        (e) => e.provider === provider && e.passages.length > 0,
      ),
    );
  const scope = snapshot?.selection ?? selection;
  const finding =
    result?.output.findings[selectedFinding] ?? result?.output.findings[0];
  const references = finding
    ? [...finding.evidence, ...finding.counterevidencePassageIds]
    : [];
  const inspectedSource =
    inspection?.kind === "source"
      ? snapshot?.evidence.find((e) => e.id === inspection.id)
      : undefined;
  const evidence =
    snapshot?.evidence.filter((e) =>
      e.passages.some((p) => references.includes(p.id)),
    ) ?? [];
  async function disconnect() {
    invalidate(true, true);
    setInspection(null);
    setSelection((s) => ({ ...s, pageIds: [] }));
    setDisconnectError("");
    if (sample) {
      setConnected(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/notion/disconnect", {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      setConnected(false);
    } catch {
      setDisconnectError("Notion could not be disconnected. Try again.");
    }
  }
  function changeSelection(value: ProjectSelection) {
    invalidate();
    setInspection(null);
    setSelection(value);
  }
  function operate(operation: "sources" | "investigate") {
    setInspection(null);
    setSelectedFinding(0);
    void run(operation, scope);
  }
  const limitations = [
    ...new Set([
      ...(snapshot?.limitations ?? []),
      ...(result?.output.limitations ?? []),
    ]),
  ];
  return (
    <WorkArea
      inspector={
        active &&
        !editing &&
        inspection &&
        (inspectedSource || finding) && (
          <Inspector
            title={inspectedSource?.title ?? "Evidence"}
            titleClassName="text-ui-item"
            onClose={() => setInspection(null)}
          >
            {inspectedSource ? (
              <EvidenceDetails
                sources={[inspectedSource]}
                sample={sample}
                showTitle={false}
              />
            ) : (
              finding && (
                <>
                  <p className="mb-6 text-ui-item font-medium">
                    {finding.title}
                  </p>
                  <EvidenceDetails
                    sources={evidence}
                    references={references}
                    counterevidence={finding.counterevidencePassageIds}
                    sample={sample}
                  />
                  <section className="mt-6 border-t pt-5">
                    <h3 className="mb-2 text-ui-item">Still unknown</h3>
                    {finding.unknowns.map((unknown, index) => (
                      <p
                        key={index}
                        className="mb-3 text-ui-body text-muted-foreground"
                      >
                        {unknown}
                      </p>
                    ))}
                  </section>
                </>
              )
            )}
          </Inspector>
        )
      }
    >
      <div className="mb-10">
        <div className="flex items-start justify-between gap-6">
          <h1 className="text-ui-title tracking-[-0.03em]">Plan check</h1>
          {!sample && result && (
            <p className="shrink-0 pt-3 text-right text-ui-meta text-muted-foreground">
              Last checked{" "}
              <time dateTime={result.completedAt}>
                {dateLabel(result.completedAt)}
              </time>
            </p>
          )}
        </div>
        <p className="mt-2 text-ui-body text-muted-foreground">
          See where your Notion plans and GitHub work disagree.
        </p>
        {sample && (
          <p className="mt-3 text-ui-meta text-muted-foreground">
            Recorded example ·{" "}
            {dateLabel(sampleRecording.recordedAt ?? undefined)} · Synthetic
            sources, no live calls.
          </p>
        )}
      </div>
      <p className="sr-only" role="status">
        {editing
          ? "Choose your project sources."
          : state.busy === "sources"
            ? "Loading project sources."
            : state.busy === "investigate"
              ? "Checking project evidence."
              : state.busy === "impact"
                ? "Assessing proposed change."
                : result
                  ? `${result.output.findings.length} findings ready.`
                  : "Ready to inspect sources."}
      </p>
      {notice && (
        <p className="mb-5 text-ui-body" role="status">
          {notice}
        </p>
      )}
      {state.expired ? (
        <p role="alert">
          {state.error}{" "}
          <a href="/api/auth/github" className="underline">
            Reconnect GitHub
          </a>
        </p>
      ) : (
        <>
          {(state.error || state.message || disconnectError) && (
            <p
              className="mb-6 rounded-lg bg-secondary p-4 text-ui-body"
              role="alert"
            >
              {state.error || state.message || disconnectError}
              {state.notionExpired && !editing && (
                <button
                  className="ml-2 underline"
                  onClick={() => setEditing(true)}
                >
                  Reconnect Notion
                </button>
              )}
            </p>
          )}
          {editing && (
            <>
              {snapshot && (
                <button
                  className="mb-5 min-h-10 text-ui-body underline underline-offset-4"
                  onClick={() => setEditing(false)}
                >
                  {result ? "Back to results" : "Back to sources"}
                </button>
              )}
              <ProjectSetup
                selection={selection}
                knownPages={(snapshot?.evidence ?? []).flatMap((source) => {
                  const id = selection.pageIds.find(
                    (id) => source.id === `notion-${id}`,
                  );
                  return id
                    ? [
                        {
                          id,
                          title: source.title,
                          updatedAt: source.updatedAt ?? source.fetchedAt,
                          url: source.url,
                        },
                      ]
                    : [];
                })}
                onChange={changeSelection}
                onLoad={() => {
                  setEditing(false);
                  setInspection(null);
                  void run("sources", selection);
                }}
                onDisconnect={() => void disconnect()}
                connected={connected && !state.notionExpired}
                notionAvailable={notionAvailable}
                busy={busy || cooling}
                sample={sample}
              />
            </>
          )}
          <div hidden={editing}>
            <section
              aria-label="Selected project sources"
              className="mb-10 flex flex-wrap items-center gap-6 rounded-2xl bg-muted px-6 py-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background">
                  <ProviderIcon provider="github" />
                </span>
                <div className="min-w-0">
                  <p
                    className="truncate text-ui-body font-medium"
                    title={scope.repository}
                  >
                    {scope.repository || "No repository selected"}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-ui-meta text-muted-foreground">
                    <span className="inline-flex [&_svg]:size-4">
                      <ProviderIcon provider="notion" />
                    </span>
                    <span>
                      {scope.pageIds.length} Notion{" "}
                      {scope.pageIds.length === 1 ? "page" : "pages"} selected
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 text-foreground"
                  onClick={() => {
                    if (busy) invalidate(true);
                    setInspection(null);
                    setEditing(true);
                  }}
                >
                  Edit sources
                </Button>
                {snapshot && (
                  <Button
                    size="sm"
                    variant="ai"
                    className="h-11 px-5"
                    aria-busy={state.busy === "investigate"}
                    disabled={busy || cooling || !aiAvailable || !usable}
                    onClick={() => operate("investigate")}
                  >
                    {state.busy === "investigate"
                      ? "Checking…"
                      : sample
                        ? "Replay check"
                        : result
                          ? "Run again"
                          : "Run plan check"}
                  </Button>
                )}
              </div>
            </section>
            {result && snapshot ? (
              <Findings
                result={result}
                selected={selectedFinding}
                onSelect={(index) => {
                  setSelectedFinding(index);
                  setInspection({ kind: "finding" });
                }}
              />
            ) : state.busy === "investigate" ? (
              <InvestigationLoading />
            ) : (
              <section className="mb-10" aria-busy={busy}>
                <h2 className="text-ui-section">
                  {state.busy === "sources"
                    ? "Loading your sources…"
                    : snapshot && !usable
                      ? "More context is needed"
                      : snapshot
                        ? "Ready to check your plans"
                        : "Choose your project sources"}
                </h2>
                <p className="mt-3 text-ui-body text-muted-foreground">
                  {state.busy === "sources"
                    ? "Reading the selected repository and pages. No AI request yet."
                    : snapshot && !usable
                      ? "Plan check needs text from both GitHub and Notion. Edit sources to reconnect or choose other pages."
                      : snapshot
                        ? "Review the sources below, then run the check. Only this repository and your selected pages are included."
                        : "Edit sources to choose a repository and Notion pages."}
                </p>
                {!aiAvailable && snapshot && (
                  <p className="mt-3 text-ui-meta text-muted-foreground">
                    OpenAI is not configured. You can still inspect the sources.
                  </p>
                )}
              </section>
            )}
            {snapshot && (
              <>
                {result && (
                  <ImpactAssessment
                    enabled={(sample || !!state.receipt) && !cooling}
                    busy={busy}
                    result={state.impact}
                    snapshot={snapshot}
                    sample={sample}
                    onAssess={(question) => void run("impact", scope, question)}
                  />
                )}
                <EvidenceSurface
                  snapshot={snapshot}
                  sample={sample}
                  title="Project sources"
                  selectedId={inspectedSource?.id}
                  onSelectSource={(source) =>
                    setInspection({ kind: "source", id: source.id })
                  }
                />
                <Accordion
                  type="single"
                  collapsible
                  className="mt-6 border-t text-ui-meta text-muted-foreground"
                >
                  <AccordionItem value="coverage" className="border-0">
                    <AccordionTrigger className="py-3 text-ui-meta font-normal">
                      Coverage and limits
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="mt-3">
                        Sources fetched {dateLabel(snapshot.fetchedAt)}. Up to
                        ten recent GitHub issues and PRs, plus the selected
                        Notion pages. This is a bounded check, not a complete
                        project review.
                      </p>
                      {limitations.length > 0 && (
                        <ul className="mt-3 list-disc space-y-2 pl-5">
                          {limitations.map((limitation, index) => (
                            <li key={index}>{limitation}</li>
                          ))}
                        </ul>
                      )}
                      <button
                        className="mt-4 min-h-10 text-foreground underline underline-offset-4 disabled:opacity-40"
                        disabled={busy || cooling}
                        onClick={() => operate("sources")}
                      >
                        Refresh sources
                      </button>
                      <p>
                        Refreshing clears the check and impact. Results stay in
                        this page only.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
          </div>
          {cooling && (
            <p className="mt-3 text-ui-meta" role="status">
              Wait {Math.max(1, Math.ceil((state.cooldownUntil - now) / 1000))}{" "}
              seconds before retrying.
            </p>
          )}
        </>
      )}
      {sample && (
        <Accordion
          type="single"
          collapsible
          className="mt-8 border-t text-ui-meta text-muted-foreground"
        >
          <AccordionItem value="example-options" className="border-0">
            <AccordionTrigger className="py-3 text-ui-meta font-normal">
              Example options
            </AccordionTrigger>
            <AccordionContent>
              <p className="mt-3">
                Recorded findings use synthetic sources. Other states below are
                simulated. Original source links are disabled.
              </p>
              <label htmlFor="sample-state" className="mt-3 block">
                Explore sample states
              </label>
              <select
                id="sample-state"
                className="mt-2 rounded-lg border p-2 text-foreground"
                defaultValue="ready"
                onChange={(event) => {
                  setEditing(false);
                  setInspection(null);
                  setSelectedFinding(0);
                  showSampleState(event.target.value);
                }}
              >
                <option value="ready">Recorded findings</option>
                <option value="before">Before check</option>
                <option value="no-findings">No findings</option>
                <option value="partial">Partial retrieval</option>
                <option value="error">Model failure</option>
                <option value="empty">Insufficient context</option>
              </select>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </WorkArea>
  );
}
