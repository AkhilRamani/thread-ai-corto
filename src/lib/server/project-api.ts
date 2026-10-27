import "server-only";
import { z } from "zod";
import { selectionSchema, type ProjectSnapshot } from "@/lib/contracts";
import { limits } from "@/lib/limits";
import { ProjectError } from "./errors";
import { RequestBudget } from "./http";
import {
  createEvidenceReader,
  fingerprint,
  hasProjectContext,
  loadProject,
} from "./project";
import { issueReceipt, verifyReceipt } from "./context-receipt";
import { runInvestigator } from "./investigator";
import {
  authenticate,
  privateResponse,
  failureResponse,
  requestBody,
} from "./api";

const sourcesInput = z.strictObject({ selection: selectionSchema });
const impactInput = z.strictObject({
  selection: selectionSchema,
  question: z.string().trim().min(10).max(600),
  receipt: z.string().min(1).max(7000),
});
export async function projectOperation(
  request: Request,
  mode: "sources" | "investigate" | "impact",
) {
  let snapshot: ProjectSnapshot | undefined;
  const deadline = Date.now() + limits.deadlineMs;
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(limits.deadlineMs),
  ]);
  const initial = new RequestBudget(limits.initialRequests, signal);
  try {
    const { auth, notion } = await authenticate(request);
    const body = await requestBody(request);
    const impact = mode === "impact" ? impactInput.parse(body) : undefined;
    const selection = impact?.selection ?? sourcesInput.parse(body).selection;
    const receipt = impact ? verifyReceipt(impact.receipt, auth) : null;
    if (
      receipt &&
      (receipt.selection.repository.toLowerCase() !==
        selection.repository.toLowerCase() ||
        [...receipt.selection.pageIds].sort().join() !==
          [...selection.pageIds].sort().join())
    )
      throw new ProjectError(
        "application",
        "invalid-context",
        "The selected scope changed. Load sources and investigate again.",
      );
    snapshot = await loadProject(
      selection,
      auth.accessToken,
      notion?.accessToken,
      initial,
    );
    const revoked = snapshot.sourceErrors?.find(
      (error) => error.provider === "notion" && error.code === "unauthorized",
    );
    if (revoked)
      throw new ProjectError("notion", "unauthorized", revoked.message);
    if (mode === "sources") return privateResponse({ snapshot });
    if (!hasProjectContext(snapshot))
      throw new ProjectError(
        "application",
        "insufficient-context",
        "Investigation needs usable GitHub work and at least one readable selected Notion page. Inspect the available sources and reconnect or adjust the scope.",
      );
    if (snapshot.retryAfter)
      throw new ProjectError(
        "application",
        "rate-limited",
        "A source provider is limiting requests. Inspect available evidence and wait before investigating.",
        snapshot.retryAfter,
      );
    const readsSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(
        Math.max(1, deadline - Date.now() - limits.synthesisReserveMs),
      ),
    ]);
    const additional = new RequestBudget(
      limits.additionalRequests,
      readsSignal,
    );
    if (receipt) {
      const replayReader = createEvidenceReader(
        snapshot,
        auth.accessToken,
        initial,
      );
      for (const read of receipt.reads) await replayReader.read(read);
      snapshot.fingerprint = fingerprint(snapshot);
      if (snapshot.fingerprint !== receipt.fingerprint)
        return privateResponse({
          contextChanged: true,
          snapshot,
          message:
            "Previously inspected evidence changed or is unavailable. Review the refreshed sources and run a new investigation before assessing impact.",
        });
    }
    const reader = createEvidenceReader(
      snapshot,
      auth.accessToken,
      additional,
      receipt?.reads,
    );
    const result = await runInvestigator({
      snapshot,
      mode,
      ...(impact ? { question: impact.question } : {}),
      signal,
      deadline,
      reader,
      providerRequests: () => initial.performed + additional.performed,
    });
    snapshot.fingerprint = fingerprint(snapshot);
    return result.mode === "investigate"
      ? privateResponse({
          snapshot,
          investigation: {
            output: result.output,
            metrics: result.metrics,
            completedAt: new Date().toISOString(),
          },
          receipt: issueReceipt(snapshot, reader.completed, auth),
        })
      : privateResponse({
          snapshot,
          impact: { output: result.output, metrics: result.metrics },
          receipt: issueReceipt(
            snapshot,
            [...(receipt?.reads ?? []), ...reader.completed],
            auth,
          ),
        });
  } catch (error) {
    return failureResponse(error, snapshot);
  }
}
