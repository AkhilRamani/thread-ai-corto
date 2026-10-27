import { sourceLabel, type SourceItem, type WorkBrief } from "./contracts";

export function briefToText(
  brief: WorkBrief,
  sources: SourceItem[],
  sample = false,
) {
  const referencedIds = new Set([
    ...brief.sourceIds,
    ...brief.observations.flatMap((observation) => observation.sourceIds),
    ...(brief.nextStep?.sourceIds ?? []),
  ]);
  return [
    ...(sample ? ["Thread · illustrative sample"] : []),
    brief.title,
    brief.overview,
    ...brief.observations.map((observation) => observation.text),
    ...(brief.nextStep ? [`Suggested next step: ${brief.nextStep.text}`] : []),
    "Sources:",
    ...sources
      .filter((source) => referencedIds.has(source.id))
      .map(
        (source) =>
          `${sourceLabel(source)} — ${source.title}${source.url ? `\n${source.url}` : " (synthetic sample)"}`,
      ),
  ].join("\n\n");
}
