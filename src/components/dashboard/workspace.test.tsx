import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Workspace } from "./workspace";
import { WorkDetails } from "./work-details";
import { sampleSnapshot } from "@/lib/brief-sample";
vi.mock("next/image", () => ({ default: () => null }));
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  window.history.replaceState(null, "", "/sample");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("starts in the GitHub brief without a Notion prerequisite or paid request", () => {
  render(<Workspace sample />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "PR brief",
  );
  expect(screen.getByRole("region", { name: "Your work brief" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Notion" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves independent results across tools and restores back navigation", () => {
  render(<Workspace sample />);
  fireEvent.click(screen.getByRole("link", { name: "Plan check" }));
  expect(window.location.search).toBe("?view=plan");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Plan check",
  );
  expect(
    screen.queryByRole("heading", { name: "Choose your project sources" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Replay check" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Review evidence:/ }));
  expect(screen.getByRole("complementary", { name: "Evidence" })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "PR brief" }));
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(screen.getByRole("region", { name: "Your work brief" })).toBeTruthy();
  act(() => {
    window.history.replaceState(null, "", "/sample?view=plan");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Plan check",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("places the run action above the preview and opens source details without AI", () => {
  render(<Workspace sample initialView="plan" />);
  fireEvent.click(screen.getByRole("button", { name: "Example options" }));
  fireEvent.change(screen.getByLabelText("Explore sample states"), {
    target: { value: "before" },
  });
  const preview = screen.getByRole("region", {
    name: "Project sources",
  });
  const run = screen.getByRole("button", { name: "Replay check" });
  expect(
    run.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(within(preview).getAllByRole("button")[0]);
  expect(
    screen.getByRole("complementary", { name: "Password reset flow" }),
  ).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it("opens a PR discussion from the source row and restores focus on Escape", () => {
  render(<Workspace sample />);
  const row = screen.getByRole("button", {
    name: "Inspect Password reset flow",
  });
  row.focus();
  fireEvent.click(row);
  const panel = screen.getByRole("complementary", {
    name: "Password reset flow",
  });
  expect(
    within(panel).getByRole("heading", { name: "Discussion and reviews" }),
  ).toBeTruthy();
  expect(
    within(panel).getByText(/Illustrative synthetic discussion/),
  ).toBeTruthy();
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(document.activeElement).toBe(row);
});
it("keeps the inspector mounted when switching sources and replaces its content", () => {
  render(<Workspace sample />);
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Password reset flow" }),
  );
  const panel = screen.getByRole("complementary", {
    name: "Password reset flow",
  });
  expect(
    within(panel).getByText(/Defer the recovery resend action/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Expired recovery links" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Expired recovery links" }),
  ).toBe(panel);
  expect(
    within(panel).queryByText(/Defer the recovery resend action/),
  ).toBeNull();
  expect(
    within(panel).getByText(/No discussion entries were returned/),
  ).toBeTruthy();
});
it("uses a mobile dialog with scroll locking and focus containment", () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  render(<Workspace sample />);
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Password reset flow" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Password reset flow" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  const close = within(dialog).getByRole("button", { name: "Close details" });
  close.focus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.click(close);
  expect(document.body.style.overflow).toBe("");
});
it("aborts obsolete discussion reads and exposes recoverable failures", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const rendered = render(
    <WorkDetails item={sampleSnapshot.items[0]} sample={false} />,
  );
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  rendered.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json({ source: {}, discussion: [] })));
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ message: "GitHub unavailable." }, { status: 503 }),
  );
  render(<WorkDetails item={sampleSnapshot.items[0]} sample={false} />);
  await screen.findByText("GitHub unavailable.");
  expect(screen.getByRole("button", { name: "Retry details" })).toBeTruthy();
});
it("removes both tool views when the shared GitHub session expires", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      { error: "unauthorized", message: "Session expired." },
      { status: 401 },
    ),
  );
  render(<Workspace user={{ id: 1, login: "synthetic" }} />);
  await screen.findByRole("heading", { name: "Reconnect GitHub" });
  expect(screen.queryByRole("region", { name: "Source work" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Project sources" })).toBeNull();
});
