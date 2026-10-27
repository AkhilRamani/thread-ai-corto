import "server-only";
import { z } from "zod";
import type {
  SourceItem,
  SourceSnapshot,
  SourceCollection,
} from "@/lib/contracts";
import { sourceSelection } from "@/lib/source-selection";
import { githubUserSchema } from "./session";
import {
  githubRequest,
  verifyRepository,
  normalizeGitHubItem,
  readDiscussion,
} from "./github";
import { ProjectError } from "./errors";
import { RequestBudget } from "./http";
const githubError = (code: string, retryAfter?: number) =>
  new ProjectError(
    "github",
    code,
    code === "unauthorized"
      ? "Reconnect GitHub to continue."
      : "GitHub could not return these sources. Try again when ready.",
    retryAfter,
  );
const itemSchema = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().optional(),
  updated_at: z.iso.datetime(),
  html_url: z.url(),
  repository_url: z.url(),
  labels: z.array(z.object({ name: z.string() })).default([]),
  user: z.object({ login: z.string() }).nullable().optional(),
  created_at: z.iso.datetime().optional(),
  pull_request: z.object({ merged_at: z.iso.datetime().nullish() }).optional(),
});
const searchSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(itemSchema),
});

function normalize(item: z.infer<typeof itemSchema>): SourceItem {
  const repo = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)$/.exec(
    item.repository_url,
  )?.[1];
  const kind = item.pull_request ? "pull-request" : "issue";
  const expectedUrl = `https://github.com/${repo}/${kind === "pull-request" ? "pull" : "issues"}/${item.number}`;
  // Never expose arbitrary provider URLs as browser links or fetch their targets.
  if (!repo || item.html_url !== expectedUrl) throw githubError("unavailable");
  return {
    id: `github-${item.id}`,
    kind,
    repository: repo,
    number: item.number,
    title: item.title.slice(0, 256),
    author: item.user?.login,
    createdAt: item.created_at,
    description: (item.body ?? "").slice(0, 2000),
    labels: item.labels.slice(0, 10).map((label) => label.name.slice(0, 50)),
    status: item.pull_request?.merged_at
      ? "Merged"
      : item.state === "closed"
        ? "Closed"
        : kind === "issue"
          ? "Assigned"
          : item.draft
            ? "Draft"
            : "Open",
    updatedAt: item.updated_at,
    url: expectedUrl,
  };
}

export async function getGitHubSnapshot(
  token: string,
  login: string,
  signal: AbortSignal = AbortSignal.timeout(20_000),
): Promise<SourceSnapshot> {
  const budget = new RequestBudget(3, signal);
  // Only a verified session identity reaches the queries. Never accept a login from a request.
  githubUserSchema.shape.login.parse(login);
  const since = new Date(
    Date.now() - sourceSelection.recentDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const selections = [
    {
      label: "Recently updated authored PRs",
      query: `is:pr author:${login} updated:>=${since}`,
      limit: sourceSelection.recentPRs,
    },
    {
      label: "Open authored PRs",
      query: `is:pr is:open author:${login}`,
      limit: sourceSelection.openPRs,
    },
    {
      label: "Open assigned issues",
      query: `is:issue is:open assignee:${login}`,
      limit: sourceSelection.assignedIssues,
    },
  ];
  const results = await Promise.allSettled(
    selections.map(async (selection) => {
      const params = new URLSearchParams({
        q: `is:public ${selection.query}`,
        sort: "updated",
        order: "desc",
        per_page: String(selection.limit),
        page: "1",
      });
      const parsed = searchSchema.safeParse(
        await githubRequest(`/search/issues?${params}`, token, budget),
      );
      if (!parsed.success) throw githubError("unavailable");
      const items = parsed.data.items.slice(0, selection.limit).map(normalize);
      const collection: SourceCollection = {
        label: selection.label,
        limit: selection.limit,
        total: parsed.data.total_count,
        returned: items.length,
        capped: parsed.data.total_count > selection.limit,
        incomplete: parsed.data.incomplete_results,
      };
      return { items, collection };
    }),
  );
  const failures = results.filter((result) => result.status === "rejected");
  if (
    failures.some(
      (result) =>
        result.reason instanceof ProjectError &&
        result.reason.code === "unauthorized",
    )
  ) {
    throw githubError("unauthorized");
  }
  const retryAfter = Math.max(
    0,
    ...failures.map((result) =>
      result.reason instanceof ProjectError
        ? (result.reason.retryAfter ?? 0)
        : 0,
    ),
  );
  if (failures.length === results.length) {
    throw retryAfter
      ? githubError("rate-limited", retryAfter)
      : githubError("unavailable");
  }
  const items = new Map<string, SourceItem>();
  const collections = results.map((result, index): SourceCollection => {
    if (result.status === "fulfilled") {
      for (const item of result.value.items) {
        const previous = items.get(item.id);
        if (!previous || item.updatedAt > previous.updatedAt)
          items.set(item.id, item);
      }
      return result.value.collection;
    }
    return {
      label: selections[index].label,
      limit: selections[index].limit,
      total: null,
      returned: 0,
      capped: false,
      incomplete: false,
      error:
        result.reason instanceof ProjectError
          ? result.reason.message
          : "This collection could not be retrieved.",
    };
  });
  return {
    items: [...items.values()].sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    ),
    fetchedAt: new Date().toISOString(),
    collections,
    ...(retryAfter ? { retryAfter } : {}),
    coverage: collections.some(
      (collection) => collection.error || collection.incomplete,
    )
      ? "partial"
      : "complete",
  };
}

// Public visibility and canonical source identity are rechecked for every detail read.
export async function getWorkItemDetails(
  repository: string,
  number: number,
  token: string,
  signal: AbortSignal,
) {
  const budget = new RequestBudget(6, signal);
  const canonical = await verifyRepository(repository, token, budget);
  const source = normalizeGitHubItem(
    await githubRequest(`/repos/${canonical}/issues/${number}`, token, budget),
    canonical,
  );
  const discussion = await readDiscussion(source, canonical, token, budget);
  return { source, discussion };
}
