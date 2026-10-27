import { z } from "zod";
import {
  authenticate,
  failureResponse,
  privateResponse,
  requestBody,
} from "@/lib/server/api";
import { listNotionPages } from "@/lib/server/notion";
import { RequestBudget } from "@/lib/server/http";
import { ProjectError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { notion } = await authenticate(request);
    if (!notion)
      throw new ProjectError(
        "notion",
        "not-connected",
        "Connect Notion to load shared pages.",
      );
    z.strictObject({}).parse(await requestBody(request));
    const result = await listNotionPages(
      notion.accessToken,
      new RequestBudget(
        1,
        AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      ),
    );
    return privateResponse(result);
  } catch (error) {
    return failureResponse(error);
  }
}
