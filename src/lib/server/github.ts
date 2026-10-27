import "server-only";
import { passageId } from "./passage-id";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  repositorySchema,
  type Evidence,
  type RepositoryOptions,
} from "@/lib/contracts";
import { limits } from "@/lib/limits";
import { githubUserSchema } from "./session";
import { RequestBudget, providerRequest } from "./http";
import { ProjectError } from "./errors";

export function githubRequest(
  path: string,
  token: string,
  budget = new RequestBudget(1, AbortSignal.timeout(10_000)),
) {
  return providerRequest(
    "github",
    `https://api.github.com${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
    budget,
  );
}
export async function getGitHubUser(token: string) {
  return githubUserSchema.parse(await githubRequest("/user", token));
}
export async function verifyRepository(
  repository: string,
  token: string,
  budget: RequestBudget,
) {
  repositorySchema.parse(repository);
  const repo = z
    .object({
      full_name: repositorySchema,
      private: z.boolean(),
      visibility: z.string().optional(),
    })
    .parse(await githubRequest(`/repos/${repository}`, token, budget));
  if (
    repo.private ||
    (repo.visibility && repo.visibility !== "public") ||
    repo.full_name.toLowerCase() !== repository.toLowerCase()
  )
    throw new ProjectError(
      "github",
      "invalid-selection",
      "Choose an accessible public GitHub repository.",
    );
  return repo.full_name;
}
const itemSchema = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().optional(),
  updated_at: z.iso.datetime(),
  created_at: z.iso.datetime().optional(),
  html_url: z.url(),
  user: z.object({ login: z.string() }).nullable().optional(),
  author_association: z.string().optional(),
  pull_request: z.object({ merged_at: z.iso.datetime().nullish() }).optional(),
});
export function normalizeGitHubItem(
  raw: unknown,
  repository: string,
  layer: Evidence["layer"] = "recent",
): Evidence {
  const item = itemSchema.parse(raw);
  const pr = !!item.pull_request;
  const url = `https://github.com/${repository}/${pr ? "pull" : "issues"}/${item.number}`;
  if (item.html_url.toLowerCase() !== url.toLowerCase())
    throw new ProjectError(
      "github",
      "unavailable",
      "GitHub returned an unexpected source link.",
    );
  const id = `github-${item.id}`;
  return {
    id,
    provider: "github",
    kind: pr ? "pull-request" : "issue",
    layer,
    title: item.title.slice(0, 200),
    url,
    number: item.number,
    status: item.pull_request?.merged_at
      ? "Merged"
      : item.state === "closed"
        ? "Closed"
        : pr && item.draft
          ? "Draft"
          : "Open",
    author: item.user?.login?.slice(0, 100),
    role: item.author_association,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    fetchedAt: new Date().toISOString(),
    passages: item.body?.trim()
      ? [
          {
            id: passageId(id, "body"),
            text: item.body.slice(0, limits.textCharacters),
          },
        ]
      : [],
    limitations:
      item.body && item.body.length > limits.textCharacters
        ? ["Description truncated."]
        : !item.body?.trim()
          ? ["No description supplied."]
          : [],
  };
}
export async function recentGitHubWork(
  repository: string,
  token: string,
  budget: RequestBudget,
  now = new Date(),
) {
  const since = new Date(
    now.getTime() - limits.recentDays * 86400000,
  ).toISOString();
  const params = new URLSearchParams({
    q: `repo:${repository} is:public updated:>=${since}`,
    sort: "updated",
    order: "desc",
    per_page: String(limits.recentItems),
  });
  const result = z
    .object({
      total_count: z.number(),
      incomplete_results: z.boolean(),
      items: z.array(z.unknown()),
    })
    .parse(await githubRequest(`/search/issues?${params}`, token, budget));
  const items = result.items
    .slice(0, limits.recentItems)
    .map((raw) => normalizeGitHubItem(raw, repository));
  return {
    evidence: [...new Map(items.map((e) => [e.id, e])).values()],
    limitations: [
      ...(result.total_count > limits.recentItems
        ? [
            `Only the ${limits.recentItems} most recently updated issues and PRs are included.`,
          ]
        : []),
      ...(result.incomplete_results
        ? ["GitHub search returned incomplete results."]
        : []),
      "GitHub search indexing can lag; merged does not mean deployed.",
    ],
  };
}
const commentSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  html_url: z.string().optional(),
  user: z.object({ login: z.string() }).nullable().optional(),
  author_association: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  submitted_at: z.string().nullable().optional(),
  state: z.string().optional(),
  in_reply_to_id: z.number().optional(),
  path: z.string().optional(),
  line: z.number().nullable().optional(),
  commit_id: z.string().optional(),
});
export async function readDiscussion(
  parent: Evidence,
  repository: string,
  token: string,
  budget: RequestBudget,
): Promise<Evidence[]> {
  const paths: {
    path: string;
    kind: "comment" | "review" | "timeline";
    label: string;
  }[] = [
    {
      path: `/issues/${parent.number}/comments`,
      kind: "comment",
      label: "discussion",
    },
    ...(parent.kind === "pull-request"
      ? [
          {
            path: `/pulls/${parent.number}/reviews`,
            kind: "review" as const,
            label: "reviews",
          },
          {
            path: `/pulls/${parent.number}/comments`,
            kind: "comment" as const,
            label: "review-comments",
          },
        ]
      : []),
    {
      path: `/issues/${parent.number}/timeline`,
      kind: "timeline",
      label: "timeline",
    },
  ];
  const evidence: Evidence[] = [];
  // Preserve early-to-late chronology; explicitly disclose omitted later resolution.
  for (const endpoint of paths) {
    if (endpoint.kind === "timeline")
      parent.limitations.push(
        "Timeline coverage includes status events only; other event details are not inspected.",
      );
    try {
      const values = z
        .array(z.unknown())
        .parse(
          await githubRequest(
            `/repos/${repository}${endpoint.path}?per_page=${limits.pageSize}&page=1`,
            token,
            budget,
          ),
        );
      const cap = values.length >= limits.pageSize;
      const normalized: Evidence[] = [];
      for (const value of values.slice(0, limits.pageSize)) {
        if (endpoint.kind === "timeline") {
          const event = z
            .object({
              id: z.number().optional(),
              event: z.string().optional(),
              created_at: z.string().optional(),
              actor: z.object({ login: z.string() }).nullable().optional(),
            })
            .parse(value);
          if (
            !event.id ||
            !event.event ||
            ![
              "closed",
              "reopened",
              "merged",
              "review_requested",
              "review_dismissed",
              "assigned",
              "unassigned",
            ].includes(event.event)
          )
            continue;
          const id = `${parent.id}:event-${event.id}`;
          normalized.push({
            id,
            provider: "github",
            kind: "timeline",
            layer: "detail",
            parentId: parent.id,
            title: `${parent.title} · ${event.event}`,
            url: parent.url,
            createdAt: event.created_at,
            author: event.actor?.login,
            fetchedAt: new Date().toISOString(),
            passages: [
              {
                id: passageId(id, "text"),
                text: `${event.event} at ${event.created_at ?? "unknown time"}`,
              },
            ],
            limitations: [],
          });
        } else {
          const comment = commentSchema.parse(value);
          const id = `${parent.id}:${endpoint.label}-${comment.id}`;
          const url = comment.html_url
            ? new URL(comment.html_url)
            : new URL(parent.url);
          if (
            url.origin !== "https://github.com" ||
            url.pathname.toLowerCase() !==
              new URL(parent.url).pathname.toLowerCase()
          )
            throw new Error("Invalid comment link");
          normalized.push({
            id,
            provider: "github",
            kind: endpoint.kind,
            layer: "detail",
            parentId: parent.id,
            title: `${parent.title} · ${endpoint.label}`,
            url: url.toString(),
            status: comment.state,
            author: comment.user?.login,
            role: comment.author_association,
            createdAt: comment.created_at ?? comment.submitted_at ?? undefined,
            updatedAt: comment.updated_at,
            fetchedAt: new Date().toISOString(),
            passages: comment.body?.trim()
              ? [
                  {
                    id: passageId(id, "text"),
                    text: comment.body.slice(0, limits.textCharacters),
                    ...(comment.path && comment.commit_id
                      ? {
                          file: {
                            path: comment.path.slice(0, 300),
                            sha: comment.commit_id,
                            ...(comment.line
                              ? { startLine: comment.line }
                              : {}),
                          },
                        }
                      : {}),
                  },
                ]
              : [],
            limitations: [
              ...(comment.in_reply_to_id
                ? [
                    `Reply to comment ${comment.in_reply_to_id}; parent may be outside this excerpt.`,
                  ]
                : []),
              ...(comment.body && comment.body.length > limits.textCharacters
                ? ["Comment text truncated."]
                : []),
            ],
          });
        }
      }
      evidence.push(...normalized);
      parent.limitations.push(
        `${endpoint.label}: ${values.length} entries inspected on page 1.${cap ? " Later entries, including possible resolution, may be omitted." : " No further entries indicated by this page."}`,
      );
    } catch (error) {
      if (error instanceof ProjectError && error.code === "unauthorized")
        throw error;
      parent.limitations.push(
        `${endpoint.label} could not be fully read.${error instanceof ProjectError ? ` ${error.message}` : ""}`,
      );
      if (budget.rateLimit || budget.signal.aborted) break;
    }
  }
  return evidence.sort(
    (a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
      a.id.localeCompare(b.id),
  );
}
export async function readFiles(
  parent: Evidence,
  repository: string,
  token: string,
  budget: RequestBudget,
): Promise<Evidence[]> {
  const shaSchema = z.object({
    head: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }),
  });
  const path = `/repos/${repository}/pulls/${parent.number}`;
  const before = shaSchema.parse(await githubRequest(path, token, budget)).head
    .sha;
  const files = z
    .array(
      z.object({
        filename: z.string(),
        sha: z.string(),
        status: z.string(),
        patch: z.string().optional(),
      }),
    )
    .parse(
      await githubRequest(`${path}/files?per_page=10&page=1`, token, budget),
    );
  const after = shaSchema.parse(await githubRequest(path, token, budget)).head
    .sha;
  if (before !== after)
    throw new ProjectError(
      "github",
      "context-changed",
      "The PR changed during file retrieval. Refresh and investigate again.",
    );
  parent.headSha = before;
  parent.limitations.push(
    "Changed-file excerpts only; this is not complete code or test coverage.",
  );
  if (files.length >= 10)
    parent.limitations.push("Only the first ten changed files were inspected.");
  return files.slice(0, 10).map((file): Evidence => {
    const id = `${parent.id}:file-${createHash("sha256").update(file.filename).digest("hex").slice(0, 20)}`;
    const patch = file.patch?.slice(0, limits.patchCharacters);
    const startLine = /@@ -\d+(?:,\d+)? \+(\d+)/.exec(patch ?? "")?.[1];
    return {
      id,
      provider: "github",
      kind: "file",
      layer: "detail",
      parentId: parent.id,
      title: file.filename.slice(0, 200),
      url: `https://github.com/${repository}/blob/${before}/${file.filename.split("/").map(encodeURIComponent).join("/")}`,
      status: file.status,
      headSha: before,
      fetchedAt: new Date().toISOString(),
      passages: patch
        ? [
            {
              id: passageId(id, "patch"),
              text: patch,
              file: {
                path: file.filename,
                sha: before,
                ...(startLine ? { startLine: Number(startLine) } : {}),
              },
            },
          ]
        : [],
      limitations: !patch
        ? [
            "Patch unavailable (binary, omitted or too large); implementation was not inspected.",
          ]
        : file.patch!.length > limits.patchCharacters
          ? ["Patch truncated; hunk headers identify excerpt lines."]
          : [
              "Diff excerpt, not the complete file. Removed files may not exist at the head commit.",
            ],
    };
  });
}
export function explicitReferences(
  evidence: Evidence[],
  repository: string,
): Set<number> {
  const refs = new Set<number>();
  const repoUrl = `https://github.com/${repository}/`;
  for (const item of evidence)
    for (const passage of item.passages) {
      for (const match of passage.text.matchAll(
        /https:\/\/github\.com\/[^\s)<>]+/g,
      )) {
        if (match[0].toLowerCase().startsWith(repoUrl.toLowerCase())) {
          const number = /\/(?:issues|pull)\/(\d+)(?:$|[#?])/.exec(
            match[0],
          )?.[1];
          if (number) refs.add(Number(number));
        }
      }
      // Bare #123 is scoped only in GitHub text; Notion must identify the repository.
      if (item.provider === "github")
        for (const match of passage.text.matchAll(/(?:^|\s|\()#(\d+)\b/g))
          refs.add(Number(match[1]));
    }
  return refs;
}
export async function readReferencedItem(
  number: number,
  repository: string,
  token: string,
  budget: RequestBudget,
) {
  const evidence = normalizeGitHubItem(
    await githubRequest(`/repos/${repository}/issues/${number}`, token, budget),
    repository,
    "historical",
  );
  evidence.inclusionReason = `Explicit same-repository reference #${number} in inspected evidence.`;
  return evidence;
}

const repositoryOptionSchema = z.object({
  full_name: repositorySchema,
  private: z.boolean(),
  visibility: z.string().optional(),
  description: z.string().nullish(),
  html_url: z.url(),
});
export async function listRepositoryOptions(
  token: string,
  query: string,
  budget: RequestBudget,
): Promise<RepositoryOptions> {
  const exact = repositorySchema.safeParse(query);
  let raw: unknown[];
  let capped = false;
  if (exact.success) {
    raw = [await githubRequest(`/repos/${exact.data}`, token, budget)];
  } else if (query) {
    const params = new URLSearchParams({
      q: `${query} in:name is:public fork:true`,
      per_page: String(limits.pickerResults),
    });
    const result = z
      .object({
        items: z.array(z.unknown()),
        total_count: z.number(),
        incomplete_results: z.boolean(),
      })
      .parse(
        await githubRequest(`/search/repositories?${params}`, token, budget),
      );
    raw = result.items;
    capped =
      result.incomplete_results || result.total_count > limits.pickerResults;
  } else {
    const params = new URLSearchParams({
      visibility: "public",
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
      direction: "desc",
      per_page: String(limits.pickerResults),
    });
    raw = z
      .array(z.unknown())
      .parse(await githubRequest(`/user/repos?${params}`, token, budget));
    capped = raw.length >= limits.pickerResults;
  }
  const repositories = raw
    .slice(0, limits.pickerResults)
    .map((value) => repositoryOptionSchema.parse(value))
    .filter(
      (repo) =>
        !repo.private && (!repo.visibility || repo.visibility === "public"),
    )
    .map((repo) => {
      if (
        repo.html_url.toLowerCase() !==
        `https://github.com/${repo.full_name}`.toLowerCase()
      )
        throw new ProjectError(
          "github",
          "unavailable",
          "GitHub returned an unexpected repository link.",
        );
      return {
        fullName: repo.full_name,
        description: (repo.description ?? "").slice(0, 200),
      };
    });
  return {
    repositories: [
      ...new Map(
        repositories.map((repo) => [repo.fullName.toLowerCase(), repo]),
      ).values(),
    ],
    capped,
  };
}
