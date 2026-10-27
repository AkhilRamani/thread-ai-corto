import { Workspace } from "@/components/dashboard/workspace";
export default async function SamplePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <Workspace sample initialView={view === "plan" ? "plan" : "brief"} />;
}
