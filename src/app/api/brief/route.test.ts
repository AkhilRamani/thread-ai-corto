// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", async (original) => ({
  ...(await original<object>()),
  getSession: vi.fn(),
}));
vi.mock("@/lib/server/github", async (original) => ({
  ...(await original<object>()),
  getGitHubSnapshot: vi.fn(),
}));
vi.mock("@/lib/server/brief", async (original) => ({
  ...(await original<object>()),
  generateBrief: vi.fn(),
}));
import { POST } from "./route";
import { getSession } from "@/lib/server/session";
import { getGitHubSnapshot, GitHubError } from "@/lib/server/github";
import { generateBrief, BriefError } from "@/lib/server/brief";
import { sampleBrief, sampleSnapshot } from "@/lib/sample-data";

const origin = "http://127.0.0.1:3000";
const session = {
  auth: {
    accessToken: "secret-token",
    user: { id: 1, login: "octocat" },
    expiresAt: Date.now() + 1000_000,
  },
  destroy: vi.fn(),
  save: vi.fn(),
  updateConfig: vi.fn(),
};
const request = (from: string | null = origin) =>
  new Request(`${origin}/api/brief`, {
    method: "POST",
    headers: from ? { origin: from } : {},
    body: JSON.stringify({
      login: "attacker",
      model: "other-model",
      items: [{ id: "forged" }],
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "SESSION_PASSWORD",
    "test-password-only-at-least-thirty-two-characters",
  );
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  session.auth.expiresAt = Date.now() + 1000_000;
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(getGitHubSnapshot).mockResolvedValue(sampleSnapshot);
  vi.mocked(generateBrief).mockResolvedValue(sampleBrief);
});
afterEach(() => vi.unstubAllEnvs());

it("fetches using session identity, ignores client data and returns the exact generated snapshot", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(getGitHubSnapshot).toHaveBeenCalledWith("secret-token", "octocat");
  expect(generateBrief).toHaveBeenCalledWith(
    sampleSnapshot,
    expect.any(AbortSignal),
  );
  expect(await response.json()).toEqual({
    snapshot: sampleSnapshot,
    brief: sampleBrief,
  });
});

it.each([null, "https://attacker.example"])(
  "rejects origin %s before provider calls",
  async (from) => {
    expect((await POST(request(from))).status).toBe(403);
    expect(getSession).not.toHaveBeenCalled();
    expect(getGitHubSnapshot).not.toHaveBeenCalled();
    expect(generateBrief).not.toHaveBeenCalled();
  },
);

it("requires a valid session even when OpenAI is not configured", async () => {
  session.auth.expiresAt = 1;
  vi.stubEnv("OPENAI_API_KEY", "");
  expect((await POST(request())).status).toBe(401);
  expect(session.destroy).toHaveBeenCalled();
  expect(getGitHubSnapshot).not.toHaveBeenCalled();
});

it("does not spend GitHub quota when model credentials are missing", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: "not-configured",
    stage: "brief",
  });
  expect(getGitHubSnapshot).not.toHaveBeenCalled();
  expect(generateBrief).not.toHaveBeenCalled();
});

it.each(["complete", "partial"] as const)(
  "returns an empty %s snapshot without calling OpenAI",
  async (coverage) => {
    const snapshot = { ...sampleSnapshot, items: [], coverage };
    vi.mocked(getGitHubSnapshot).mockResolvedValue(snapshot);
    expect(await (await POST(request())).json()).toEqual({
      snapshot,
      brief: null,
    });
    expect(generateBrief).not.toHaveBeenCalled();
  },
);

it("keeps partial coverage and a fresh snapshot when AI is limited", async () => {
  const snapshot = { ...sampleSnapshot, coverage: "partial" as const };
  vi.mocked(getGitHubSnapshot).mockResolvedValue(snapshot);
  vi.mocked(generateBrief).mockRejectedValue(
    new BriefError("rate-limited", 120),
  );
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("120");
  expect(await response.json()).toMatchObject({
    snapshot,
    error: "rate-limited",
    stage: "brief",
    retryAfter: 120,
  });
  expect(session.destroy).not.toHaveBeenCalled();
});

it("keeps sources available on exhausted AI quota without advertising a retry time", async () => {
  vi.mocked(generateBrief).mockRejectedValue(new BriefError("quota-exhausted"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBeNull();
  const body = await response.json();
  expect(body).toMatchObject({
    snapshot: sampleSnapshot,
    error: "quota-exhausted",
    stage: "brief",
  });
  expect(body.retryAfter).toBeUndefined();
  expect(session.destroy).not.toHaveBeenCalled();
});

it("clears a revoked GitHub session and never calls the model", async () => {
  vi.mocked(getGitHubSnapshot).mockRejectedValue(
    new GitHubError("unauthorized"),
  );
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    error: "unauthorized",
    stage: "sources",
  });
  expect(session.destroy).toHaveBeenCalled();
  expect(generateBrief).not.toHaveBeenCalled();
});

it("never presents a source retrieval failure as an empty success", async () => {
  vi.mocked(getGitHubSnapshot).mockRejectedValue(
    new Error("secret provider body"),
  );
  const response = await POST(request());
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body).toMatchObject({ error: "unavailable", stage: "sources" });
  expect(body.snapshot).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("secret provider body");
  expect(generateBrief).not.toHaveBeenCalled();
});
