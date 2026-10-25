import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getAuthConfig } from "./config";
import { OAUTH_TTL, type OAuthAttempt } from "./session";

export function createOAuthAttempt(): OAuthAttempt {
  return {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + OAUTH_TTL * 1000,
  };
}

export function authorizationUrl(attempt: OAuthAttempt) {
  const config = getAuthConfig();
  if (!config) throw new Error("Sign-in is not configured.");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "",
    state: attempt.state,
    code_challenge: createHash("sha256")
      .update(attempt.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function validOAuthState(
  attempt: OAuthAttempt | undefined,
  state: string | null,
) {
  if (
    !attempt ||
    !state ||
    attempt.expiresAt <= Date.now() ||
    !attempt.verifier ||
    !attempt.state
  )
    return false;
  const expected = Buffer.from(attempt.state);
  const actual = Buffer.from(state);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function exchangeCode(code: string, verifier: string) {
  const config = getAuthConfig();
  if (!config) throw new Error("Sign-in is not configured.");
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.callbackUrl,
      code,
      code_verifier: verifier,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("GitHub sign-in failed.");
  return z
    .object({
      access_token: z.string().min(1).max(1024),
      token_type: z.literal("bearer"),
      expires_in: z.number().positive().optional(),
    })
    .parse(await response.json());
}
