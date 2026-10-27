"use client";
import { useCallback, useEffect, useState } from "react";
import type { GitHubUser } from "@/lib/contracts";
import { SiteHeader } from "./site-header";
import { BriefDashboard } from "./brief-dashboard";
import { ProjectDashboard } from "@/components/investigator/project-dashboard";
import { Button } from "@/components/ui/button";

export function Workspace({
  initialView = "brief",
  ...props
}: {
  initialView?: "brief" | "plan";
  user?: GitHubUser;
  sample?: boolean;
  aiAvailable?: boolean;
  notionAvailable?: boolean;
  notionConnected?: boolean;
  notice?: string;
  initialRepository?: string;
}) {
  const [view, setView] = useState(initialView);
  const [visited, setVisited] = useState({
    brief: initialView === "brief",
    plan: initialView === "plan",
  });
  const [expired, setExpired] = useState(false);
  const expire = useCallback(() => setExpired(true), []);
  function select(next: "brief" | "plan") {
    setView(next);
    setVisited((current) => ({ ...current, [next]: true }));
    if (next !== view) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      url.hash = "";
      url.searchParams.delete("notion");
      url.searchParams.delete("repository");
      window.history.pushState(null, "", url);
    }
  }
  useEffect(() => {
    const pop = () => {
      const next =
        new URL(window.location.href).searchParams.get("view") === "plan"
          ? "plan"
          : "brief";
      setView(next);
      setVisited((current) => ({ ...current, [next]: true }));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  return (
    <>
      <a
        className="fixed top-[-100px] left-4 z-50 rounded-full bg-black px-5 py-3 text-white focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader
        user={expired ? undefined : props.user}
        mode={props.sample ? "sample" : "live"}
        view={view}
        onViewChange={(next) => select(next)}
      />
      <main id="main">
        {expired ? (
          <section className="mx-auto max-w-[860px] px-5 py-12">
            <h1 className="text-ui-title">Reconnect GitHub</h1>
            <p className="my-4">
              Your session expired. Sign in again to load your work.
            </p>
            <Button asChild>
              <a href="/api/auth/github">Continue with GitHub</a>
            </Button>
          </section>
        ) : (
          <>
            {visited.brief && (
              <div hidden={view !== "brief"}>
                <BriefDashboard
                  active={view === "brief"}
                  sample={props.sample ?? false}
                  aiAvailable={props.aiAvailable ?? true}
                  onExpired={expire}
                />
              </div>
            )}
            {visited.plan && (
              <div hidden={view !== "plan"}>
                <ProjectDashboard
                  {...props}
                  active={view === "plan"}
                  onExpired={expire}
                />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
