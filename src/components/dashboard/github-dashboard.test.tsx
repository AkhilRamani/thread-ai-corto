import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitHubDashboard } from "./github-dashboard";

const fetchMock = vi.fn<typeof fetch>();
const snapshot = {
  items: [
    {
      id: "github-1",
      kind: "pull-request",
      repository: "owner/repo",
      number: 1,
      title: "A real source",
      description: "Source context",
      status: "Open",
      updatedAt: "2026-10-25T00:00:00Z",
      url: "https://github.com/owner/repo/pull/1",
    },
  ],
  fetchedAt: "2026-10-25T00:00:00Z",
  coverage: "complete",
};
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders live source disclosure and links without sample controls or a fabricated brief", async () => {
  fetchMock.mockResolvedValue(Response.json({ snapshot }));
  render(<GitHubDashboard user={{ id: 1, login: "octocat" }} />);
  const row = await screen.findByRole("button", { name: /A real source/ });
  fireEvent.click(row);
  expect(
    screen.getByRole("link", { name: /Open on GitHub/ }).getAttribute("href"),
  ).toBe(snapshot.items[0].url);
  expect(screen.getByText(/Live AI briefs are not available yet/)).toBeTruthy();
  expect(screen.queryByText("Sample workspace")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Generate my brief" }),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Sign out" })
      .closest("form")
      ?.getAttribute("method"),
  ).toBe("post");
});

it("does not claim a quiet backlog when an empty snapshot is incomplete", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      snapshot: {
        ...snapshot,
        items: [],
        coverage: "partial",
        collections: [
          {
            label: "Open assigned issues",
            limit: 10,
            total: null,
            returned: 0,
            capped: false,
            incomplete: false,
            error: "GitHub could not return these sources.",
          },
        ],
      },
    }),
  );
  render(<GitHubDashboard user={{ id: 1, login: "octocat" }} />);
  await screen.findByRole("heading", { name: "The search is incomplete." });
  expect(screen.queryByText("No matching public activity.")).toBeNull();
  expect(
    screen.getByText(/Open assigned issues: GitHub could not/),
  ).toBeTruthy();
});

it("removes sources and the account label when the session is revoked", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(
      Response.json(
        { error: "unauthorized", message: "Reconnect GitHub." },
        { status: 401 },
      ),
    );
  render(<GitHubDashboard user={{ id: 1, login: "octocat" }} />);
  await screen.findByRole("button", { name: /A real source/ });
  fireEvent.click(screen.getByRole("button", { name: "Refresh sources" }));
  await screen.findByRole("link", { name: "Reconnect GitHub" });
  await waitFor(() => expect(screen.queryByText("A real source")).toBeNull());
  expect(screen.queryByText("octocat")).toBeNull();
});

it("disables refresh and explains when a rate-limited request can be retried", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      {
        error: "rate-limited",
        message: "Wait before refreshing.",
        retryAfter: 120,
      },
      { status: 429 },
    ),
  );
  render(<GitHubDashboard user={{ id: 1, login: "octocat" }} />);
  const retry = await screen.findByRole("button", { name: "Retry sources" });
  expect(retry.hasAttribute("disabled")).toBe(true);
  expect(screen.getByText(/Refresh will be available at/)).toBeTruthy();
  fireEvent.click(retry);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
