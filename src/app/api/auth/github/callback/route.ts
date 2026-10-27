import { randomBytes } from "node:crypto";
import { clearNotionConnection } from "@/lib/server/notion-oauth";
import { getAuthConfig, isCallbackOrigin } from "@/lib/server/config";
import { getGitHubUser } from "@/lib/server/github";
import { exchangeCode, validOAuthState } from "@/lib/server/oauth";
import { authRedirect } from "@/lib/server/responses";
import { getOAuthSession, getSession, SESSION_TTL } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!getAuthConfig()) return authRedirect("/?auth=not-configured");
  if (!isCallbackOrigin(request)) return authRedirect("/?auth=invalid-state");
  const pending = await getOAuthSession();
  const attempt = pending.attempt;
  pending.destroy();
  const params = new URL(request.url).searchParams;
  if (!validOAuthState(attempt, params.get("state")))
    return authRedirect("/?auth=invalid-state");
  if (params.has("error")) return authRedirect("/?auth=cancelled");
  const code = params.get("code");
  if (!code || code.length > 512) return authRedirect("/?auth=failed");
  try {
    const token = await exchangeCode(code, attempt!.verifier);
    const user = await getGitHubUser(token.access_token);
    const session = await getSession();
    await clearNotionConnection();
    session.auth = {
      nonce: randomBytes(24).toString("base64url"),
      user,
      accessToken: token.access_token,
      expiresAt:
        Date.now() +
        Math.min(SESSION_TTL, token.expires_in ?? SESSION_TTL) * 1000,
    };
    await session.save();
  } catch {
    // Never include provider bodies, codes, tokens, or user content in responses/logs.
    return authRedirect("/?auth=failed");
  }
  return authRedirect("/dashboard");
}
