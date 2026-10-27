import "server-only";
import { createHash } from "node:crypto";
import type {
  Evidence,
  EvidenceRead,
  ProjectSelection,
  ProjectSnapshot,
  TraceEntry,
} from "@/lib/contracts";
import { limits } from "@/lib/limits";
import { RequestBudget } from "./http";
import {
  explicitReferences,
  readDiscussion,
  readFiles,
  readReferencedItem,
  recentGitHubWork,
  verifyRepository,
} from "./github";
import { readNotionPage } from "./notion";
import { ProjectError } from "./errors";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => key !== "fetchedAt" && v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, stable(v)]),
    );
  return value;
}
export function fingerprint(snapshot: ProjectSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable({
          selection: {
            ...snapshot.selection,
            pageIds: [...snapshot.selection.pageIds].sort(),
          },
          evidence: [...snapshot.evidence].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }),
      ),
    )
    .digest("hex");
}
export function modelEvidence(snapshot: ProjectSnapshot) {
  return snapshot.evidence.map(
    ({ fetchedAt: _fetchedAt, url: _url, ...item }) => {
      void _fetchedAt;
      void _url;
      return item;
    },
  );
}
export function addEvidence(snapshot: ProjectSnapshot, items: Evidence[]) {
  for (const item of items) {
    if (snapshot.evidence.some((e) => e.id === item.id)) continue;
    snapshot.evidence.push(item);
    while (
      JSON.stringify(modelEvidence(snapshot)).length >
        limits.evidenceCharacters &&
      item.passages.length
    ) {
      const last = item.passages.at(-1)!;
      const overflow =
        JSON.stringify(modelEvidence(snapshot)).length -
        limits.evidenceCharacters;
      if (last.text.length > overflow + 200)
        last.text = last.text.slice(0, last.text.length - overflow - 150);
      else item.passages.pop();
      if (
        !item.limitations.includes(
          "Total evidence budget reached; content was omitted.",
        )
      )
        item.limitations.push(
          "Total evidence budget reached; content was omitted.",
        );
    }
    if (
      JSON.stringify(modelEvidence(snapshot)).length > limits.evidenceCharacters
    ) {
      snapshot.evidence.pop();
      snapshot.limitations.push(
        "Total evidence budget reached; some sources were omitted.",
      );
      break;
    }
  }
  snapshot.fingerprint = fingerprint(snapshot);
}
export async function loadProject(
  selection: ProjectSelection,
  githubToken: string,
  notionToken: string | undefined,
  budget: RequestBudget,
  now = new Date(),
): Promise<ProjectSnapshot> {
  const repository = await verifyRepository(
    selection.repository,
    githubToken,
    budget,
  );
  const snapshot: ProjectSnapshot = {
    selection: { repository, pageIds: [...selection.pageIds].sort() },
    repositoryUrl: `https://github.com/${repository}`,
    evidence: [],
    fetchedAt: new Date().toISOString(),
    fingerprint: "",
    limitations: [],
    trace: [
      {
        operation: "Verify public repository",
        outcome: "ok",
        sourceIds: [],
        detail: repository,
      },
    ],
  };
  const jobs = [
    {
      label: "Load recent GitHub work",
      provider: "github",
      run: async () => {
        const result = await recentGitHubWork(
          repository,
          githubToken,
          budget,
          now,
        );
        snapshot.limitations.push(...result.limitations);
        return result.evidence;
      },
    },
    ...selection.pageIds.map((id) => ({
      label: "Read selected Notion page",
      provider: "notion",
      run: async () => {
        if (!notionToken)
          throw new ProjectError(
            "notion",
            "not-connected",
            "Connect Notion and select readable pages to investigate across services.",
          );
        return [await readNotionPage(id, notionToken, budget)];
      },
    })),
  ];
  const results = await Promise.allSettled(jobs.map((job) => job.run()));
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const job = jobs[index];
    if (result.status === "fulfilled") {
      addEvidence(snapshot, result.value);
      const partial = result.value.some((e) => e.limitations.length > 0);
      snapshot.trace.push({
        operation: job.label,
        outcome: partial ? "partial" : "ok",
        sourceIds: result.value.map((e) => e.id),
        detail: `${result.value.length} source(s) returned.`,
      });
    } else {
      const error = result.reason;
      if (
        error instanceof ProjectError &&
        error.provider === "github" &&
        error.code === "unauthorized"
      )
        throw error;
      const detail =
        error instanceof ProjectError
          ? error.message
          : `${job.provider} content could not be read.`;
      snapshot.limitations.push(detail);
      if (error instanceof ProjectError && error.provider !== "model")
        (snapshot.sourceErrors ??= []).push({
          provider: error.provider,
          code: error.code,
          message: detail,
        });
      if (error instanceof ProjectError && error.retryAfter)
        snapshot.retryAfter = Math.max(
          snapshot.retryAfter ?? 0,
          error.retryAfter,
        );
      snapshot.trace.push({
        operation: job.label,
        outcome: "failed",
        sourceIds: [],
        detail,
      });
    }
  }
  if (!selection.pageIds.length)
    snapshot.limitations.push(
      "No Notion pages selected. GitHub sources remain inspectable.",
    );
  snapshot.fingerprint = fingerprint(snapshot);
  return snapshot;
}
export function hasProjectContext(snapshot: ProjectSnapshot) {
  return ["github", "notion"].every((provider) =>
    snapshot.evidence.some((e) => e.provider === provider && e.passages.length),
  );
}
export function createEvidenceReader(
  snapshot: ProjectSnapshot,
  githubToken: string,
  budget: RequestBudget,
  previousReads: EvidenceRead[] = [],
) {
  const seen = new Set(previousReads.map((r) => JSON.stringify(r)));
  const deep = new Set(
    previousReads
      .filter((r) => r.operation !== "reference")
      .map((r) => r.sourceId),
  );
  const historical = new Set(
    previousReads.flatMap((r) => (r.reference ? [r.reference] : [])),
  );
  const completed: EvidenceRead[] = [];
  let attempts = 0;
  async function read(request: EvidenceRead): Promise<TraceEntry> {
    const key = JSON.stringify(request);
    const operation = `${request.operation}: ${request.sourceId}${request.reference ? ` → #${request.reference}` : ""}`;
    try {
      if (++attempts > limits.readAttempts || seen.has(key))
        throw new Error("Duplicate read or read-attempt limit reached.");
      seen.add(key);
      const parent = snapshot.evidence.find((e) => e.id === request.sourceId);
      if (!parent) throw new Error("Unknown source identifier.");
      let items: Evidence[];
      if (request.operation === "reference") {
        if (
          !request.reference ||
          !explicitReferences([parent], snapshot.selection.repository).has(
            request.reference,
          )
        )
          throw new Error(
            "Only explicit same-repository references in this source can be opened.",
          );
        if (
          historical.has(request.reference) ||
          historical.size >= limits.historicalItems ||
          snapshot.evidence.some((e) => e.number === request.reference)
        )
          throw new Error(
            "Reference already loaded or historical-item limit reached.",
          );
        historical.add(request.reference);
        items = [
          await readReferencedItem(
            request.reference,
            snapshot.selection.repository,
            githubToken,
            budget,
          ),
        ];
      } else {
        if (
          request.reference !== null ||
          parent.provider !== "github" ||
          !["issue", "pull-request"].includes(parent.kind)
        )
          throw new Error(
            "Discussion and file reads require a known GitHub work item.",
          );
        if (!deep.has(parent.id) && deep.size >= limits.deepItems)
          throw new Error("Deeper work-item limit reached.");
        deep.add(parent.id);
        if (request.operation === "files" && parent.kind !== "pull-request")
          throw new Error("Only selected pull requests have changed files.");
        if (request.operation === "files" && budget.max - budget.used < 3)
          throw new Error(
            "Changed-file reads require three requests; the current budget is insufficient.",
          );
        items = await (
          request.operation === "files" ? readFiles : readDiscussion
        )(parent, snapshot.selection.repository, githubToken, budget);
      }
      addEvidence(snapshot, items);
      completed.push(request);
      if (budget.rateLimit?.retryAfter)
        snapshot.retryAfter = budget.rateLimit.retryAfter;
      return {
        operation,
        outcome: "ok",
        sourceIds: [
          parent.id,
          ...items
            .filter((e) => snapshot.evidence.some((s) => s.id === e.id))
            .map((e) => e.id),
        ],
        detail: `${items.length} additional sources returned; coverage is attached to each source.`,
      };
    } catch (error) {
      if (error instanceof ProjectError && error.code === "unauthorized")
        throw error;
      const detail =
        error instanceof ProjectError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Evidence read failed.";
      if (error instanceof ProjectError && error.retryAfter)
        snapshot.retryAfter = error.retryAfter;
      snapshot.limitations.push(detail);
      return { operation, outcome: "failed", sourceIds: [], detail };
    } finally {
      snapshot.fingerprint = fingerprint(snapshot);
    }
  }
  return {
    completed,
    read: async (request: EvidenceRead) => {
      const entry = await read(request);
      snapshot.trace.push(entry);
      return entry;
    },
    remainingRequests: () => Math.max(0, budget.max - budget.used),
    canRead: () =>
      attempts < limits.readAttempts &&
      budget.used < budget.max &&
      !budget.signal.aborted,
  };
}
