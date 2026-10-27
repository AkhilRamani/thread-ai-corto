import { z } from "zod";
import {
  authenticate,
  failureResponse,
  privateResponse,
  requestBody,
} from "@/lib/server/api";
import { listRepositoryOptions } from "@/lib/server/github";
import { RequestBudget } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { auth } = await authenticate(request);
    // Literal search terms only; callers cannot add private/search-scope qualifiers.
    const { query } = z
      .strictObject({
        query: z
          .string()
          .trim()
          .max(140)
          .regex(/^[A-Za-z0-9_.\-/ ]*$/),
      })
      .parse(await requestBody(request));
    const result = await listRepositoryOptions(
      auth.accessToken,
      query,
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
