// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listRepositoryOptions } from "./github";
import { RequestBudget } from "./http";
const publicRepo = (name = "synthetic-investigator/atlas") => ({
  full_name: name,
  private: false,
  visibility: "public",
  description: "Synthetic public project",
  html_url: `https://github.com/${name}`,
});
const budget = () => new RequestBudget(1, AbortSignal.timeout(5000));
afterEach(() => vi.unstubAllGlobals());
it("discovers public account repositories and filters private provider results", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([
      publicRepo(),
      { ...publicRepo("synthetic-investigator/private"), private: true },
      publicRepo(),
    ]),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await listRepositoryOptions("secret-token", "", budget());
  expect(result.repositories).toHaveLength(1);
  const url = new URL(String(fetch.mock.calls[0]?.[0]));
  expect(url.pathname).toBe("/user/repos");
  expect(url.searchParams.get("visibility")).toBe("public");
  expect(url.searchParams.get("sort")).toBe("updated");
  expect(url.searchParams.get("per_page")).toBe("30");
});
it("supports public search and exact repository lookup with one provider request", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({
        items: [publicRepo()],
        total_count: 100,
        incomplete_results: false,
      }),
    )
    .mockResolvedValueOnce(Response.json(publicRepo()));
  vi.stubGlobal("fetch", fetch);
  const search = await listRepositoryOptions("token", "atlas", budget());
  expect(search.capped).toBe(true);
  expect(
    new URL(String(fetch.mock.calls[0][0])).searchParams.get("q"),
  ).toContain("is:public");
  const exact = await listRepositoryOptions(
    "token",
    "synthetic-investigator/atlas",
    budget(),
  );
  expect(exact.repositories[0].fullName).toBe("synthetic-investigator/atlas");
  expect(String(fetch.mock.calls[1][0])).toBe(
    "https://api.github.com/repos/synthetic-investigator/atlas",
  );
});
it("rejects unexpected repository links and does not expose private exact results", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...publicRepo(), html_url: "https://evil.example" }),
      )
      .mockResolvedValueOnce(Response.json({ ...publicRepo(), private: true })),
  );
  await expect(
    listRepositoryOptions("token", "atlas", budget()),
  ).rejects.toThrow();
  expect(
    (
      await listRepositoryOptions(
        "token",
        "synthetic-investigator/atlas",
        budget(),
      )
    ).repositories,
  ).toEqual([]);
});
