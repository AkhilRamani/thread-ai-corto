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
