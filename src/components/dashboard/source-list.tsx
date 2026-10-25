import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatSourceDate,
  sourceLabel,
  type SourceSnapshot,
} from "@/lib/contracts";

type SourceListProps = {
  snapshot: SourceSnapshot;
  loading: boolean;
  busy: boolean;
  error: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRefresh: () => void;
};

export function SourceList({
  snapshot,
  loading,
  busy,
  error,
  expandedId,
  onToggle,
  onRefresh,
}: SourceListProps) {
  return (
    <section
      className="sources-section"
      aria-labelledby="sources-heading"
      aria-busy={loading}
    >
      <div className="section-heading">
        <h2 id="sources-heading">Sources</h2>
        <Button variant="link" size="link" onClick={onRefresh} disabled={busy}>
          {loading
            ? "Refreshing…"
            : error
              ? "Retry sources"
              : "Refresh sources"}
        </Button>
      </div>
      <p className="coverage-note">
        Public pull requests & assigned issues · Sample snapshot, 25 Oct 2026
      </p>
      {snapshot.coverage === "partial" && (
        <p className="coverage-warning" role="status">
          Issues could not be retrieved. This brief only covers the available
          pull request.
        </p>
      )}
      {loading ? (
        <div aria-label="Loading sources" className="source-skeletons">
          {[0, 1].map((index) => (
            <div className="source-skeleton" key={index}>
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="source-message" role="alert">
          <h3>GitHub is unavailable right now.</h3>
          <p>
            Try again to load your sources. A brief needs source data first.
          </p>
        </div>
      ) : snapshot.items.length === 0 ? (
        <div className="source-message">
          <h3>No matching public activity.</h3>
          <p>
            No recent authored pull requests, open authored pull requests, or
            assigned issues were found. Private work is not included.
          </p>
        </div>
      ) : (
        <ul className="source-list">
          {snapshot.items.map((source) => {
            const expanded = expandedId === source.id;
            return (
              <li className="source-item" key={source.id}>
                <button
                  id={`source-${source.id}`}
                  className="source-row"
                  aria-expanded={expanded}
                  aria-controls={`source-detail-${source.id}`}
                  onClick={() => onToggle(source.id)}
                >
                  <span>
                    <span className="source-title">{source.title}</span>
                    <span className="eyebrow source-meta">
                      {sourceLabel(source)} · {source.status} ·{" "}
                      {formatSourceDate(source.updatedAt)}
                    </span>
                  </span>
                  <ArrowRight
                    className={
                      expanded ? "source-arrow is-open" : "source-arrow"
                    }
                    size={20}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={`source-detail-${source.id}`}
                  className="source-detail"
                  hidden={!expanded}
                >
                  <p>{source.description}</p>
                  {source.url ? (
                    <a
                      className="external-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open on GitHub{" "}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="sample-source-note">
                      Illustrative source. This is not a real GitHub{" "}
                      {source.kind === "issue" ? "issue" : "pull request"}.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
