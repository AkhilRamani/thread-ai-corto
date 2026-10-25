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
import { POST as sources } from "@/app/api/github/sources/route";
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
  });
async function signedIn(expiresAt = Date.now() + SESSION_TTL * 1000) {
  const session = await getSession();
  session.auth = {
    user: { id: 1, login: "octocat" },
    accessToken: "private-token",
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
    fetchMock.mockImplementation(async () =>
      Response.json({ total_count: 0, incomplete_results: false, items: [] }),
    );
    const response = await sources(post("/api/github/sources?login=attacker"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(body).not.toContain("private-token");
    expect(body).toContain('"items":[]');
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
