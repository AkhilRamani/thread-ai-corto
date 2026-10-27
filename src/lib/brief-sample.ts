import type { SourceSnapshot, WorkBrief } from "./contracts";

// Fixed, synthetic fixtures. These are never substituted for live results.
export const sampleSnapshot: SourceSnapshot = {
  fetchedAt: "2026-10-25T04:00:00Z",
  coverage: "complete",
  items: [
    {
      id: "pr-142",
      kind: "pull-request",
      repository: "atlas",
      number: 142,
      title: "Password reset flow",
      description:
        "Adds an account recovery screen and an email-based password reset flow. The pull request is open. Its description does not yet explain what happens when a recovery link expires.",
      status: "Open",
      updatedAt: "2026-10-24T09:15:00Z",
    },
    {
      id: "issue-138",
      kind: "issue",
      repository: "atlas",
      number: 138,
      title: "Expired recovery links",
      description:
        "People following an expired recovery link reach a generic error. The assigned issue asks for a clear explanation and a way to request a new link.",
      status: "Assigned",
      updatedAt: "2026-10-23T11:00:00Z",
    },
  ],
};

export const sampleBrief: WorkBrief = {
  title: "Account recovery is the open thread.",
  overview:
    "The password reset flow is still open. An assigned issue describes expired recovery links. Both point back to account recovery.",
  sourceIds: ["pr-142", "issue-138"],
  observations: [],
  nextStep: {
    text: "Check whether the PR description addresses the expiry issue.",
    sourceIds: ["pr-142", "issue-138"],
  },
};
