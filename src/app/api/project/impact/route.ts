import { projectOperation } from "@/lib/server/project-api";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return projectOperation(request, "impact");
}
