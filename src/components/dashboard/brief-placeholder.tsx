import { Skeleton } from "@/components/ui/skeleton";

export function BriefPlaceholder({
  loading,
  title,
  description,
}: {
  loading?: boolean;
  title: string;
  description: string;
}) {
  return (
    <section
      className="brief-placeholder"
      aria-label="Brief status"
      aria-busy={loading}
    >
      {loading && (
        <div className="placeholder-lines">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
