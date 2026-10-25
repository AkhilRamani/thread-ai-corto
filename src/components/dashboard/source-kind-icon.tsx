import { CircleDot, GitPullRequest } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceItem } from "@/lib/contracts";

export function SourceKindIcon({ kind }: { kind: SourceItem["kind"] }) {
  const Icon = kind === "pull-request" ? GitPullRequest : CircleDot;

  return (
    <span
      className={cn(
        "grid size-12 place-items-center rounded-xl bg-cover bg-center text-white max-[600px]:size-10 max-[600px]:rounded-[10px]",
        kind === "pull-request"
          ? "bg-[#6683ff] bg-[url('/images/source-pr-gradient.png')]"
          : "bg-[#69d7b4] bg-[url('/images/source-issue-gradient.png')]",
      )}
      aria-hidden="true"
    >
      <Icon className="max-[600px]:size-[21px]" size={24} strokeWidth={2} />
    </span>
  );
}
