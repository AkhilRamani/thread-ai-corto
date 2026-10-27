import "server-only";
export type ErrorProvider = "github" | "notion" | "model" | "application";
export class ProjectError extends Error {
  constructor(
    public provider: ErrorProvider,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function retryDelay(headers: Headers) {
  const raw = headers.get("retry-after");
  const seconds = Number(raw);
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  const wait =
    seconds > 0
      ? seconds
      : Math.ceil(((Date.parse(raw ?? "") || reset) - Date.now()) / 1000);
  return Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 60;
}
