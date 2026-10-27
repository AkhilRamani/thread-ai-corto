"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import type { GitHubUser } from "@/lib/contracts";

export function SiteHeader({
  user,
  mode = "sample",
  view,
  onViewChange,
}: {
  user?: GitHubUser;
  mode?: "sample" | "live" | "entry";
  view?: "brief" | "plan";
  onViewChange?: (view: "brief" | "plan") => void;
}) {
  if (view)
    return (
      <header className="workspace-header sticky top-0 z-20 grid min-h-[68px] grid-cols-[1fr_auto_1fr] items-center gap-6 border-b bg-white px-8 max-[600px]:grid-cols-[1fr_auto] max-[600px]:gap-0 max-[600px]:px-5">
        <Link
          href="/"
          className="text-[20px] font-medium tracking-[-0.04em] max-[600px]:py-4 max-[600px]:text-[18px]"
          aria-label="Thread home"
        >
          Thread
        </Link>
        <nav
          aria-label="Workspace"
          className="flex h-[68px] gap-7 max-[600px]:order-3 max-[600px]:col-span-2 max-[600px]:h-12"
        >
          {(
            [
              ["brief", "PR brief"],
              ["plan", "Plan check"],
            ] as const
          ).map(([key, label]) => (
            <a
              key={key}
              href={`${mode === "sample" ? "/sample" : "/dashboard"}?view=${key}`}
              aria-current={view === key ? "page" : undefined}
              onClick={(event) => {
                if (
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  onViewChange?.(key);
                }
              }}
              className={`flex items-center border-b-2 px-1 text-ui-body font-medium ${view === key ? "border-black text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="justify-self-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${user?.login ?? "Example"} account menu`}
                className="flex items-center gap-2.5 rounded-full bg-secondary py-1.5 pr-3 pl-1.5 text-ui-body transition-colors hover:bg-black/10 data-[state=open]:bg-black/10"
              >
                <Avatar className="size-7" aria-hidden="true">
                  {user && (
                    <AvatarImage
                      src={`https://avatars.githubusercontent.com/u/${user.id}?s=64`}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <AvatarFallback className="bg-background text-ui-label font-medium">
                    {user ? user.login.slice(0, 2).toUpperCase() : "EX"}
                  </AvatarFallback>
                </Avatar>
                <span>{user?.login ?? "Example"}</span>
                <ChevronDown
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                {mode === "sample"
                  ? "Synthetic example workspace"
                  : "GitHub connected · Public sources"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/sample">Explore example</Link>
                  </DropdownMenuItem>
                  <form action="/api/auth/logout" method="post">
                    <DropdownMenuItem
                      asChild
                      onSelect={(event) => event.preventDefault()}
                    >
                      <button className="w-full" type="submit">
                        <LogOut aria-hidden="true" />
                        Sign out
                      </button>
                    </DropdownMenuItem>
                  </form>
                </>
              ) : (
                <DropdownMenuItem asChild>
                  <a href="/api/auth/github">Continue with GitHub</a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    );
  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between gap-6 border-b bg-background px-8 max-[600px]:gap-3 max-[600px]:px-5">
      <Link
        className="text-[20px] font-medium tracking-[-0.04em] no-underline max-[600px]:text-[18px]"
        href="/"
        aria-label="Thread home"
      >
        Thread
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
            <span className="max-w-40 overflow-hidden text-ellipsis text-ui-body max-[600px]:hidden">
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
            <span className="text-ui-body text-muted-foreground max-[600px]:hidden">
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
