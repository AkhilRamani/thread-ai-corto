// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({
  auth: {
    user: { id: 1, login: "synthetic" },
    nonce: "nonce-at-least-twenty-characters",
    accessToken: "private-github-token",
    expiresAt: 0,
  },
  destroy: vi.fn(),
}));
const notion = vi.hoisted(() => ({
  connection: {
    accessToken: "private-notion-token",
    workspaceId: "synthetic-workspace",
    nonce: "nonce-at-least-twenty-characters",
    expiresAt: 0,
  },
  destroy: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("./session", async (original) => ({
  ...(await original<typeof import("./session")>()),
  getSession: async () => session,
}));
vi.mock("./notion-oauth", async (original) => ({
  ...(await original<typeof import("./notion-oauth")>()),
  getNotionSession: async () => notion,
  clearNotionConnection: async () => notion.destroy(),
}));
const run = vi.hoisted(() => vi.fn());
vi.mock("./investigator", () => ({ runInvestigator: run }));
import { projectOperation } from "./project-api";
import { fixtureFetch, fixtureSelection } from "@/lib/fixtures/project";
const origin = "http://127.0.0.1:3000";
const request = (body: unknown, from = origin) =>
  new Request(`${origin}/api/project/operation`, {
    method: "POST",
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const metrics = {
  model: "mock",
  calls: 1,
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
  providerRequests: 8,
};
beforeEach(() => {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("GITHUB_CLIENT_ID", "client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "secret");
  vi.stubEnv("SESSION_PASSWORD", "password-at-least-thirty-two-characters");
  session.auth.expiresAt = notion.connection.expiresAt = Date.now() + 100000;
  session.destroy.mockClear();
  notion.destroy.mockClear();
  vi.stubGlobal("fetch", vi.fn(fixtureFetch()));
  run.mockReset();
  run.mockImplementation(async ({ mode }) =>
    mode === "investigate"
      ? {
          mode,
          output: { overview: "No discrepancy", findings: [], limitations: [] },
          metrics,
        }
      : {
          mode,
          output: {
            explanation: "Change expiry",
            affected: [],
            unexamined: ["Full repository"],
          },
          metrics,
        },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("authenticated stateless project operations", () => {
  it("checks origin and auth before body parsing or provider requests", async () => {
    expect(
      (await projectOperation(request({}, "https://other.example"), "sources"))
        .status,
    ).toBe(403);
    session.auth.expiresAt = 1;
    expect((await projectOperation(request({}), "sources")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(session.destroy).toHaveBeenCalled();
  });
  it("rejects browser sources, instructions, credentials and arbitrary URLs", async () => {
    for (const value of [
      { selection: fixtureSelection, sources: ["untrusted"] },
      { selection: { repository: "https://evil.example", pageIds: [] } },
      { selection: fixtureSelection, model: "browser-model" },
    ])
      expect((await projectOperation(request(value), "sources")).status).toBe(
        400,
      );
    expect(fetch).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("loads source data without a model call, with private headers and no credentials", async () => {
    const response = await projectOperation(
      request({ selection: fixtureSelection }),
      "sources",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).toContain("Account recovery spec");
    expect(text).not.toContain("private-github-token");
    expect(text).not.toContain("private-notion-token");
    expect(run).not.toHaveBeenCalled();
  });
  it("preserves GitHub when Notion is revoked, clears linking credentials, and blocks AI", async () => {
    const fake = fixtureFetch();
    vi.stubGlobal("fetch", async (input: string) =>
      input.includes("notion.com")
        ? new Response(null, { status: 401 })
        : fake(input),
    );
    const response = await projectOperation(
      request({ selection: fixtureSelection }),
      "investigate",
    );
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.provider).toBe("notion");
    expect(
      body.snapshot.evidence.every(
        (e: { provider: string }) => e.provider === "github",
      ),
    ).toBe(true);
    expect(notion.destroy).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("requires usable content from both services rather than substituting a brief", async () => {
    const response = await projectOperation(
      request({ selection: { ...fixtureSelection, pageIds: [] } }),
      "investigate",
    );
    expect((await response.json()).error).toBe("insufficient-context");
    expect(run).not.toHaveBeenCalled();
  });
  it("re-fetches verified context for impact and rejects any content change", async () => {
    const investigated = await (
      await projectOperation(
        request({ selection: fixtureSelection }),
        "investigate",
      )
    ).json();
    expect(investigated.receipt).toBeTruthy();
    const body = {
      selection: fixtureSelection,
      question: "What if expiry is five minutes?",
      receipt: investigated.receipt,
    };
    const result = await (
      await projectOperation(request(body), "impact")
    ).json();
    expect(result.impact.output.explanation).toBe("Change expiry");
    const fake = fixtureFetch();
    vi.stubGlobal("fetch", async (input: string) => {
      const response = await fake(input);
      if (input.includes("/search/issues")) {
        const body = await response.json();
        body.items[0].body += " Changed requirement.";
        return Response.json(body);
      }
      return response;
    });
    run.mockClear();
    const changed = await (
      await projectOperation(request(body), "impact")
    ).json();
    expect(changed.contextChanged).toBe(true);
    expect(changed.snapshot).toBeDefined();
    expect(changed.impact).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects forged context and selection changes before fetching", async () => {
    const investigated = await (
      await projectOperation(
        request({ selection: fixtureSelection }),
        "investigate",
      )
    ).json();
    vi.mocked(fetch).mockClear();
    const body = {
      selection: fixtureSelection,
      question: "What if expiry is five minutes?",
      receipt: `${investigated.receipt}forged`,
    };
    expect((await projectOperation(request(body), "impact")).status).toBe(400);
    expect(
      (
        await projectOperation(
          request({
            ...body,
            receipt: investigated.receipt,
            selection: { ...fixtureSelection, repository: "other/repository" },
          }),
          "impact",
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
it("extends signed context to newly inspected impact files and detects subsequent edits", async () => {
  const investigation = await (
    await projectOperation(
      request({ selection: fixtureSelection }),
      "investigate",
    )
  ).json();
  run.mockImplementation(async ({ mode, reader }) => {
    await reader.read({
      operation: "files",
      sourceId: "github-142",
      reference: null,
    });
    return {
      mode,
      output: {
        explanation: "Change expiry",
        affected: [],
        unexamined: ["Full repository"],
      },
      metrics,
    };
  });
  const impact = await (
    await projectOperation(
      request({
        selection: fixtureSelection,
        receipt: investigation.receipt,
        question: "What if expiry is five minutes?",
      }),
      "impact",
    )
  ).json();
  expect(impact.receipt).toBeTruthy();
  expect(impact.receipt).not.toBe(investigation.receipt);
  const fake = fixtureFetch();
  vi.stubGlobal("fetch", async (input: string) =>
    input.includes("/pulls/142/files")
      ? Response.json([
          {
            filename: "src/recovery/config.ts",
            sha: "b".repeat(40),
            status: "modified",
            patch: "@@ -1 +1 @@\n+expiry = 300;",
          },
        ])
      : fake(input),
  );
  run.mockClear();
  const changed = await (
    await projectOperation(
      request({
        selection: fixtureSelection,
        receipt: impact.receipt,
        question: "What if expiry is ten minutes?",
      }),
      "impact",
    )
  ).json();
  expect(changed.contextChanged).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

import { POST as repositories } from "@/app/api/project/repositories/route";
it("protects repository discovery with origin/auth and rejects search qualifier injection", async () => {
  expect(
    (await repositories(request({ query: "" }, "https://other.example")))
      .status,
  ).toBe(403);
  for (const query of [
    "is:private",
    "atlas repo:private/secret",
    "https://evil.example",
  ])
    expect((await repositories(request({ query }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  session.auth.expiresAt = 1;
  expect((await repositories(request({ query: "" }))).status).toBe(401);
});
it("returns bounded repository metadata without credentials and reuses private response headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json([
        {
          full_name: "synthetic-investigator/atlas",
          private: false,
          html_url: "https://github.com/synthetic-investigator/atlas",
          description: "Project",
        },
      ]),
    ),
  );
  const response = await repositories(request({ query: "" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).not.toContain("private-github-token");
});

import { POST as pages } from "@/app/api/project/pages/route";
it("checks origin and rejects removed page-search input before reading Notion", async () => {
  expect((await pages(request({}, "https://other.example"))).status).toBe(403);
  expect((await pages(request({ query: "plan" }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("lists bounded shared Notion pages, omits archived pages, and keeps credentials private", async () => {
  const page = {
    id: fixtureSelection.pageIds[0],
    object: "page",
    url: `https://app.notion.com/p/${fixtureSelection.pageIds[0]}`,
    last_edited_time: "2026-10-26T04:00:00Z",
    properties: {
      title: { type: "title", title: [{ plain_text: "Shared plan" }] },
    },
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      results: [
        page,
        { ...page, id: fixtureSelection.pageIds[1], archived: true },
      ],
      has_more: true,
    }),
  );
  const response = await pages(request({}));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body.pages.map((item: { title: string }) => item.title)).toEqual([
    "Shared plan",
  ]);
  expect(body.capped).toBe(true);
  expect(JSON.stringify(body)).not.toContain("private-notion-token");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).page_size,
  ).toBe(30);
});
