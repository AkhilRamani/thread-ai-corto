import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-black/[0.06] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
