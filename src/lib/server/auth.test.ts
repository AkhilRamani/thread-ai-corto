// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(
  () =>
    new Map<
      string,
      {
        name: string;
        value: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string | boolean;
        maxAge?: number;
      }
    >(),
);
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    getAll: () => [...jar.values()],
    set: (name: string, value: string, options: object) =>
      jar.set(name, { name, value, ...options }),
  }),
}));

import { GET as start } from "@/app/api/auth/github/route";
import { GET as callback } from "@/app/api/auth/github/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as sources } from "@/app/api/project/sources/route";
import {
  getOAuthSession,
  getSession,
  getSignedInUser,
  SESSION_TTL,
} from "./session";
import { getAuthConfig } from "./config";

const origin = "http://127.0.0.1:3000";
const fetchMock = vi.fn<typeof fetch>();
const post = (path: string, from: string | null = origin) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: from ? { Origin: from } : {},
    body: JSON.stringify({
      selection: { repository: "synthetic-investigator/atlas", pageIds: [] },
    }),
  });
async function signedIn(expiresAt = Date.now() + SESSION_TTL * 1000) {
  const session = await getSession();
  session.auth = {
    user: { id: 1, login: "octocat" },
    accessToken: "private-token",
    nonce: "session-nonce-at-least-twenty-characters",
    expiresAt,
  };
  await session.save();
}
async function callbackRequest(extra = "code=valid-code") {
  const response = await start();
  const state = new URL(response.headers.get("location")!).searchParams.get(
    "state",
  );
  return new Request(
    `${origin}/api/auth/github/callback?state=${state}&${extra}`,
  );
}
beforeEach(() => {
  jar.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "SESSION_PASSWORD",
    "test-password-only-at-least-thirty-two-characters",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OAuth and encrypted session boundaries", () => {
  it("creates an encrypted, expiring attempt and a no-scope S256 authorization request", async () => {
    const response = await start();
    const url = new URL(response.headers.get("location")!);
    const attempt = (await getOAuthSession()).attempt!;
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("scope")).toBe("");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/github/callback`,
    );
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(attempt.verifier).digest("base64url"),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(jar.get("mysubscriptions-oauth")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      secure: false,
    });
    expect(jar.get("mysubscriptions-oauth")?.value).not.toContain(
      attempt.verifier,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects missing, mismatched, and expired state without exchanging any code", async () => {
    for (const state of ["", "different-state"]) {
      await start();
      const response = await callback(
        new Request(`${origin}/api/auth/github/callback?code=x&state=${state}`),
      );
      expect(response.headers.get("location")).toBe("/?auth=invalid-state");
      expect(jar.get("mysubscriptions-oauth")?.maxAge).toBe(0);
    }
    const request = await callbackRequest();
    const pending = await getOAuthSession();
    pending.attempt!.expiresAt = Date.now() - 1;
    await pending.save();
    expect((await callback(request)).headers.get("location")).toBe(
      "/?auth=invalid-state",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles cancellation and consumes the attempt", async () => {
    const request = await callbackRequest("error=access_denied");
    expect((await callback(request)).headers.get("location")).toBe(
      "/?auth=cancelled",
    );
    expect((await callback(request)).headers.get("location")).toBe(
      "/?auth=invalid-state",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies the identity and issues an opaque session only after a successful exchange", async () => {
    const request = await callbackRequest();
    const verifier = (await getOAuthSession()).attempt!.verifier;
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          access_token: "private-token",
          token_type: "bearer",
          expires_in: 600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 42,
          login: "octocat",
          email: "not-forwarded@example.com",
        }),
      );
    const response = await callback(request);
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(
      (fetchMock.mock.calls[0][1]?.body as URLSearchParams).get(
        "code_verifier",
      ),
    ).toBe(verifier);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.github.com/user");
    expect(await getSignedInUser()).toEqual({ id: 42, login: "octocat" });
    expect(
      (await getSession()).auth!.expiresAt - Date.now(),
    ).toBeLessThanOrEqual(600_000);
    expect(jar.get("mysubscriptions-session")?.value).not.toContain(
      "private-token",
    );
    expect(await response.text()).not.toContain("private-token");
  });

  it("does not sign in after a failed exchange or identity verification", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        error: "bad_verification_code",
        error_description: "sensitive provider text",
      }),
    );
    expect(
      (await callback(await callbackRequest())).headers.get("location"),
    ).toBe("/?auth=failed");
    expect(await getSignedInUser()).toBeNull();
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: "private-token", token_type: "bearer" }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(
      (await callback(await callbackRequest())).headers.get("location"),
    ).toBe("/?auth=failed");
    expect(await getSignedInUser()).toBeNull();
  });

  it("uses secure host-only cookies in production and refuses non-HTTPS production origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getAuthConfig()).toBeNull();
    vi.stubEnv("APP_URL", "https://example.com");
    await start();
    expect(jar.get("__Host-mysubscriptions-oauth")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  });

  it("fails closed when credentials are absent without preventing sample access", async () => {
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    expect((await start()).headers.get("location")).toBe(
      "/?auth=not-configured",
    );
    expect(await getSignedInUser()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("protected sources and sign-out", () => {
  it("rejects unauthenticated, expired, and tampered cookies without contacting GitHub", async () => {
    expect((await sources(post("/api/github/sources"))).status).toBe(401);
    await signedIn(Date.now() - 1000);
    expect((await sources(post("/api/github/sources"))).status).toBe(401);
    jar.set("mysubscriptions-session", {
      name: "mysubscriptions-session",
      value: "tampered",
    });
    expect((await sources(post("/api/github/sources"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site or missing origins before provider work or sign-out", async () => {
    await signedIn();
    for (const from of ["https://attacker.example", null]) {
      expect((await sources(post("/api/github/sources", from))).status).toBe(
        403,
      );
      expect((await logout(post("/api/auth/logout", from))).status).toBe(403);
    }
    expect(await getSignedInUser()).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives queries from the session and returns no tokens with no-store headers", async () => {
    await signedIn();
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/search/")
          ? { total_count: 0, incomplete_results: false, items: [] }
          : {
              full_name: "synthetic-investigator/atlas",
              private: false,
              visibility: "public",
            },
      ),
    );
    const response = await sources(post("/api/github/sources?login=attacker"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(body).not.toContain("private-token");
    expect(body).toContain('"evidence":[]');
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).includes("attacker")),
    ).toBe(true);
  });

  it("destroys revoked sessions and clears the pending attempt on sign-out", async () => {
    await signedIn();
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 401 }),
    );
    expect((await sources(post("/api/github/sources"))).status).toBe(401);
    expect(await getSignedInUser()).toBeNull();
    await signedIn();
    await start();
    expect(
      (await logout(post("/api/auth/logout"))).headers.get("location"),
    ).toBe("/");
    expect(await getSignedInUser()).toBeNull();
    expect((await getOAuthSession()).attempt).toBeUndefined();
  });
});

import { POST as connectNotion } from "@/app/api/auth/notion/route";
import { GET as notionCallback } from "@/app/api/auth/notion/callback/route";
import { POST as disconnectNotion } from "@/app/api/auth/notion/disconnect/route";
import {
  getNotionAttempt,
  getNotionSession,
  validNotionConnection,
} from "./notion-oauth";
describe("Notion connection binding and cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("NOTION_CLIENT_ID", "notion-client");
    vi.stubEnv("NOTION_CLIENT_SECRET", "notion-secret");
  });
  async function notionRequest() {
    await signedIn();
    const response = await connectNotion(post("/api/auth/notion"));
    const url = new URL(response.headers.get("location")!);
    return {
      url,
      callback: new Request(
        `${origin}/api/auth/notion/callback?state=${url.searchParams.get("state")}&code=synthetic-code`,
      ),
    };
  }
  it("starts public OAuth with state, page selection, and no GitHub PKCE assumptions", async () => {
    const { url } = await notionRequest();
    expect(url.origin).toBe("https://api.notion.com");
    expect(url.searchParams.get("owner")).toBe("user");
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect((await getNotionAttempt()).attempt!.nonce).toBe(
      (await getSession()).auth!.nonce,
    );
    expect(jar.get("mysubscriptions-notion-oauth")!.value.length).toBeLessThan(
      3800,
    );
  });
  it("rejects an unauthenticated or cross-site linking attempt", async () => {
    expect(
      (await connectNotion(post("/api/auth/notion"))).headers.get("location"),
    ).toBe("/?auth=expired");
    await signedIn();
    expect(
      (await connectNotion(post("/api/auth/notion", "https://other.example")))
        .status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects wrong state, callback origin and changed login sessions before token exchange", async () => {
    const { callback: request } = await notionRequest();
    expect(
      (
        await notionCallback(
          new Request(request.url.replace(origin, "https://other.example")),
        )
      ).headers.get("location"),
    ).toContain("invalid-state");
    expect(
      (
        await notionCallback(
          new Request(request.url.replace(/state=[^&]+/, "state=wrong")),
        )
      ).headers.get("location"),
    ).toContain("invalid-state");
    const { callback: next } = await notionRequest();
    const session = await getSession();
    session.auth!.nonce = "another-valid-session-nonce";
    await session.save();
    expect((await notionCallback(next)).headers.get("location")).toContain(
      "invalid-state",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("exchanges using Basic auth, stores a small sealed session-only token and consumes state", async () => {
    const { callback: request } = await notionRequest();
    fetchMock.mockResolvedValueOnce(
      Response.json({
        access_token: "synthetic-notion-token",
        workspace_id: "synthetic-workspace",
        refresh_token: "not-stored",
        expires_in: 3600,
      }),
    );
    expect((await notionCallback(request)).headers.get("location")).toBe(
      "/dashboard?view=plan&notion=connected#project-sources",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.notion.com/v1/oauth/token",
    );
    const init = fetchMock.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("notion-client:notion-secret").toString("base64")}`,
    );
    const auth = (await getSession()).auth!;
    const value = (await getNotionSession()).connection!;
    expect(validNotionConnection(value, auth)).toBeTruthy();
    expect(value.expiresAt).toBeLessThanOrEqual(auth.expiresAt);
    expect(jar.get("mysubscriptions-notion")!.value.length).toBeLessThan(3800);
    expect(jar.get("mysubscriptions-notion")!.value).not.toContain(
      "synthetic-notion-token",
    );
    expect(value).not.toHaveProperty("refresh_token");
    expect((await notionCallback(request)).headers.get("location")).toContain(
      "invalid-state",
    );
  });
  it("clears connection and pending state on disconnect and logout", async () => {
    await notionRequest();
    const session = await getNotionSession();
    session.connection = {
      accessToken: "token",
      workspaceId: "workspace",
      nonce: (await getSession()).auth!.nonce,
      expiresAt: Date.now() + 1000,
    };
    await session.save();
    expect(
      (
        await disconnectNotion(
          post("/api/auth/notion/disconnect", "https://other.example"),
        )
      ).status,
    ).toBe(403);
    expect((await getNotionSession()).connection).toBeDefined();
    await disconnectNotion(post("/api/auth/notion/disconnect"));
    expect((await getNotionSession()).connection).toBeUndefined();
    expect((await getNotionAttempt()).attempt).toBeUndefined();
    await notionRequest();
    await logout(post("/api/auth/logout"));
    expect((await getNotionAttempt()).attempt).toBeUndefined();
    expect(await getSignedInUser()).toBeNull();
  });
});

describe("public callback host behind the Next.js listener", () => {
  it("accepts a valid GitHub attempt when the internal URL is localhost but the public host is 127.0.0.1", async () => {
    const request = await callbackRequest("error=access_denied");
    const internal = new Request(
      request.url.replace("127.0.0.1", "localhost"),
      { headers: { Host: "127.0.0.1:3000" } },
    );
    expect((await callback(internal)).headers.get("location")).toBe(
      "/?auth=cancelled",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a different public host even when a forwarded host or URL looks canonical", async () => {
    const request = await callbackRequest("error=access_denied");
    const forged = new Request(request.url, {
      headers: {
        Host: "attacker.example",
        "X-Forwarded-Host": "127.0.0.1:3000",
      },
    });
    expect((await callback(forged)).headers.get("location")).toBe(
      "/?auth=invalid-state",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still rejects missing or mismatched state on the correct public host", async () => {
    await start();
    for (const query of [
      "error=access_denied",
      "state=incorrect&error=access_denied",
    ]) {
      const request = new Request(
        `http://localhost:3000/api/auth/github/callback?${query}`,
        { headers: { Host: "127.0.0.1:3000" } },
      );
      expect((await callback(request)).headers.get("location")).toBe(
        "/?auth=invalid-state",
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same public-host check for a session-bound Notion callback", async () => {
    vi.stubEnv("NOTION_CLIENT_ID", "notion-client");
    vi.stubEnv("NOTION_CLIENT_SECRET", "notion-secret");
    await signedIn();
    const response = await connectNotion(post("/api/auth/notion"));
    const state = new URL(response.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const request = new Request(
      `http://localhost:3000/api/auth/notion/callback?${new URLSearchParams({ state, error: "access_denied" })}`,
      { headers: { Host: "127.0.0.1:3000" } },
    );
    expect((await notionCallback(request)).headers.get("location")).toBe(
      "/dashboard?view=plan&notion=cancelled#project-sources",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("preserves the validated public repository through the Notion OAuth handoff", async () => {
  vi.stubEnv("NOTION_CLIENT_ID", "notion-client");
  vi.stubEnv("NOTION_CLIENT_SECRET", "notion-secret");
  await signedIn();
  const response = await connectNotion(
    post("/api/auth/notion?repository=synthetic-investigator%2Fatlas"),
  );
  const state = new URL(response.headers.get("location")!).searchParams.get(
    "state",
  )!;
  expect((await getNotionAttempt()).attempt!.repository).toBe(
    "synthetic-investigator/atlas",
  );
  fetchMock.mockResolvedValueOnce(
    Response.json({
      access_token: "synthetic-notion-token",
      workspace_id: "synthetic-workspace",
    }),
  );
  const result = await notionCallback(
    new Request(
      `${origin}/api/auth/notion/callback?${new URLSearchParams({ state, code: "synthetic-code" })}`,
    ),
  );
  const location = new URL(result.headers.get("location")!, origin);
  expect(location.pathname).toBe("/dashboard");
  expect(location.searchParams.get("repository")).toBe(
    "synthetic-investigator/atlas",
  );
  expect(location.hash).toBe("#project-sources");
  const wrong = await connectNotion(
    post("/api/auth/notion?repository=https%3A%2F%2Fevil.example"),
  );
  expect(wrong.status).toBe(303);
  expect((await getNotionAttempt()).attempt!.repository).toBeUndefined();
});
