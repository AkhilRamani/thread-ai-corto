import { briefOperation } from "@/lib/server/brief-api";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return briefOperation(request, true);
}
