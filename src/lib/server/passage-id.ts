import "server-only";
import { createHash } from "node:crypto";
// Short opaque IDs reduce transcription mistakes while preserving identity across fetches.
export function passageId(sourceId: string, localId: string) {
  return `p-${createHash("sha256").update(`${sourceId}:${localId}`).digest("hex").slice(0, 20)}`;
}
