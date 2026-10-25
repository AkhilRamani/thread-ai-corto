import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { GitHubUser } from "@/lib/contracts";

export function SiteHeader({
  user,
  mode = "sample",
}: {
  user?: GitHubUser;
  mode?: "sample" | "live" | "entry";
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between gap-6 border-b bg-background px-8 max-[600px]:gap-3 max-[600px]:px-5">
      <Link
        className="text-[20px] font-medium tracking-[-0.04em] no-underline max-[600px]:text-[18px]"
        href="/"
        aria-label="MySubscriptions home"
      >
        MySubscriptions
      </Link>
      <div className="flex items-center gap-5 max-[600px]:gap-2">
        {user ? (
          <>
            <Button
              className="max-[600px]:px-3 max-[600px]:text-[12px]"
              variant="ghost"
              size="sm"
              asChild
            >
              <Link href="/sample">Sample</Link>
            </Button>
            <span className="max-w-40 overflow-hidden text-ellipsis text-[14px] max-[600px]:hidden">
              {user.login}
            </span>
            <form action="/api/auth/logout" method="post">
              <Button
                className="max-[600px]:px-3 max-[600px]:text-[12px]"
                variant="secondary"
                size="sm"
                type="submit"
              >
                Sign out
              </Button>
            </form>
          </>
        ) : mode === "sample" ? (
          <>
            <span className="text-[14px] text-muted-foreground max-[600px]:hidden">
              Sample workspace
            </span>
            <Button
              className="max-[600px]:px-3 max-[600px]:text-[12px]"
              variant="secondary"
              size="sm"
              asChild
            >
              <a href="#about-sample" aria-label="About this sample">
                <span className="hidden sm:inline">About this sample</span>
                <span className="sm:hidden">Sample</span>
              </a>
            </Button>
          </>
        ) : (
          <Button
            className="max-[600px]:px-3 max-[600px]:text-[12px]"
            variant="secondary"
            size="sm"
            asChild
          >
            <Link href="/sample">Explore sample</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
