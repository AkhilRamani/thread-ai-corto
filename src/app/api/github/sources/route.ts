import type { SourcesResponse } from "@/lib/contracts";
import { getAuthConfig, isSameOrigin } from "@/lib/server/config";
import { getGitHubSnapshot, GitHubError } from "@/lib/server/github";
import { privateHeaders } from "@/lib/server/responses";
import { getSession, validAuth } from "@/lib/server/session";

export const runtime = "nodejs";

// POST avoids link prefetches and cross-site requests spending the user's search quota.
export async function POST(request: Request) {
  const respond = (body: SourcesResponse, status = 200, headers = {}) =>
    Response.json(body, { status, headers: { ...privateHeaders, ...headers } });
  if (!getAuthConfig())
    return respond(
      { error: "not-configured", message: "GitHub sign-in is not configured." },
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
        message: "Reconnect to GitHub to load your sources.",
      },
      401,
    );
  }
  try {
    return respond({
      snapshot: await getGitHubSnapshot(auth.accessToken, auth.user.login),
    });
  } catch (error) {
    const failure =
      error instanceof GitHubError ? error : new GitHubError("unavailable");
    if (failure.code === "unauthorized") session.destroy();
    return respond(
      {
        error: failure.code,
        message: failure.message,
        ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
      },
      failure.code === "unauthorized"
        ? 401
        : failure.code === "rate-limited"
          ? 429
          : 503,
      failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {},
    );
  }
}
