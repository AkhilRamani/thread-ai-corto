import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { getNotionConfig } from "./config";
import { sessionOptions, SESSION_TTL, OAUTH_TTL, type Auth } from "./session";
import { boundedJson } from "./http";

const connectionSchema = z.object({
  accessToken: z.string().min(1).max(1024),
  workspaceId: z.string().max(100),
  nonce: z.string().min(20),
  expiresAt: z.number(),
});
type NotionAttempt = {
  state: string;
  nonce: string;
  expiresAt: number;
  repository?: string;
};
export async function getNotionSession() {
  return getIronSession<{ connection: z.infer<typeof connectionSchema> }>(
    await cookies(),
    sessionOptions("notion", SESSION_TTL),
  );
}
export async function getNotionAttempt() {
  return getIronSession<{ attempt: NotionAttempt }>(
    await cookies(),
    sessionOptions("notion-oauth", OAUTH_TTL),
  );
}
export function validNotionConnection(value: unknown, auth: Auth) {
  const parsed = connectionSchema.safeParse(value);
  return parsed.success &&
    parsed.data.expiresAt > Date.now() &&
    parsed.data.nonce === auth.nonce
    ? parsed.data
    : null;
}
export async function clearNotionConnection() {
  (await getNotionSession()).destroy();
  (await getNotionAttempt()).destroy();
}
export function createNotionAttempt(
  auth: Auth,
  repository?: string,
): NotionAttempt {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: auth.nonce,
    ...(repository ? { repository } : {}),
    expiresAt: Math.min(auth.expiresAt, Date.now() + OAUTH_TTL * 1000),
  };
}
export function validNotionState(
  attempt: NotionAttempt | undefined,
  state: string | null,
  auth: Auth,
) {
  if (
    !attempt ||
    !state ||
    !attempt.state ||
    attempt.nonce !== auth.nonce ||
    attempt.expiresAt <= Date.now()
  )
    return false;
  const a = Buffer.from(attempt.state),
    b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function notionAuthorizationUrl(attempt: NotionAttempt) {
  const config = getNotionConfig();
  if (!config) throw new Error("Notion is not configured.");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    owner: "user",
    state: attempt.state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params}`;
}
export async function exchangeNotionCode(code: string, auth: Auth) {
  const config = getNotionConfig();
  if (!config) throw new Error("Notion is not configured.");
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callbackUrl,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Notion connection failed.");
  const token = z
    .object({
      access_token: z.string().min(1).max(1024),
      workspace_id: z.string().max(100),
      expires_in: z.number().positive().optional(),
    })
    .parse(await boundedJson(response));
  // Session-only connection. Expiry/revocation requires reconnection; no background refresh.
  return {
    accessToken: token.access_token,
    workspaceId: token.workspace_id,
    nonce: auth.nonce,
    expiresAt: Math.min(
      auth.expiresAt,
      Date.now() + (token.expires_in ?? SESSION_TTL) * 1000,
    ),
  };
}

export function notionReturnPath(status: string, repository?: string) {
  const params = new URLSearchParams({ view: "plan", notion: status });
  if (repository) params.set("repository", repository);
  return `/dashboard?${params}#project-sources`;
}
