import type { SourceItem, WorkBrief } from "@/lib/contracts";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceReferences } from "./source-references";

export function BriefDetails({
  brief,
  sources,
  onSourceSelect,
}: {
  brief: WorkBrief;
  sources: SourceItem[];
  onSourceSelect: (id: string) => void;
}) {
  // The model chooses a source ID; the destination comes only from GitHub data.
  const startingSource = sources.find(
    (source) => source.id === brief.nextStep?.sourceIds[0],
  );
  return (
    <>
      {brief.nextStep && (
        <section
          className="mt-10 max-[600px]:mt-8"
          aria-label="Suggested next step"
        >
          <h2 className="mb-3 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase">
            Suggested next step
          </h2>
          <p className="max-w-[720px] text-pretty">{brief.nextStep.text}</p>
          <SourceReferences
            sourceIds={brief.nextStep.sourceIds}
            sources={sources}
            onSourceSelect={onSourceSelect}
            label="Sources for the suggested next step"
          />
          {startingSource && (
            <div className="mt-5">
              {startingSource.url ? (
                <Button asChild>
                  <a
                    href={startingSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open{" "}
                    {startingSource.kind === "pull-request" ? "PR" : "issue"} #
                    {startingSource.number} on GitHub
                    <ExternalLink aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Button>
              ) : (
                <Button onClick={() => onSourceSelect(startingSource.id)}>
                  View suggested source
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      {brief.observations.length > 0 && (
        <div className="mt-10 grid gap-6 max-[600px]:mt-8">
          {brief.observations.map((observation, index) => (
            <div key={index}>
              <p>{observation.text}</p>
              <SourceReferences
                sourceIds={observation.sourceIds}
                sources={sources}
                onSourceSelect={onSourceSelect}
                label={`Sources for observation ${index + 1}`}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
