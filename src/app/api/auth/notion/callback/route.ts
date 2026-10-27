import { isCallbackOrigin, getNotionConfig } from "@/lib/server/config";
import { getSession, validAuth, sessionOptions } from "@/lib/server/session";
import {
  exchangeNotionCode,
  getNotionAttempt,
  getNotionSession,
  validNotionState,
  notionReturnPath,
} from "@/lib/server/notion-oauth";
import { authRedirect } from "@/lib/server/responses";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!getNotionConfig())
    return authRedirect("/dashboard?notion=not-configured");
  if (!isCallbackOrigin(request))
    return authRedirect("/dashboard?notion=invalid-state");
  const pending = await getNotionAttempt();
  const attempt = pending.attempt;
  pending.destroy();
  const auth = validAuth((await getSession()).auth);
  const params = new URL(request.url).searchParams;
  if (!auth || !validNotionState(attempt, params.get("state"), auth))
    return authRedirect("/dashboard?notion=invalid-state");
  if (params.has("error"))
    return authRedirect(notionReturnPath("cancelled", attempt!.repository));
  const code = params.get("code");
  if (!code || code.length > 1024)
    return authRedirect(notionReturnPath("failed", attempt!.repository));
  try {
    const session = await getNotionSession();
    session.connection = await exchangeNotionCode(code, auth);
    session.updateConfig(
      sessionOptions(
        "notion",
        Math.max(
          1,
          Math.floor((session.connection.expiresAt - Date.now()) / 1000),
        ),
      ),
    );
    await session.save();
    return authRedirect(notionReturnPath("connected", attempt!.repository));
  } catch {
    return authRedirect(notionReturnPath("failed", attempt!.repository));
  }
}
