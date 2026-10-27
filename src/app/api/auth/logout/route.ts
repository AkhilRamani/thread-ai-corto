import { clearNotionConnection } from "@/lib/server/notion-oauth";
import { isSameOrigin } from "@/lib/server/config";
import { authRedirect, privateHeaders } from "@/lib/server/responses";
import { getOAuthSession, getSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return new Response("Invalid request origin.", {
      status: 403,
      headers: privateHeaders,
    });
  await clearNotionConnection();
  (await getSession()).destroy();
  (await getOAuthSession()).destroy();
  return authRedirect("/");
}
