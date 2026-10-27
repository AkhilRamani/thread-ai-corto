"use client";
import { useId, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { Evidence, ProjectSnapshot } from "@/lib/contracts";
import { ProviderIcon } from "./provider-icon";
import { SourceKindIcon } from "@/components/dashboard/source-kind-icon";
export function dateLabel(value?: string) {
  return value
    ? new Date(value).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
}
export function EvidenceSurface({
  snapshot,
  references,
  sample = false,
  title = "What the sources say",
  onSelectSource,
  selectedId,
}: {
  snapshot: ProjectSnapshot;
  references?: string[];
  sample?: boolean;
  title?: string;
  onSelectSource?: (source: Evidence) => void;
  selectedId?: string;
}) {
  const surfaceId = useId();
  const [open, setOpen] = useState<string[]>([]);
  const sources = references
    ? snapshot.evidence.filter((e) =>
        e.passages.some((p) => references.includes(p.id)),
      )
    : snapshot.evidence;
  return (
    <section
      className={onSelectSource ? "mt-9" : "mt-6 rounded-xl border bg-white"}
      aria-label={title}
    >
      <div
        className={`flex items-baseline justify-between gap-4 ${onSelectSource ? "mb-4" : "px-5 pt-5"}`}
      >
        <h2 className="text-ui-section tracking-[-0.03em]">{title}</h2>
        <span className="shrink-0 text-ui-meta text-muted-foreground">
          {sources.length} sources
        </span>
      </div>
      <div className={onSelectSource ? "space-y-2" : "px-5 py-2"}>
        {!sources.length && (
          <p className="py-6 text-muted-foreground">
            No usable evidence was returned. Adjust the selection or inspect the
            coverage below.
          </p>
        )}
        {sources.map((source) => {
          const expanded = open.includes(source.id);
          const passage =
            source.passages.find((p) => references?.includes(p.id)) ??
            source.passages[0];
          return (
            <div
              className={onSelectSource ? "" : "border-b last:border-b-0"}
              key={source.id}
              id={`${surfaceId}-evidence-${source.id}`}
            >
              <button
                type="button"
                className={`flex w-full items-center rounded-lg px-4 py-4 text-left hover:bg-muted ${onSelectSource ? "min-h-[86px] gap-5" : "gap-4"} ${source.id === selectedId ? "bg-secondary" : ""}`}
                aria-expanded={onSelectSource ? undefined : expanded}
                aria-pressed={
                  onSelectSource ? source.id === selectedId : undefined
                }
                aria-controls={
                  onSelectSource
                    ? undefined
                    : `${surfaceId}-passages-${source.id}`
                }
                onClick={() =>
                  onSelectSource
                    ? onSelectSource(source)
                    : setOpen((ids) =>
                        expanded
                          ? ids.filter((id) => id !== source.id)
                          : [...ids, source.id],
                      )
                }
              >
                <span className="flex size-12 shrink-0 items-center justify-center max-[600px]:size-10">
                  {source.kind === "pull-request" || source.kind === "issue" ? (
                    <SourceKindIcon kind={source.kind} />
                  ) : (
                    <ProviderIcon provider={source.provider} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-item font-medium break-words">
                    {source.title}
                  </span>
                  <span
                    className={`block text-ui-meta text-muted-foreground ${onSelectSource ? "mt-1" : ""}`}
                  >
                    {source.provider === "notion"
                      ? "Notion page"
                      : source.kind.replaceAll("-", " ")}{" "}
                    {source.status && `· ${source.status}`}
                    {(source.updatedAt || source.createdAt) &&
                      ` · ${dateLabel(source.updatedAt ?? source.createdAt)}`}
                  </span>
                  {!onSelectSource && (
                    <span className="mt-1 block text-ui-body break-words">
                      {passage
                        ? `“${passage.text.slice(0, 190)}${passage.text.length > 190 ? "…" : ""}”`
                        : "No text passage available."}
                    </span>
                  )}
                </span>
                {onSelectSource ? (
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                ) : (
                  <ChevronDown
                    aria-hidden
                    className={`size-4 shrink-0 ${expanded ? "rotate-180" : ""}`}
                  />
                )}
              </button>
              {expanded && (
                <div
                  id={`${surfaceId}-passages-${source.id}`}
                  className="space-y-4 pb-5 pl-12 text-ui-body max-[600px]:pl-0"
                >
                  <p className="text-muted-foreground">
                    {source.author &&
                      `By ${source.author}${source.role ? ` (${source.role})` : ""}. `}
                    {source.createdAt &&
                      `Created ${dateLabel(source.createdAt)}. `}
                    Fetched {dateLabel(source.fetchedAt)}.{" "}
                    {source.layer === "historical"
                      ? source.inclusionReason
                      : source.layer === "recent"
                        ? "Recent activity, not the complete backlog."
                        : source.layer === "document"
                          ? "Current page text; edit time does not identify changes."
                          : "Selected deeper evidence."}
                  </p>
                  <p className="break-words font-mono text-ui-label text-muted-foreground">
                    Updated{" "}
                    {source.updatedAt ?? source.createdAt ?? "unavailable"} ·
                    Fetched {source.fetchedAt}
                  </p>
                  {source.passages.map((p) => (
                    <blockquote
                      key={p.id}
                      className={`border-l-2 pl-4 ${references?.includes(p.id) ? "border-[#7676a8]" : ""}`}
                    >
                      {p.heading && (
                        <p className="mb-1 font-medium">{p.heading}</p>
                      )}
                      {p.file && (
                        <p className="mb-2 break-all font-mono text-ui-label text-muted-foreground">
                          {p.file.path} · {p.file.sha.slice(0, 12)}
                          {p.file.startLine &&
                            ` · hunk starts at line ${p.file.startLine}`}
                        </p>
                      )}
                      <p
                        className={`whitespace-pre-wrap break-words ${p.file ? "font-mono text-ui-meta" : ""}`}
                      >
                        {p.text}
                      </p>
                    </blockquote>
                  ))}
                  {source.limitations.length > 0 && (
                    <ul className="list-disc space-y-1 pl-4 text-ui-meta text-muted-foreground">
                      {source.limitations.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  )}
                  <OriginalLink source={source} sample={sample} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function OriginalLink({
  source,
  sample,
}: {
  source: Evidence;
  sample: boolean;
}) {
  return sample ? (
    <span className="text-ui-meta text-muted-foreground">
      Synthetic source. No live original is linked.
    </span>
  ) : (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-ui-body underline underline-offset-4"
    >
      Open original <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
