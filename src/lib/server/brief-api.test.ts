// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({
  auth: {
    user: { id: 1, login: "synthetic" },
    nonce: "nonce-at-least-twenty-characters",
    accessToken: "private-token",
    expiresAt: 0,
  },
  destroy: vi.fn(),
}));
vi.mock("./session", async (original) => ({
  ...(await original<typeof import("./session")>()),
  getSession: async () => session,
}));
vi.mock("./notion-oauth", () => ({
  getNotionSession: async () => ({}),
  validNotionConnection: () => null,
  clearNotionConnection: vi.fn(),
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("./brief", async (original) => ({
  ...(await original<typeof import("./brief")>()),
  generateBrief: generate,
}));
import { briefOperation } from "./brief-api";
import { POST as details } from "@/app/api/github/details/route";
import { sampleBrief } from "@/lib/brief-sample";
const origin = "http://127.0.0.1:3000";
const request = (body = {}, from = origin) =>
  new Request(`${origin}/api/github/details`, {
    method: "POST",
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const item = {
  id: 142,
  number: 142,
  title: "Recovery",
  body: "Reset flow",
  state: "open",
  updated_at: "2026-10-26T01:00:00Z",
  html_url: "https://github.com/example/atlas/pull/142",
  repository_url: "https://api.github.com/repos/example/atlas",
  pull_request: {},
};
beforeEach(() => {
  for (const [key, value] of Object.entries({
    APP_URL: origin,
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "secret",
    SESSION_PASSWORD: "at-least-thirty-two-characters-password",
    OPENAI_API_KEY: "test-key",
  }))
    vi.stubEnv(key, value);
  session.auth.expiresAt = Date.now() + 100000;
  session.destroy.mockClear();
  generate.mockReset().mockResolvedValue(sampleBrief);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/search/issues")
        return Response.json({
          total_count: 1,
          incomplete_results: false,
          items: [item],
        });
      if (path === "/repos/example/atlas")
        return Response.json({ full_name: "example/atlas", private: false });
      if (path === "/repos/example/atlas/issues/142")
        return Response.json(item);
      return Response.json([]);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("loads the original personal public collections and deduplicates without AI", async () => {
  const response = await briefOperation(request({ login: "attacker" }), false);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.snapshot.items).toHaveLength(1);
  const queries = vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("q"));
  expect(queries).toHaveLength(3);
  expect(
    queries.every(
      (query) =>
        query?.includes("is:public") &&
        query.includes("synthetic") &&
        !query.includes("attacker"),
    ),
  ).toBe(true);
  expect(generate).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("re-fetches the authenticated snapshot before generating a brief", async () => {
  const response = await briefOperation(
    request({ items: ["browser injection"] }),
    true,
  );
  expect(response.status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].items[0].description).toBe("Reset flow");
  expect(await response.text()).not.toContain("private-token");
});
it("checks authentication and origin before any detail or model read", async () => {
  expect((await details(request({}, "https://other.example"))).status).toBe(
    403,
  );
  session.auth.expiresAt = 1;
  expect((await briefOperation(request(), true)).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
it("rechecks public visibility and bounds discussion requests", async () => {
  const response = await details(
    request({ repository: "example/atlas", number: 142 }),
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(6);
  const body = await response.json();
  expect(body.source.title).toBe("Recovery");
  expect(body.discussion).toEqual([]);
  expect(response.headers.get("cache-control")).toContain("no-store");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ full_name: "example/atlas", private: true }),
  );
  expect(
    (await details(request({ repository: "example/atlas", number: 142 })))
      .status,
  ).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(7);
});
it("rejects arbitrary URLs, extra browser context and forged repository links", async () => {
  for (const body of [
    { repository: "https://evil.example", number: 1 },
    { repository: "example/atlas", number: 142, source: "browser text" },
  ])
    expect((await details(request(body))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({ full_name: "example/atlas", private: false }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...item, html_url: "https://evil.example/pull/142" }),
    );
  expect(
    (await details(request({ repository: "example/atlas", number: 142 })))
      .status,
  ).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(2);
});
