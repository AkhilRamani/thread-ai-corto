import { sourceLabel, type SourceItem } from "@/lib/contracts";

import { cn } from "@/lib/utils";

type SourceReferencesProps = {
  sourceIds: string[];
  sources: SourceItem[];
  onSourceSelect: (id: string) => void;
  label: string;
  variant?: "default" | "panel";
};

export function SourceReferences({
  sourceIds,
  sources,
  onSourceSelect,
  label,
  variant = "default",
}: SourceReferencesProps) {
  const references = sources.filter((source) => sourceIds.includes(source.id));
  if (!references.length) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap",
        variant === "panel"
          ? "mt-7 justify-center gap-x-6 gap-y-3"
          : "mt-2 gap-x-5 gap-y-2",
      )}
      role="group"
      aria-label={label}
    >
      {references.map((source) => (
        <button
          className={cn(
            "min-h-11 underline underline-offset-5 transition-colors duration-150",
            variant === "panel"
              ? "text-[16px] text-white decoration-white/50 hover:decoration-white focus-visible:outline-white"
              : "text-[14px] text-muted-foreground decoration-current hover:text-foreground focus-visible:outline-foreground",
          )}
          key={source.id}
          onClick={() => onSourceSelect(source.id)}
          aria-label={`View source ${sourceLabel(source)}`}
        >
          {sourceLabel(source)}
        </button>
      ))}
    </div>
  );
}
