import { briefOperation } from "@/lib/server/brief-api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return briefOperation(request, false);
}
