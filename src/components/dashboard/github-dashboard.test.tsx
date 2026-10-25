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
vi.mock("next/image", () => ({ default: () => null }));
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
  expect(
    screen.getByText(/sends their titles, bounded descriptions/),
  ).toBeTruthy();
  expect(screen.queryByText("Sample workspace")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Generate my brief" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Sign out" })
      .closest("form")
      ?.getAttribute("method"),
  ).toBe("post");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/github/sources");
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

it("renders a live brief, follows its evidence, copies source URLs, and clears it on refresh", async () => {
  const brief = {
    title: "Resume the account flow.",
    overview: "The account work is still open.",
    sourceIds: ["github-1"],
    observations: [
      {
        text: "The description gives the next context.",
        sourceIds: ["github-1"],
      },
    ],
    nextStep: {
      text: "Read the description to recover the context.",
      sourceIds: ["github-1"],
    },
  };
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(Response.json({ snapshot, brief }))
    .mockResolvedValueOnce(Response.json({ snapshot }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  try {
    render(<GitHubDashboard user={{ id: 1, login: "octocat" }} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Generate my brief" }),
    );
    await screen.findByRole("heading", { name: brief.title });
    expect(screen.getByText(brief.observations[0].text)).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "View source owner/repo #1" })[0],
    );
    expect(
      screen
        .getByRole("button", { name: /A real source/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Copy brief" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText.mock.calls[0][0]).toContain(snapshot.items[0].url);
    expect(writeText.mock.calls[0][0]).not.toContain("sample");
    fireEvent.click(screen.getByRole("button", { name: "Refresh sources" }));
    await screen.findByRole("button", { name: "Generate my brief" });
    expect(screen.queryByText(brief.overview)).toBeNull();
    expect(screen.queryByText("Copied with source references.")).toBeNull();
  } finally {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

it("explains missing AI configuration while keeping live sources usable", async () => {
  fetchMock.mockResolvedValue(Response.json({ snapshot }));
  render(
    <GitHubDashboard
      user={{ id: 1, login: "octocat" }}
      briefAvailable={false}
    />,
  );
  await screen.findByRole("button", { name: /A real source/ });
  expect(
    screen
      .getByRole("button", { name: "Generate my brief" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("heading", {
      name: "Brief generation is not configured.",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Explore sample brief" }),
  ).toBeTruthy();
});
