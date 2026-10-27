import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/image", () => ({ default: () => null }));
import { ProjectDashboard } from "./project-dashboard";
import { EvidenceSurface } from "./evidence-surface";
import { sampleRecording } from "@/lib/sample-data";
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(cleanup);
it("renders the recorded pipeline, expands exact passages, and avoids invented live links", () => {
  render(<ProjectDashboard sample />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Plan check",
  );
  expect(screen.getByText(/Recorded example/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Review evidence:/ }));
  expect(
    screen.getAllByText(/Synthetic source. No live original/).length,
  ).toBeGreaterThan(1);
  expect(screen.queryByRole("link", { name: /Open original/ })).toBeNull();
});
it("keeps sources inspectable while checking and replaces loading with findings", async () => {
  render(<ProjectDashboard sample />);
  fireEvent.click(screen.getByRole("button", { name: "Replay check" }));
  expect(
    screen.getByRole("heading", { name: "Checking your project" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("region", { name: "Checking project evidence" })
      .getAttribute("aria-busy"),
  ).toBe("true");
  expect(screen.getByRole("region", { name: "Project sources" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Project findings" })).toBeNull();
  expect(
    await screen.findByRole("region", { name: "Project findings" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Checking your project" }),
  ).toBeNull();
});
it("shows exact server URLs for live evidence and disclosure semantics", () => {
  const snapshot = {
    ...sampleRecording.snapshot,
    evidence: [sampleRecording.snapshot.evidence[0]],
  };
  render(<EvidenceSurface snapshot={snapshot} />);
  const disclosure = screen.getByRole("button");
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(
    screen.getByRole("link", { name: /Open original/ }).getAttribute("href"),
  ).toBe(snapshot.evidence[0].url);
});
it("presents partial and no-finding states without fabricated success", () => {
  render(<ProjectDashboard sample />);
  fireEvent.click(screen.getByRole("button", { name: "Example options" }));
  fireEvent.change(screen.getByLabelText("Explore sample states"), {
    target: { value: "partial" },
  });
  expect(
    screen.getByText(/Plan check needs text from both GitHub and Notion/),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Replay check",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Explore sample states"), {
    target: { value: "no-findings" },
  });
  expect(
    screen.getByRole("heading", { name: "No disagreement established." }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /^Review evidence:/ }),
  ).toBeNull();
});
it("setup and impact inputs have accessible labels and sample connections never initiate OAuth", () => {
  render(<ProjectDashboard sample />);
  fireEvent.click(screen.getByRole("button", { name: "Edit sources" }));
  expect(screen.getByLabelText("GitHub repository")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Notion" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Project findings" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Change impact" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
  fireEvent.click(screen.getByText("Explore a requirement change"));
  const impact = screen.getByRole("region", { name: "Change impact" });
  expect(
    within(impact).getByLabelText("Proposed requirement change"),
  ).toBeTruthy();
});

it("shows one source list and keeps technical logs out of the main flow", () => {
  render(<ProjectDashboard sample />);
  expect(
    screen.getAllByRole("region", { name: "Project sources" }),
  ).toHaveLength(1);
  expect(screen.queryByText("Operations and coverage")).toBeNull();
  expect(screen.queryByText(/input \/ .*output tokens/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Change repository/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Example options" }));
  fireEvent.change(screen.getByLabelText("Explore sample states"), {
    target: { value: "before" },
  });
  expect(
    screen.getAllByRole("region", { name: "Project sources" }),
  ).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "Ready to check your plans" }),
  ).toBeTruthy();
});
it("keeps evidence in the inspector while switching sources and leaves descriptions out of the list", () => {
  render(<ProjectDashboard sample />);
  const sources = screen.getByRole("region", { name: "Project sources" });
  const description = sampleRecording.snapshot.evidence[0].passages[0].text;
  expect(within(sources).queryByText(description)).toBeNull();
  const rows = within(sources).getAllByRole("button");
  fireEvent.click(rows[0]);
  const panel = screen.getByRole("complementary");
  expect(within(panel).getByText(description)).toBeTruthy();
  fireEvent.click(rows[1]);
  expect(screen.getByRole("complementary")).toBe(panel);
  expect(within(panel).queryByText(description)).toBeNull();
});
it("keeps optional impact assessment collapsed until requested and replays it without network calls", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  render(<ProjectDashboard sample />);
  const disclosure = screen.getByRole("button", {
    name: "Explore a requirement change",
  });
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("region", { name: "Change impact" })).toBeNull();
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  const impact = screen.getByRole("region", { name: "Change impact" });
  fireEvent.click(
    within(impact).getByRole("button", { name: "Assess impact" }),
  );
  expect(
    await within(impact).findByText(sampleRecording.impact!.output.explanation),
  ).toBeTruthy();
  fireEvent.change(
    within(impact).getByLabelText("Proposed requirement change"),
    {
      target: { value: "What if recovery links expired after ten minutes?" },
    },
  );
  expect(
    within(impact).queryByText(sampleRecording.impact!.output.explanation),
  ).toBeNull();
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(disclosure);
  expect(
    (
      screen.getByLabelText(
        "Proposed requirement change",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("What if recovery links expired after ten minutes?");
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});

it("preserves the impact draft when source setup is opened and dismissed unchanged", () => {
  render(<ProjectDashboard sample />);
  fireEvent.click(screen.getByText("Explore a requirement change"));
  const question = "What if recovery links expired after ten minutes?";
  fireEvent.change(screen.getByLabelText("Proposed requirement change"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit sources" }));
  expect(screen.queryByRole("region", { name: "Project findings" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
  expect(
    (
      screen.getByLabelText(
        "Proposed requirement change",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe(question);
  expect(screen.getByRole("region", { name: "Project findings" })).toBeTruthy();
});
