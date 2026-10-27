import { z } from "zod";
import type { WorkBrief } from "./brief-schema";
export type { WorkBrief } from "./brief-schema";

export type GitHubUser = { id: number; login: string };
export const repositorySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/)
  .refine((value) => !value.endsWith("/.") && !value.endsWith("/.."));
export const pageIdSchema = z
  .string()
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  .transform((id) => id.toLowerCase());
export const selectionSchema = z.strictObject({
  repository: repositorySchema,
  pageIds: z
    .array(pageIdSchema)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type ProjectSelection = z.infer<typeof selectionSchema>;
export type Passage = {
  id: string;
  text: string;
  heading?: string;
  blockId?: string;
  file?: { path: string; sha: string; startLine?: number };
};
export type Evidence = {
  id: string;
  provider: "github" | "notion";
  kind:
    | "issue"
    | "pull-request"
    | "page"
    | "comment"
    | "review"
    | "timeline"
    | "file";
  layer: "recent" | "document" | "historical" | "detail";
  parentId?: string;
  title: string;
  url: string;
  status?: string;
  author?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  fetchedAt: string;
  passages: Passage[];
  limitations: string[];
  number?: number;
  headSha?: string;
  inclusionReason?: string;
};
export type TraceEntry = {
  operation: string;
  outcome: "ok" | "partial" | "failed" | "skipped";
  sourceIds: string[];
  detail: string;
};
export type ProjectSnapshot = {
  selection: ProjectSelection;
  repositoryUrl: string;
  evidence: Evidence[];
  fetchedAt: string;
  fingerprint: string;
  limitations: string[];
  trace: TraceEntry[];
  retryAfter?: number;
  sourceErrors?: {
    provider: "github" | "notion" | "application";
    code: string;
    message: string;
  }[];
};
const text = (max: number) => z.string().trim().min(1).max(max);
const passageReference = z
  .string()
  .regex(/^p-[a-f0-9]{20}$/)
  .describe(
    "Exact passage ID from supplied evidence. Never prose or a source ID.",
  );
const refs = z.array(passageReference).min(1).max(8);
export const findingSchema = z.strictObject({
  category: z.enum([
    "conflicting-expectations",
    "deferred-work",
    "possible-documentation-mismatch",
  ]),
  title: text(120),
  discovery: text(650),
  whyItMatters: text(450),
  suggestedAction: text(450),
  evidence: refs,
  counterevidencePassageIds: z.array(passageReference).max(8),
  unknowns: z.array(text(300)).min(1).max(4),
});
export const investigationSchema = z.strictObject({
  overview: text(600),
  findings: z.array(findingSchema).max(3),
  limitations: z.array(text(300)).max(8),
});
export const impactSchema = z.strictObject({
  explanation: text(650),
  affected: z
    .array(
      z.strictObject({
        title: text(150),
        reason: text(450),
        evidence: refs,
        suggestedCheck: text(400),
        effect: z.enum(["directly-evidenced", "possible"]),
      }),
    )
    .max(5),
  unexamined: z.array(text(300)).min(1).max(8),
});
export const readSchema = z.strictObject({
  operation: z.enum(["discussion", "files", "reference"]),
  sourceId: text(120),
  reference: z.number().int().min(1).max(1_000_000).nullable(),
});
export const readPlanSchema = z.strictObject({
  reads: z.array(readSchema).max(3),
});
export type EvidenceRead = z.infer<typeof readSchema>;
export type Investigation = z.infer<typeof investigationSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Impact = z.infer<typeof impactSchema>;
export type Metrics = {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerRequests: number;
};
export type InvestigationResult = {
  output: Investigation;
  metrics: Metrics;
  completedAt: string;
};
export type ImpactResult = { output: Impact; metrics: Metrics };
export type RepositoryOption = { fullName: string; description: string };
export type RepositoryOptions = {
  repositories: RepositoryOption[];
  capped: boolean;
};
export type PageOptions = { pages: PageOption[]; capped: boolean };
export type PageOption = {
  id: string;
  title: string;
  updatedAt: string;
  url: string;
};
export type ProjectResponse = {
  snapshot?: ProjectSnapshot;
  investigation?: InvestigationResult;
  impact?: ImpactResult;
  receipt?: string;
  contextChanged?: boolean;
  error?: string;
  provider?: "github" | "notion" | "model" | "application";
  message?: string;
  retryAfter?: number;
};

export type SourceItem = {
  id: string;
  kind: "pull-request" | "issue";
  repository: string;
  number: number;
  title: string;
  description: string;
  author?: string;
  createdAt?: string;
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
