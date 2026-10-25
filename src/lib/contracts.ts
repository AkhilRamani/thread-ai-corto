import type { WorkBrief } from "./brief-schema";
export type { WorkBrief } from "./brief-schema";

export type SourceItem = {
  id: string;
  kind: "pull-request" | "issue";
  repository: string;
  number: number;
  title: string;
  description: string;
  status: "Open" | "Draft" | "Assigned" | "Merged" | "Closed";
  updatedAt: string;
  labels?: string[];
  url?: string;
};

export type SourceSnapshot = {
  items: SourceItem[];
  fetchedAt: string;
  coverage: "complete" | "partial";
  collections?: SourceCollection[];
  retryAfter?: number;
};

export type SourceCollection = {
  label: string;
  limit: number;
  total: number | null;
  returned: number;
  capped: boolean;
  incomplete: boolean;
  error?: string;
};

export type GitHubUser = { id: number; login: string };
export type SourceErrorCode =
  "unauthorized" | "rate-limited" | "unavailable" | "not-configured";
export type SourcesResponse =
  | { snapshot: SourceSnapshot }
  | { error: SourceErrorCode; message: string; retryAfter?: number };

export type BriefErrorCode =
  | SourceErrorCode
  | "invalid-output"
  | "refused"
  | "timeout"
  | "quota-exhausted";
export type BriefResponse =
  | { snapshot: SourceSnapshot; brief: WorkBrief | null }
  | {
      error: BriefErrorCode;
      message: string;
      stage: "sources" | "brief";
      snapshot?: SourceSnapshot;
      retryAfter?: number;
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
