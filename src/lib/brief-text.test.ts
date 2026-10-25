import { describe, expect, it } from "vitest";
import { briefToText } from "./brief-text";
import { sampleBrief, sampleSnapshot } from "./sample-data";

describe("brief copy", () => {
  it("labels sample data honestly and includes evidence without invented URLs", () => {
    const text = briefToText(sampleBrief, sampleSnapshot.items, true);
    expect(text).toContain("illustrative sample");
    expect(text).toContain(
      "atlas #142 — Password reset flow (synthetic sample)",
    );
    expect(text).not.toContain("https://");
  });

  it("includes real source links and excludes unreferenced evidence", () => {
    const items = sampleSnapshot.items.map((source) => ({
      ...source,
      url: `https://github.com/example/atlas/issues/${source.number}`,
    }));
    const text = briefToText({ ...sampleBrief, sourceIds: ["pr-142"] }, items);
    expect(text).toContain(items[0].url);
    expect(text).not.toContain(items[1].url);
    expect(text).not.toContain("sample");
  });
});
