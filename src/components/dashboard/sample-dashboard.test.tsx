import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sampleBrief, sampleSnapshot } from "@/lib/sample-data";
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./use-sample-dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-sample-dashboard")>()),
  useSampleDashboard: vi.fn(),
}));
import { useSampleDashboard } from "./use-sample-dashboard";
import { SampleDashboard } from "./sample-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

it("renders observation and next-step evidence and reveals the selected source", () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const scroll = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  vi.mocked(useSampleDashboard).mockReturnValue({
    state: {
      operation: "idle",
      sourceError: false,
      briefError: false,
      snapshot: sampleSnapshot,
      brief: {
        ...sampleBrief,
        observations: [
          {
            text: "The expiry issue relates to account recovery.",
            sourceIds: ["issue-138", "missing"],
          },
        ],
        nextStep: { text: "Inspect the pull request.", sourceIds: ["pr-142"] },
      },
    },
    scenario: "ready",
    selectScenario: vi.fn(),
    refresh: vi.fn(),
    generate: vi.fn(),
  });
  render(<SampleDashboard />);
  const observation = screen.getByRole("group", {
    name: "Sources for observation 1",
  });
  expect(within(observation).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(
    within(observation).getByRole("button", { name: "View source atlas #138" }),
  );
  const issue = screen.getByRole("button", {
    name: /Expired recovery links/,
  });
  expect(issue.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(issue);
  expect(scroll).toHaveBeenCalled();
  const nextStep = screen.getByRole("group", {
    name: "Sources for the suggested next step",
  });
  fireEvent.click(
    within(nextStep).getByRole("button", { name: "View source atlas #142" }),
  );
  expect(
    screen
      .getByRole("button", { name: /Password reset flow/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(issue.getAttribute("aria-expanded")).toBe("false");
  vi.restoreAllMocks();
});
