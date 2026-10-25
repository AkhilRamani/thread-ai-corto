import "server-only";
import { z } from "zod";
import type {
  SourceCollection,
  SourceErrorCode,
  SourceItem,
  SourceSnapshot,
} from "@/lib/contracts";
import { sourceSelection } from "@/lib/source-selection";
import { githubUserSchema } from "./session";

export class GitHubError extends Error {
  constructor(
    public code: SourceErrorCode,
    public retryAfter?: number,
  ) {
    super(
      code === "unauthorized"
        ? "Your GitHub connection has expired. Reconnect to continue."
        : code === "rate-limited"
          ? "GitHub is limiting requests. Wait a little before refreshing."
          : "GitHub could not return these sources. Please try again.",
    );
  }
}

export async function githubRequest(
  path: string,
  token: string,
): Promise<unknown> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) throw new GitHubError("unauthorized");
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
    ) {
      const seconds = Number(response.headers.get("retry-after"));
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      const wait =
        seconds > 0 ? seconds : Math.ceil((reset - Date.now()) / 1000);
      throw new GitHubError(
        "rate-limited",
        Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 60,
      );
    }
    if (!response.ok) throw new GitHubError("unavailable");
    return await response.json();
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError("unavailable");
  }
}

export async function getGitHubUser(token: string) {
  const parsed = githubUserSchema.safeParse(
    await githubRequest("/user", token),
  );
  if (!parsed.success) throw new GitHubError("unavailable");
  return parsed.data;
}

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
  if (!repo || item.html_url !== expectedUrl)
    throw new GitHubError("unavailable");
  return {
    id: `github-${item.id}`,
    kind,
    repository: repo,
    number: item.number,
    title: item.title.slice(0, 256),
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
): Promise<SourceSnapshot> {
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
        await githubRequest(`/search/issues?${params}`, token),
      );
      if (!parsed.success) throw new GitHubError("unavailable");
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
        result.reason instanceof GitHubError &&
        result.reason.code === "unauthorized",
    )
  ) {
    throw new GitHubError("unauthorized");
  }
  const retryAfter = Math.max(
    0,
    ...failures.map((result) =>
      result.reason instanceof GitHubError
        ? (result.reason.retryAfter ?? 0)
        : 0,
    ),
  );
  if (failures.length === results.length) {
    throw retryAfter
      ? new GitHubError("rate-limited", retryAfter)
      : new GitHubError("unavailable");
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
        result.reason instanceof GitHubError
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
