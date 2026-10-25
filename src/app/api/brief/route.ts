import type { BriefResponse, SourceSnapshot } from "@/lib/contracts";
import { getAIConfig, getAuthConfig, isSameOrigin } from "@/lib/server/config";
import { BriefError, generateBrief } from "@/lib/server/brief";
import { getGitHubSnapshot, GitHubError } from "@/lib/server/github";
import { privateHeaders } from "@/lib/server/responses";
import { getSession, validAuth } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const respond = (body: BriefResponse, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        ...privateHeaders,
        ...("error" in body && body.retryAfter
          ? { "Retry-After": String(body.retryAfter) }
          : {}),
      },
    });
  if (!getAuthConfig())
    return respond(
      {
        error: "not-configured",
        stage: "sources",
        message: "GitHub sign-in is not configured.",
      },
      503,
    );
  if (!isSameOrigin(request))
    return new Response("Invalid request origin.", {
      status: 403,
      headers: privateHeaders,
    });
  const session = await getSession();
  const auth = validAuth(session.auth);
  if (!auth) {
    session.destroy();
    return respond(
      {
        error: "unauthorized",
        stage: "sources",
        message: "Reconnect to GitHub to generate a brief.",
      },
      401,
    );
  }
  if (!getAIConfig())
    return respond(
      {
        error: "not-configured",
        stage: "brief",
        message: new BriefError("not-configured").message,
      },
      503,
    );

  let snapshot: SourceSnapshot | undefined;
  try {
    // Never trust a client-supplied snapshot, model, prompt, or account identity.
    snapshot = await getGitHubSnapshot(auth.accessToken, auth.user.login);
    request.signal.throwIfAborted();
    if (!snapshot.items.length) return respond({ snapshot, brief: null });
    const brief = await generateBrief(snapshot, request.signal);
    return respond({ snapshot, brief });
  } catch (error) {
    const failure =
      error instanceof GitHubError || error instanceof BriefError
        ? error
        : snapshot
          ? new BriefError("unavailable")
          : new GitHubError("unavailable");
    if (failure.code === "unauthorized") session.destroy();
    return respond(
      {
        error: failure.code,
        message: failure.message,
        stage: snapshot ? "brief" : "sources",
        ...(snapshot ? { snapshot } : {}),
        ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
      },
      failure.code === "unauthorized"
        ? 401
        : failure.code === "rate-limited"
          ? 429
          : failure.code === "timeout"
            ? 504
            : 503,
    );
  }
}
