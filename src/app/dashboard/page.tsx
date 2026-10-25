import { redirect } from "next/navigation";
import { GitHubDashboard } from "@/components/dashboard/github-dashboard";
import { getSignedInUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSignedInUser();
  if (!user) redirect("/?auth=expired");
  // Only the public identity crosses the server/client boundary, never the session.
  return <GitHubDashboard user={user} />;
}
