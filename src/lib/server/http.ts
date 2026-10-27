import "server-only";
import { limits } from "@/lib/limits";
import { ProjectError, retryDelay, type ErrorProvider } from "./errors";

export class RequestBudget {
  used = 0;
  performed = 0;
  rateLimit?: ProjectError;
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    public max: number,
    public signal: AbortSignal,
  ) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.signal.throwIfAborted();
    if (this.rateLimit) throw this.rateLimit;
    if (this.used >= this.max)
      throw new ProjectError(
        "application",
        "budget",
        "Provider request limit reached; remaining content was not inspected.",
      );
    this.used++;
    if (this.active >= limits.concurrency)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      this.signal.throwIfAborted();
      if (this.rateLimit) throw this.rateLimit;
      return await work();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
export async function boundedJson(
  response: Response,
  maxBytes: number = limits.responseBytes,
): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Response too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function providerRequest(
  provider: Exclude<ErrorProvider, "model" | "application">,
  url: string,
  init: RequestInit,
  budget: RequestBudget,
): Promise<unknown> {
  return budget.run(async () => {
    try {
      budget.performed++;
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([budget.signal, AbortSignal.timeout(8000)]),
      });
      if (response.status === 401)
        throw new ProjectError(
          provider,
          "unauthorized",
          `Your ${provider === "notion" ? "Notion" : "GitHub"} connection expired or was revoked. Reconnect to continue.`,
        );
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      ) {
        budget.rateLimit = new ProjectError(
          provider,
          "rate-limited",
          `${provider} is limiting requests. Wait before retrying.`,
          retryDelay(response.headers),
        );
        throw budget.rateLimit;
      }
      if (!response.ok)
        throw new ProjectError(
          provider,
          "unavailable",
          `${provider} could not return this content. Check that it is accessible to this connection.`,
        );
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof ProjectError) throw error;
      if (budget.signal.aborted)
        throw new ProjectError(
          "application",
          "timeout",
          "The request deadline was reached. Available sources are preserved.",
        );
      throw new ProjectError(
        provider,
        "unavailable",
        `${provider} could not return this content. Try again when ready.`,
      );
    }
  });
}
