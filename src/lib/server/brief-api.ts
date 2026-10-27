import "server-only";
import type { SourceSnapshot } from "@/lib/contracts";
import { authenticate, failureResponse, privateResponse } from "./api";
import { getGitHubSnapshot } from "./github-brief";
import { BriefError, generateBrief } from "./brief";
import { getAIConfig } from "./config";

export async function briefOperation(request: Request, generate: boolean) {
  let snapshot: SourceSnapshot | undefined;
  try {
    const { auth } = await authenticate(request);
    if (generate && !getAIConfig()) throw new BriefError("not-configured");
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(generate ? 45_000 : 20_000),
    ]);
    // Identity, scope and source content always come from the authenticated server.
    snapshot = await getGitHubSnapshot(
      auth.accessToken,
      auth.user.login,
      signal,
    );
    if (!generate) return privateResponse({ snapshot });
    signal.throwIfAborted();
    const brief = snapshot.items.length
      ? await generateBrief(snapshot, signal)
      : null;
    return privateResponse({ snapshot, brief });
  } catch (error) {
    if (error instanceof BriefError)
      return privateResponse(
        {
          error: error.code,
          message: error.message,
          stage: "brief",
          ...(snapshot ? { snapshot } : {}),
          ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
        },
        error.code === "rate-limited"
          ? 429
          : error.code === "timeout"
            ? 504
            : 503,
      );
    return failureResponse(error);
  }
}
