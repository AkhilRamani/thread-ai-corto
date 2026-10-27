import { repositorySchema } from "@/lib/contracts";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/dashboard/workspace";
import { getSession, validAuth } from "@/lib/server/session";
import {
  getAIConfig,
  getNotionConfig,
  getAuthConfig,
} from "@/lib/server/config";
import {
  getNotionSession,
  validNotionConnection,
} from "@/lib/server/notion-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const notices: Record<string, string> = {
  "not-configured": "Notion connection is not configured for this environment.",
  "invalid-state":
    "This Notion connection attempt expired or belongs to another session. Start again.",
  cancelled: "Notion connection was cancelled.",
  failed: "Notion could not be connected. Try again.",
};
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    notion?: string;
    repository?: string;
    view?: string;
  }>;
}) {
  if (!getAuthConfig()) redirect("/?auth=not-configured");
  const auth = validAuth((await getSession()).auth);
  if (!auth) redirect("/?auth=expired");
  const notion = validNotionConnection(
    (await getNotionSession()).connection,
    auth,
  );
  const { notion: status, repository, view } = await searchParams;
  const initialRepository = repositorySchema.safeParse(repository);
  return (
    <Workspace
      initialView={view === "plan" || !!status ? "plan" : "brief"}
      user={auth.user}
      initialRepository={
        initialRepository.success ? initialRepository.data : undefined
      }
      aiAvailable={!!getAIConfig()}
      notionAvailable={!!getNotionConfig()}
      notionConnected={!!notion}
      notice={
        status && Object.hasOwn(notices, status) ? notices[status] : undefined
      }
    />
  );
}
