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
      className="flex min-h-[407px] flex-col items-center justify-center gap-3 rounded-panel bg-muted px-8 py-16 text-center max-[600px]:min-h-[360px] max-[600px]:px-6 max-[600px]:py-12"
      aria-label="Brief status"
      aria-busy={loading}
    >
      {loading && (
        <div className="mb-6 flex w-full max-w-[300px] flex-col items-center gap-3">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
      <h2 className="text-[24px] leading-[1.25] tracking-[-0.03em] max-[600px]:text-[22px]">
        {title}
      </h2>
      <p className="max-w-[440px] text-pretty text-muted-foreground">
        {description}
      </p>
    </section>
  );
}
