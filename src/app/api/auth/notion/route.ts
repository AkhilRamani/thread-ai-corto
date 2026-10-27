import { repositorySchema } from "@/lib/contracts";
import { getNotionConfig, isSameOrigin } from "@/lib/server/config";
import { getSession, validAuth } from "@/lib/server/session";
import {
  createNotionAttempt,
  getNotionAttempt,
  notionAuthorizationUrl,
  notionReturnPath,
} from "@/lib/server/notion-oauth";
import { authRedirect, privateHeaders } from "@/lib/server/responses";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return new Response("Invalid request origin.", {
      status: 403,
      headers: privateHeaders,
    });
  const auth = validAuth((await getSession()).auth);
  if (!auth) return authRedirect("/?auth=expired");
  const parsed = repositorySchema.safeParse(
    new URL(request.url).searchParams.get("repository"),
  );
  const repository = parsed.success ? parsed.data : undefined;
  if (!getNotionConfig())
    return authRedirect(notionReturnPath("not-configured", repository));
  const session = await getNotionAttempt();
  session.attempt = createNotionAttempt(auth, repository);
  await session.save();
  return authRedirect(notionAuthorizationUrl(session.attempt));
}
