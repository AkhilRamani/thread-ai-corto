import { z } from "zod";
import { repositorySchema } from "@/lib/contracts";
import {
  authenticate,
  failureResponse,
  privateResponse,
  requestBody,
} from "@/lib/server/api";
import { getWorkItemDetails } from "@/lib/server/github-brief";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { auth } = await authenticate(request);
    const { repository, number } = z
      .strictObject({
        repository: repositorySchema,
        number: z.number().int().min(1).max(1_000_000),
      })
      .parse(await requestBody(request));
    return privateResponse(
      await getWorkItemDetails(
        repository,
        number,
        auth.accessToken,
        AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      ),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
