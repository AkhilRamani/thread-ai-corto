"use client";
import { Check, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PageOption, ProjectSelection } from "@/lib/contracts";
import { ProviderIcon } from "./provider-icon";
import { RepositoryPicker } from "./repository-picker";
import { NotionPages } from "./notion-pages";

export function ProjectSetup({
  selection,
  knownPages = [],
  onChange,
  onLoad,
  onDisconnect,
  connected,
  notionAvailable,
  busy,
  sample,
}: {
  selection: ProjectSelection;
  knownPages?: PageOption[];
  onChange: (value: ProjectSelection) => void;
  onLoad: () => void;
  onDisconnect: () => void;
  connected: boolean;
  notionAvailable: boolean;
  busy: boolean;
  sample: boolean;
}) {
  const ready =
    !!selection.repository && connected && selection.pageIds.length > 0;
  return (
    <section id="project-sources" className="mb-8" aria-label="Source setup">
      <h2 className="text-ui-section tracking-[-0.03em]">
        Choose your project sources
      </h2>
      <p className="mt-2 text-ui-body text-muted-foreground">
        One repository. Up to five pages with your plans.
      </p>
      <div className="mt-6 space-y-5">
        <Card
          className="gap-0 overflow-hidden rounded-[20px] bg-secondary py-0"
          role="group"
          aria-labelledby="github-setup-title"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-4 bg-secondary py-5">
            <div className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-background">
                <ProviderIcon provider="github" />
              </span>
              <div>
                <p className="mb-1 text-ui-meta text-muted-foreground">
                  Step 1 · Work
                </p>
                <CardTitle>
                  <h3
                    id="github-setup-title"
                    className="text-ui-item font-medium"
                  >
                    GitHub
                  </h3>
                </CardTitle>
              </div>
            </div>
            <Badge
              className="bg-background"
              variant={selection.repository ? "secondary" : "outline"}
            >
              {selection.repository ? (
                <>
                  <Check aria-hidden />
                  Repository selected
                </>
              ) : (
                "Choose a repository"
              )}
            </Badge>
          </CardHeader>
          <CardContent className="rounded-[18px] border-t bg-background p-6 shadow-[0_-2px_8px_rgb(0_0_0/3%)]">
            <RepositoryPicker
              value={selection.repository}
              onChange={(repository) => onChange({ ...selection, repository })}
              disabled={busy}
              sample={sample}
            />
          </CardContent>
        </Card>
        <NotionPages
          repository={selection.repository}
          selected={selection.pageIds}
          knownPages={knownPages}
          onChange={(pageIds) => onChange({ ...selection, pageIds })}
          onDisconnect={onDisconnect}
          connected={connected}
          available={notionAvailable}
          disabled={busy}
          sample={sample}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-secondary px-5 py-4">
        <div className="flex items-center gap-3">
          <Eye className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-ui-body font-medium">Review sources first</p>
            <p className="text-ui-meta text-muted-foreground">
              {ready
                ? "No AI request until you run the check."
                : "GitHub preview works before connecting Notion."}
            </p>
          </div>
        </div>
        <Button
          variant={ready ? "default" : "secondary"}
          className={
            ready ? undefined : "border bg-background hover:bg-background/80"
          }
          onClick={onLoad}
          disabled={busy || !selection.repository}
        >
          {ready ? "Preview project sources" : "Preview GitHub sources"}
        </Button>
      </div>
    </section>
  );
}
