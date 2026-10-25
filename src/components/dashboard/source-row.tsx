import { ArrowRight, ExternalLink } from "lucide-react";
import {
  formatSourceDate,
  sourceLabel,
  type SourceItem,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { SourceKindIcon } from "./source-kind-icon";

type SourceRowProps = {
  source: SourceItem;
  expanded: boolean;
  onToggle: () => void;
};

export function SourceRow({ source, expanded, onToggle }: SourceRowProps) {
  return (
    <li className="border-b last:border-b-0">
      <button
        id={`source-${source.id}`}
        className="group grid min-h-28 w-full grid-cols-[48px_minmax(0,1fr)_20px] items-center gap-5 rounded-sm py-6 text-left max-[600px]:grid-cols-[40px_minmax(0,1fr)_20px] max-[600px]:gap-3.5 max-[600px]:py-[22px]"
        aria-expanded={expanded}
        aria-controls={`source-detail-${source.id}`}
        onClick={onToggle}
      >
        <SourceKindIcon kind={source.kind} />
        <span className="min-w-0">
          <span className="block text-[20px] leading-[30px] tracking-[-0.03em] wrap-anywhere group-hover:underline group-hover:decoration-[#aaa] group-hover:underline-offset-5 max-[600px]:text-[18px] max-[600px]:leading-[27px]">
            {source.title}
          </span>
          <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[12px] leading-[18px] font-normal tracking-normal wrap-anywhere text-muted-foreground uppercase max-[600px]:text-[10px]">
            <span className="text-foreground">
              {source.kind === "pull-request" ? "Pull request" : "Issue"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{sourceLabel(source)}</span>
            <span className="whitespace-nowrap">
              · {source.status} · {formatSourceDate(source.updatedAt)}
            </span>
          </span>
        </span>
        <ArrowRight
          className={cn(
            "shrink-0 text-[#777] transition-transform duration-[180ms]",
            expanded && "rotate-90",
          )}
          size={20}
          aria-hidden="true"
        />
      </button>
      <div
        id={`source-detail-${source.id}`}
        className="ml-[68px] max-w-[680px] pr-6 pb-6 max-[600px]:ml-[54px] max-[600px]:pr-0"
        hidden={!expanded}
      >
        <p className="text-[15px] leading-[1.6] wrap-anywhere whitespace-pre-wrap">
          {source.description || "No description was provided."}
        </p>
        {source.url ? (
          <a
            className="mt-4 inline-flex items-center gap-2 underline underline-offset-4"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            Open on GitHub <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-3 text-[13px] leading-[1.6] wrap-anywhere text-muted-foreground">
            Illustrative source. This is not a real GitHub{" "}
            {source.kind === "issue" ? "issue" : "pull request"}.
          </p>
        )}
      </div>
    </li>
  );
}
