import { useState, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/image", () => ({ default: () => null }));
import { ProjectSetup } from "./project-setup";
import { ProjectDashboard } from "./project-dashboard";
import { sampleRecording } from "@/lib/sample-data";
import type { ProjectSelection } from "@/lib/contracts";
const repo = "synthetic-investigator/atlas";
const other = "synthetic-investigator/other";
const pages = Array.from({ length: 6 }, (_, i) => ({
  id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
  title: `Project page ${i + 1}`,
  updatedAt: "2026-10-26T04:00:00Z",
  url: `https://app.notion.com/p/${i}`,
}));
const repositories = [
  { fullName: repo, description: "Account recovery" },
  { fullName: other, description: "Other project" },
];
const change = vi.fn();
function Harness({
  connected = false,
  notionAvailable = true,
  initial = { repository: "", pageIds: [] },
}: {
  connected?: boolean;
  notionAvailable?: boolean;
  initial?: ProjectSelection;
}) {
  const [selection, setSelection] = useState(initial);
  const props: ComponentProps<typeof ProjectSetup> = {
    selection,
    onChange: (next) => {
      change(next);
      setSelection(next);
    },
    onLoad: vi.fn(),
    onDisconnect: vi.fn(),
    connected,
    notionAvailable,
    busy: false,
    sample: false,
  };
  return <ProjectSetup {...props} />;
}
async function repositoriesReady() {
  const trigger = screen.getByRole("combobox", { name: "GitHub repository" });
  await waitFor(() =>
    expect((trigger as HTMLButtonElement).disabled).toBe(false),
  );
  return trigger;
}
async function selectRepository(name: string) {
  const trigger = await repositoriesReady();
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name }));
}
beforeEach(() => {
  change.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("/repositories")
          ? { repositories, capped: false }
          : { pages, capped: false },
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("loads public repositories into the shadcn select and enables the correct preview action", async () => {
  render(<Harness />);
  const select = screen.getByRole("combobox", {
    name: "GitHub repository",
  }) as HTMLButtonElement;
  expect(select.disabled).toBe(true);
  await selectRepository(repo);
  expect(change).toHaveBeenLastCalledWith({ repository: repo, pageIds: [] });
  expect(
    (
      screen.getByRole("button", {
        name: "Preview GitHub sources",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    screen.getByRole("list", { name: "Notion connection steps" }),
  ).toBeTruthy();
  expect(screen.getByText("Read-only access")).toBeTruthy();
  expect(screen.getByText("Repository selected")).toBeTruthy();
  const form = screen
    .getByRole("button", { name: "Connect Notion" })
    .closest("form")!;
  expect(
    new URL(form.getAttribute("action")!, "http://local").searchParams.get(
      "repository",
    ),
  ).toBe(repo);
});
it("searches all public repositories without changing the current selection silently", async () => {
  render(<Harness initial={{ repository: repo, pageIds: [] }} />);
  await repositoriesReady();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      repositories: [{ fullName: "another/project", description: "Match" }],
      capped: true,
    }),
  );
  fireEvent.click(screen.getByText("Find another public repository"));
  fireEvent.change(screen.getByLabelText("Search public repositories"), {
    target: { value: "project" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search GitHub" }));
  await screen.findByText(/Refine your search/);
  const trigger = await repositoriesReady();
  expect(trigger.textContent).toContain(repo);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(
    await screen.findByRole("option", { name: "another/project" }),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(screen.getByText(/Refine your search/)).toBeTruthy();
  const last = vi.mocked(fetch).mock.calls.at(-1)!;
  expect(JSON.parse(last[1]!.body as string)).toEqual({ query: "project" });
});
it("explains unavailable Notion setup without offering a dead connection action", async () => {
  render(<Harness notionAvailable={false} />);
  await repositoriesReady();
  expect(screen.getByText(/connection hasn’t been enabled/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Notion" })).toBeNull();
  expect(screen.getByText(/You can still preview GitHub sources/)).toBeTruthy();
});
it("automatically lists shared pages, reports selection and enforces the five-page limit", async () => {
  render(<Harness connected initial={{ repository: repo, pageIds: [] }} />);
  await screen.findByLabelText(/Project page 6/);
  for (let i = 1; i <= 5; i++)
    fireEvent.click(screen.getByLabelText(new RegExp(`Project page ${i}`)));
  expect(screen.getByText("5 of 5 pages selected")).toBeTruthy();
  expect(
    (screen.getByLabelText(/Project page 6/) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Preview project sources" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByText("0 of 5 pages selected")).toBeTruthy();
  expect(
    (screen.getByLabelText(/Project page 6/) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith("/pages")),
  ).toHaveLength(1);
});
it("lists shared pages without search and preserves selected titles when the list is reloaded", async () => {
  render(<Harness connected initial={{ repository: repo, pageIds: [] }} />);
  await screen.findByRole("checkbox", { name: "Project page 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Project page 1" }));
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ pages: [pages[5]], capped: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload pages" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("checkbox", { name: "Project page 2" }),
    ).toBeNull(),
  );
  expect(
    screen
      .getByRole("checkbox", { name: "Project page 1" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.getByRole("checkbox", { name: "Project page 6" })).toBeTruthy();
  expect(screen.queryByLabelText("Search shared Notion pages")).toBeNull();
  expect(screen.queryByRole("button", { name: "Search pages" })).toBeNull();
  expect(screen.getByText(/list is limited to 30 shared pages/)).toBeTruthy();
  expect(
    JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string),
  ).toEqual({});
});
it("gives empty and revoked-page responses a clear recovery path", async () => {
  vi.mocked(fetch).mockImplementation(async (url) =>
    Response.json(
      String(url).endsWith("/repositories")
        ? { repositories, capped: false }
        : { pages: [], capped: false },
    ),
  );
  render(<Harness connected />);
  await screen.findByText("No shared pages are available yet.");
  expect(
    screen.getByRole("button", { name: "Manage page access" }),
  ).toBeTruthy();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json(
      { message: "Your Notion connection expired. Reconnect to continue." },
      { status: 401 },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload pages" }));
  await screen.findByText(/Your Notion connection expired/);
  expect(screen.getByRole("button", { name: "Reconnect Notion" })).toBeTruthy();
});
it("aborts list requests on unmount and ignores late responses", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const rendered = render(<Harness />);
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  rendered.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve(Response.json({ repositories, capped: false })),
  );
});
it.each(["repositories", "pages"] as const)(
  "aborts a manually reloaded %s request when setup closes",
  async (provider) => {
    const rendered = render(<Harness connected={provider === "pages"} />);
    await repositoriesReady();
    if (provider === "pages")
      await screen.findByRole("checkbox", { name: "Project page 1" });
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    if (provider === "repositories") {
      fireEvent.click(
        screen.getByRole("button", { name: "Find another public repository" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Search GitHub" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Reload pages" }));
    }
    const signal = vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
    expect(signal.aborted).toBe(false);
    rendered.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(
        Response.json(
          provider === "repositories"
            ? { repositories, capped: false }
            : { pages, capped: false },
        ),
      ),
    );
  },
);
it.each(["repositories", "pages"] as const)(
  "re-enables %s retries after the provider delay",
  async (provider) => {
    render(<Harness connected={provider === "pages"} />);
    await repositoriesReady();
    if (provider === "pages")
      await screen.findByRole("checkbox", { name: "Project page 1" });
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { message: "Wait for the provider", retryAfter: 2 },
        { status: 429 },
      ),
    );
    if (provider === "repositories") {
      fireEvent.click(
        screen.getByRole("button", { name: "Find another public repository" }),
      );
    }
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: provider === "repositories" ? "Search GitHub" : "Reload pages",
        }),
      );
    });
    const retry = screen.getByRole("button", {
      name:
        provider === "repositories"
          ? "Retry repositories"
          : "Try loading pages again",
    }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(retry.disabled).toBe(false);
  },
);
it("changing repositories clears a previously loaded snapshot before another preview", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/repositories"))
      return Response.json({ repositories, capped: false });
    if (String(url).endsWith("/sources")) {
      const { selection } = JSON.parse(init!.body as string);
      return Response.json({
        snapshot: {
          ...sampleRecording.snapshot,
          selection,
          evidence: sampleRecording.snapshot.evidence.filter(
            (e) => e.provider === "github",
          ),
        },
      });
    }
    return Response.json({ pages, capped: false });
  });
  render(
    <ProjectDashboard
      user={{ id: 1, login: "synthetic" }}
      notionAvailable={false}
    />,
  );
  await repositoriesReady();
  await selectRepository(repo);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview GitHub sources" }),
  );
  await screen.findByRole("region", { name: "Project sources" });
  fireEvent.click(screen.getByRole("button", { name: "Edit sources" }));
  await repositoriesReady();
  await selectRepository(other);
  expect(screen.queryByRole("region", { name: "Project sources" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview GitHub sources" }),
  );
  await screen.findByRole("region", { name: "Project sources" });
  const calls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).endsWith("/sources"));
  expect(
    JSON.parse(calls.at(-1)![1]!.body as string).selection.repository,
  ).toBe(other);
});

it("recovers from a failed preview through the same source editor without starting a check", async () => {
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).endsWith("/repositories"))
      return Response.json({ repositories, capped: false });
    return Response.json(
      { error: "provider", message: "GitHub is unavailable. Try again." },
      { status: 503 },
    );
  });
  render(<ProjectDashboard notionAvailable={false} />);
  await repositoriesReady();
  await selectRepository(repo);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview GitHub sources" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "GitHub is unavailable. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit sources" }));
  expect(screen.getByRole("region", { name: "Source setup" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run plan check" })).toBeNull();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).endsWith("/investigate")),
  ).toBe(false);
});

it("shows provider icons and distinct visual steps without repeating the connection instructions", async () => {
  render(<Harness />);
  await repositoriesReady();
  expect(screen.getByRole("group", { name: "GitHub" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "Notion" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "GitHub" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Notion" })).toBeTruthy();
  expect(screen.getByText("Open Notion")).toBeTruthy();
  expect(screen.getByText("Share pages")).toBeTruthy();
  expect(screen.getByText("Choose pages here")).toBeTruthy();
  expect(
    screen.queryByText(/Continue to Notion and choose your workspace/),
  ).toBeNull();
});
it("keeps connection management secondary and makes disconnection explicit", async () => {
  render(<Harness connected initial={{ repository: repo, pageIds: [] }} />);
  await screen.findByLabelText(/Project page 1/);
  const settings = screen.getByRole("button", { name: "Connection settings" });
  expect(settings.getAttribute("aria-expanded")).toBe("false");
  expect(
    screen.queryByRole("button", { name: "Disconnect Notion" }),
  ).toBeNull();
  fireEvent.click(settings);
  expect(settings.getAttribute("aria-expanded")).toBe("true");
  expect(
    screen.getByRole("button", { name: "Disconnect Notion" }),
  ).toBeTruthy();
});

it("supports keyboard selection and restores focus after dismissing the repository select", async () => {
  render(<Harness />);
  const trigger = await repositoriesReady();
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: other });
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(trigger.textContent).toContain(other));
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(await screen.findByRole("listbox"), { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("toggles a Notion page from the full row and keeps selection bounded", async () => {
  render(<Harness connected initial={{ repository: repo, pageIds: [] }} />);
  const checkbox = await screen.findByRole("checkbox", {
    name: "Project page 1",
  });
  fireEvent.click(checkbox.closest("label")!);
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("1 of 5 pages selected")).toBeTruthy();
  fireEvent.click(checkbox.closest("label")!);
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(screen.getByText("0 of 5 pages selected")).toBeTruthy();
});
