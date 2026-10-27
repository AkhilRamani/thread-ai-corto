"use client";
import type { Finding, InvestigationResult } from "@/lib/contracts";
import { ChevronRight } from "lucide-react";
export const findingCategory = (finding: Finding) =>
  ({
    "conflicting-expectations": "Conflicting expectations",
    "deferred-work": "Deferred work",
    "possible-documentation-mismatch": "Possible documentation mismatch",
  })[finding.category];
export function Findings({
  result,
  selected,
  onSelect,
}: {
  result: InvestigationResult;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const finding = result.output.findings[selected] ?? result.output.findings[0];
  if (!finding)
    return (
      <section className="border-t pt-10">
        <h2 className="text-ui-section">No disagreement established.</h2>
        <p className="mt-3 text-ui-body">{result.output.overview}</p>
      </section>
    );
  return (
    <section aria-label="Project findings">
      <h2 className="mb-6 flex items-center gap-3 text-ui-section">
        Findings
        <span className="text-ui-body text-muted-foreground tabular-nums">
          {result.output.findings.length}
        </span>
      </h2>
      <ol className="space-y-3">
        {result.output.findings.map((item, index) => (
          <li key={index}>
            <button
              className={`group flex w-full items-center gap-4 rounded-2xl px-6 py-5 text-left transition-colors ${index === selected ? "ai-finding-selected" : "hover:bg-muted"}`}
              aria-label={`Review evidence: ${item.title}`}
              aria-pressed={index === selected}
              onClick={() => onSelect(index)}
            >
              <span
                aria-hidden
                className="w-5 shrink-0 text-ui-item font-medium text-muted-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 block text-ui-meta text-muted-foreground">
                  {findingCategory(item)}
                </span>
                <span className="block text-ui-item font-medium break-words">
                  {item.title}
                </span>
              </span>
              <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover:text-foreground">
                <ChevronRight className="size-5" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-8 max-w-[760px] space-y-8 text-ui-body">
        <p className="text-muted-foreground">{finding.discovery}</p>
        <section>
          <h3 className="mb-2 text-ui-item">Why it matters</h3>
          <p>{finding.whyItMatters}</p>
        </section>
        <section>
          <h3 className="mb-2 text-ui-item">Recommended next step</h3>
          <p>{finding.suggestedAction}</p>
        </section>
      </div>
    </section>
  );
}
