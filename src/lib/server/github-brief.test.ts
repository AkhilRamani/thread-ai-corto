// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getGitHubSnapshot } from "./github-brief";

const item = (id: number, overrides = {}) => ({
  id,
  number: id,
  title: `Work ${id}`,
  body: "A useful description.",
  state: "open",
  updated_at: "2026-10-24T12:00:00Z",
  repository_url: "https://api.github.com/repos/owner/project",
  html_url: `https://github.com/owner/project/pull/${id}`,
  labels: [{ name: "enhancement" }],
  pull_request: {},
  ...overrides,
});
const search = (items: unknown[], extra = {}) =>
  Response.json({
    total_count: items.length,
    incomplete_results: false,
    items,
    ...extra,
  });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded public GitHub snapshots", () => {
  it("uses three public, identity-scoped sorted queries, deduplicates and bounds descriptions", async () => {
    fetchMock
      .mockResolvedValueOnce(
        search([item(1, { body: "x".repeat(3000) })], { total_count: 25 }),
      )
      .mockResolvedValueOnce(
        search([item(1), item(2, { updated_at: "2026-09-01T00:00:00Z" })]),
      )
      .mockResolvedValueOnce(
        search([
          item(3, {
            pull_request: undefined,
            html_url: "https://github.com/owner/project/issues/3",
            updated_at: "2026-10-25T10:00:00Z",
          }),
        ]),
      );
    const result = await getGitHubSnapshot("secret", "octocat");
    expect(result.items.map((source) => source.id)).toEqual([
      "github-3",
      "github-1",
      "github-2",
    ]);
    expect(result.items[0].status).toBe("Assigned");
    expect(result.items[1].description).toHaveLength(2000);
    expect(result.items[1].repository).toBe("owner/project");
    expect(result.collections?.[0]).toMatchObject({
      capped: true,
      total: 25,
      limit: 20,
    });
    expect(result.coverage).toBe("complete"); // complete selected queries, not a complete backlog
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((url) => url.searchParams.get("per_page"))).toEqual([
      "20",
      "10",
      "10",
    ]);
    expect(urls[0].searchParams.get("q")).toBe(
      "is:public is:pr author:octocat updated:>=2026-10-11T12:00:00.000Z",
    );
    expect(urls[1].searchParams.get("q")).toBe(
      "is:public is:pr is:open author:octocat",
    );
    expect(urls[2].searchParams.get("q")).toBe(
      "is:public is:issue is:open assignee:octocat",
    );
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("secret");
      expect(options).toMatchObject({
        cache: "no-store",
        redirect: "error",
        headers: { Authorization: "Bearer secret" },
      });
      expect(new URL(String(url)).searchParams.get("sort")).toBe("updated");
    }
  });

  it("distinguishes a confirmed merge from a closed PR", async () => {
    fetchMock
      .mockResolvedValueOnce(
        search([
          item(1, {
            state: "closed",
            pull_request: { merged_at: "2026-10-24T10:00:00Z" },
          }),
          item(2, { state: "closed" }),
        ]),
      )
      .mockResolvedValue(search([]));
    expect(
      (await getGitHubSnapshot("secret", "octocat")).items.map(
        (source) => source.status,
      ),
    ).toEqual(["Merged", "Closed"]);
  });

  it("preserves draft state without overriding closed or merged status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        search([
          item(1, { draft: true }),
          item(2, { draft: false }),
          item(3, { draft: true, state: "closed" }),
          item(4, {
            draft: true,
            state: "closed",
            pull_request: { merged_at: "2026-10-24T10:00:00Z" },
          }),
        ]),
      )
      .mockResolvedValue(search([]));
    expect(
      (await getGitHubSnapshot("secret", "octocat")).items.map(
        (source) => source.status,
      ),
    ).toEqual(["Draft", "Open", "Closed", "Merged"]);
  });

  it("preserves sources and the longest retry delay when some collections are rate-limited", async () => {
    fetchMock
      .mockResolvedValueOnce(search([item(1)]))
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "120" } }),
      );
    const result = await getGitHubSnapshot("secret", "octocat");
    expect(result).toMatchObject({ coverage: "partial", retryAfter: 120 });
    expect(result.items).toHaveLength(1);
  });

  it("shows available data and names failed or incomplete collections", async () => {
    fetchMock
      .mockResolvedValueOnce(search([item(1)], { incomplete_results: true }))
      .mockResolvedValueOnce(search([]))
      .mockResolvedValueOnce(new Response("unavailable", { status: 502 }));
    const result = await getGitHubSnapshot("secret", "octocat");
    expect(result.items).toHaveLength(1);
    expect(result.coverage).toBe("partial");
    expect(result.collections?.[0].incomplete).toBe(true);
    expect(result.collections?.[2]).toMatchObject({
      label: "Open assigned issues",
      total: null,
      returned: 0,
      error: expect.any(String),
    });
  });

  it("never presents a total provider failure as an empty successful snapshot", async () => {
    fetchMock.mockRejectedValue(
      new Error("network error with sensitive provider text"),
    );
    await expect(getGitHubSnapshot("secret", "octocat")).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("treats any revoked-token response as expired, even if another collection succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(search([item(1)]))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(search([]));
    await expect(getGitHubSnapshot("secret", "octocat")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("reports rate limits with a bounded retry delay", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(null, {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "retry-after": "120" },
        }),
    );
    await expect(getGitHubSnapshot("secret", "octocat")).rejects.toMatchObject({
      code: "rate-limited",
      retryAfter: 120,
    });
  });

  it("rejects malformed responses and unsafe links instead of passing them to the browser", async () => {
    fetchMock.mockImplementation(async () =>
      search([item(1, { html_url: "https://attacker.example/steal" })]),
    );
    await expect(getGitHubSnapshot("secret", "octocat")).rejects.toMatchObject({
      code: "unavailable",
    });
    fetchMock.mockImplementation(async () => Response.json({ items: [] }));
    await expect(getGitHubSnapshot("secret", "octocat")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
