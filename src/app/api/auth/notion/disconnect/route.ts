import { isSameOrigin } from "@/lib/server/config";
import { clearNotionConnection } from "@/lib/server/notion-oauth";
import { privateHeaders } from "@/lib/server/responses";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return new Response("Invalid request origin.", {
      status: 403,
      headers: privateHeaders,
    });
  await clearNotionConnection();
  return Response.json({ disconnected: true }, { headers: privateHeaders });
}
