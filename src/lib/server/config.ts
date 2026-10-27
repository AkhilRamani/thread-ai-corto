import "server-only";
import { z } from "zod";

const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  sessionPassword: z.string().min(32),
  appUrl: z.url(),
});

export function getAuthConfig() {
  const result = configSchema.safeParse({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    sessionPassword: process.env.SESSION_PASSWORD,
    appUrl: process.env.APP_URL,
  });
  if (!result.success) return null;
  const url = new URL(result.data.appUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        local &&
        process.env.NODE_ENV !== "production"
      ))
  )
    return null;
  return {
    ...result.data,
    appUrl: url.origin,
    callbackUrl: `${url.origin}/api/auth/github/callback`,
  };
}

export function isSameOrigin(request: Request) {
  const config = getAuthConfig();
  return !!config && request.headers.get("origin") === config.appUrl;
}

export function getAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
  };
}

export function getNotionConfig() {
  const auth = getAuthConfig();
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET?.trim();
  return auth && clientId && clientSecret
    ? {
        clientId,
        clientSecret,
        callbackUrl: `${auth.appUrl}/api/auth/notion/callback`,
      }
    : null;
}

// Next's internal listener URL can differ from the browser's Host header locally.
// Validate the public host without trusting forwarded-host input; OAuth state remains mandatory.
export function isCallbackOrigin(request: Request) {
  const config = getAuthConfig();
  if (!config) return false;
  const expected = new URL(config.appUrl);
  const actual = new URL(request.url);
  const host = request.headers.get("host") ?? actual.host;
  return (
    host.toLowerCase() === expected.host.toLowerCase() &&
    actual.protocol === expected.protocol
  );
}
