import { getAuthConfig } from "@/lib/server/config";
import { authorizationUrl, createOAuthAttempt } from "@/lib/server/oauth";
import { authRedirect } from "@/lib/server/responses";
import { getOAuthSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  if (!getAuthConfig()) return authRedirect("/?auth=not-configured");
  const session = await getOAuthSession();
  const attempt = createOAuthAttempt();
  session.attempt = attempt;
  await session.save();
  return authRedirect(authorizationUrl(attempt));
}
