import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Evidence } from "@/lib/contracts";
import { ProviderIcon } from "./provider-icon";
import { SourceKindIcon } from "@/components/dashboard/source-kind-icon";
import { dateLabel, OriginalLink } from "./evidence-surface";

export function EvidenceDetails({
  sources,
  references,
  counterevidence = [],
  sample = false,
  showTitle = true,
}: {
  sources: Evidence[];
  references?: string[];
  counterevidence?: string[];
  sample?: boolean;
  showTitle?: boolean;
}) {
  // Put the first passage from each service together before additional context.
  const other = sources.findIndex(
    (source) => source.provider !== sources[0]?.provider,
  );
  const ordered =
    other > 1
      ? [
          sources[0],
          sources[other],
          ...sources.slice(1, other),
          ...sources.slice(other + 1),
        ]
      : sources;
  return (
    <div className="space-y-7">
      {ordered.map((source) => (
        <section key={source.id} className="border-b pb-7 last:border-0">
          <div className="mb-8 flex items-start gap-3">
            {source.kind === "pull-request" || source.kind === "issue" ? (
              <SourceKindIcon kind={source.kind} />
            ) : (
              <ProviderIcon provider={source.provider} />
            )}
            <div className="min-w-0">
              {showTitle && (
                <h3 className="text-ui-item break-words">{source.title}</h3>
              )}
              <p className="text-ui-meta text-muted-foreground">
                {source.kind.replaceAll("-", " ")}
                {source.status && ` · ${source.status}`} ·{" "}
                {dateLabel(source.updatedAt ?? source.createdAt)}
              </p>
              {source.author && (
                <p className="text-ui-meta text-muted-foreground">
                  {source.author}
                  {source.role && ` · ${source.role}`}
                </p>
              )}
            </div>
          </div>
          {source.passages.length ? (
            source.passages
              .filter((p) => !references || references.includes(p.id))
              .map((p) => (
                <blockquote
                  key={p.id}
                  className="mb-4 rounded-lg bg-secondary p-4 text-ui-body break-words"
                >
                  {counterevidence.includes(p.id) && (
                    <p className="mb-2 font-medium">Material counterevidence</p>
                  )}
                  {p.heading && <p className="mb-2 font-medium">{p.heading}</p>}
                  {p.file && (
                    <p className="mb-2 break-all font-mono text-ui-label">
                      {p.file.path} · {p.file.sha.slice(0, 12)}
                      {p.file.startLine && ` · line ${p.file.startLine}`}
                    </p>
                  )}
                  <p
                    className={`whitespace-pre-wrap ${p.file ? "font-mono text-ui-meta" : ""}`}
                  >
                    {p.text}
                  </p>
                </blockquote>
              ))
          ) : (
            <p className="mb-4 text-ui-body text-muted-foreground">
              No text passage is available.
            </p>
          )}
          <OriginalLink source={source} sample={sample} />
          {source.limitations.length > 0 && (
            <Accordion
              type="single"
              collapsible
              className="mt-3 text-ui-meta text-muted-foreground"
            >
              <AccordionItem value="source-coverage" className="border-0">
                <AccordionTrigger className="py-3 text-ui-meta font-normal">
                  Source coverage
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {source.limitations.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </section>
      ))}
    </div>
  );
}
