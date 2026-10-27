import "server-only";
import { z } from "zod";
import type { ProjectSnapshot } from "@/lib/contracts";
import { getAuthConfig, isSameOrigin } from "./config";
import { ProjectError } from "./errors";
import { boundedJson } from "./http";
import { getSession, validAuth } from "./session";
import {
  clearNotionConnection,
  getNotionSession,
  validNotionConnection,
} from "./notion-oauth";
import { privateHeaders } from "./responses";

export function privateResponse(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...privateHeaders,
      ...("retryAfter" in body && body.retryAfter
        ? { "Retry-After": String(body.retryAfter) }
        : {}),
    },
  });
}
export async function authenticate(request: Request) {
  if (!getAuthConfig())
    throw new ProjectError(
      "application",
      "not-configured",
      "GitHub sign-in is not configured.",
    );
  if (!isSameOrigin(request))
    throw new ProjectError(
      "application",
      "invalid-origin",
      "Invalid request origin.",
    );
  const session = await getSession();
  const auth = validAuth(session.auth);
  if (!auth) {
    session.destroy();
    await clearNotionConnection();
    throw new ProjectError(
      "github",
      "unauthorized",
      "Reconnect to GitHub to continue.",
    );
  }
  const notionSession = await getNotionSession();
  const notion = validNotionConnection(notionSession.connection, auth);
  return { auth, notion };
}
export async function requestBody(request: Request) {
  try {
    return await boundedJson(new Response(request.body), 16_000);
  } catch {
    throw new ProjectError(
      "application",
      "invalid-input",
      "The request is invalid or too large.",
    );
  }
}
export async function failureResponse(
  error: unknown,
  snapshot?: ProjectSnapshot,
) {
  const failure =
    error instanceof ProjectError
      ? error
      : new ProjectError(
          "application",
          error instanceof z.ZodError ? "invalid-input" : "unavailable",
          error instanceof z.ZodError
            ? "Check the repository, selected page identifiers, and question."
            : "The operation could not be completed. Available sources are preserved.",
        );
  if (failure.code === "unauthorized") {
    if (failure.provider === "github") {
      (await getSession()).destroy();
      await clearNotionConnection();
      snapshot = undefined;
    }
    if (failure.provider === "notion") await clearNotionConnection();
  }
  const status =
    failure.code === "unauthorized"
      ? 401
      : failure.code === "invalid-origin"
        ? 403
        : ["invalid-input", "invalid-selection", "invalid-context"].includes(
              failure.code,
            )
          ? 400
          : failure.code === "rate-limited"
            ? 429
            : failure.code === "timeout"
              ? 504
              : 503;
  return privateResponse(
    {
      error: failure.code,
      provider: failure.provider,
      message: failure.message,
      ...(snapshot ? { snapshot } : {}),
      ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
    },
    status,
  );
}
