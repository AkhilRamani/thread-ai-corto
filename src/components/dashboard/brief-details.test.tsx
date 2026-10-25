import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sampleBrief, sampleSnapshot } from "@/lib/sample-data";
import { BriefDetails } from "./brief-details";

afterEach(cleanup);

it("opens the next step's first citation, regardless of source list order", () => {
  const target = sampleSnapshot.items[1];
  const url = "https://github.com/owner/repo/issues/138";
  const brief = {
    ...sampleBrief,
    nextStep: { text: "Check the expiry case.", sourceIds: [target.id] },
    observations: [{ text: "Related context.", sourceIds: [target.id] }],
  };
  render(
    <BriefDetails
      brief={brief}
      sources={sampleSnapshot.items.map((source) =>
        source.id === target.id ? { ...source, url } : source,
      )}
      onSourceSelect={vi.fn()}
    />,
  );
  const link = screen.getByRole("link", { name: /Open issue.*on GitHub/ });
  expect(link.getAttribute("href")).toBe(url);
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(
    screen
      .getByText(brief.nextStep.text)
      .compareDocumentPosition(screen.getByText(brief.observations[0].text)) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("keeps synthetic sample actions inside the source list", () => {
  const onSourceSelect = vi.fn();
  render(
    <BriefDetails
      brief={sampleBrief}
      sources={sampleSnapshot.items}
      onSourceSelect={onSourceSelect}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "View suggested source" }),
  );
  expect(onSourceSelect).toHaveBeenCalledWith(
    sampleBrief.nextStep!.sourceIds[0],
  );
  expect(screen.queryByRole("link")).toBeNull();
});

it("does not manufacture a next action when evidence is insufficient", () => {
  render(
    <BriefDetails
      brief={{ ...sampleBrief, nextStep: null }}
      sources={sampleSnapshot.items}
      onSourceSelect={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("region", { name: "Suggested next step" }),
  ).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
