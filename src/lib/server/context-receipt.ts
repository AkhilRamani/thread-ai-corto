import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  readSchema,
  selectionSchema,
  type EvidenceRead,
  type ProjectSnapshot,
} from "@/lib/contracts";
import { getAuthConfig } from "./config";
import type { Auth } from "./session";
import { ProjectError } from "./errors";
const receiptSchema = z.strictObject({
  version: z.literal(1),
  nonce: z.string(),
  selection: selectionSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reads: z.array(readSchema).max(8),
  expiresAt: z.number(),
});
function signature(body: string) {
  return createHmac("sha256", getAuthConfig()!.sessionPassword)
    .update(`project-context:${body}`)
    .digest("base64url");
}
export function issueReceipt(
  snapshot: ProjectSnapshot,
  reads: EvidenceRead[],
  auth: Auth,
) {
  const body = Buffer.from(
    JSON.stringify({
      version: 1,
      nonce: auth.nonce,
      selection: snapshot.selection,
      fingerprint: snapshot.fingerprint,
      reads,
      expiresAt: Math.min(auth.expiresAt, Date.now() + 3600000),
    }),
  ).toString("base64url");
  return `${body}.${signature(body)}`;
}
export function verifyReceipt(value: string, auth: Auth) {
  try {
    if (value.length > 7000) throw new Error();
    const [body, sig, extra] = value.split(".");
    const actual = Buffer.from(sig ?? "");
    const expected = Buffer.from(signature(body));
    if (
      extra ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error();
    const receipt = receiptSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (receipt.nonce !== auth.nonce || receipt.expiresAt <= Date.now())
      throw new Error();
    return receipt;
  } catch {
    throw new ProjectError(
      "application",
      "invalid-context",
      "This investigation context expired or is invalid. Investigate the project again.",
    );
  }
}
