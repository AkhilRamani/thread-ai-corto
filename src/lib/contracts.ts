export type SourceItem = {
  id: string;
  kind: "pull-request" | "issue";
  repository: string;
  number: number;
  title: string;
  description: string;
  status: "Open" | "Assigned" | "Merged";
  updatedAt: string;
  url?: string;
};

export type SourceSnapshot = {
  items: SourceItem[];
  fetchedAt: string;
  coverage: "complete" | "partial";
};

export type WorkBrief = {
  title: string;
  overview: string;
  sourceIds: string[];
  observations: { text: string; sourceIds: string[] }[];
  nextStep?: string;
};

export function sourceLabel(source: SourceItem) {
  return `${source.repository} #${source.number}`;
}

export function formatSourceDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
