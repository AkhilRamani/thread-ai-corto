// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  fixtureFetch,
  fixtureItem,
  fixturePageIds,
  fixtureRepository,
  fixtureSelection,
} from "@/lib/fixtures/project";
import {
  selectionSchema,
  investigationSchema,
  readSchema,
} from "@/lib/contracts";
import { RequestBudget, boundedJson } from "./http";
import {
  createEvidenceReader,
  fingerprint,
  loadProject,
  modelEvidence,
  addEvidence,
} from "./project";
import {
  normalizeGitHubItem,
  readFiles,
  readDiscussion,
  verifyRepository,
  explicitReferences,
} from "./github";
import { readNotionPage } from "./notion";
import { validateReferences } from "./investigator";
import { issueReceipt, verifyReceipt } from "./context-receipt";
import { limits } from "@/lib/limits";
const budget = (max = 20) => new RequestBudget(max, AbortSignal.timeout(5000));
async function fixture() {
  vi.stubGlobal("fetch", fixtureFetch());
  return loadProject(
    fixtureSelection,
    "github-token",
    "notion-token",
    budget(),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("selection and provider boundaries", () => {
  it.each([
    "https://github.com/a/b",
    "a/b/c",
    "a/..",
    "a/b?x=1",
    "a/b#x",
    "a/b%2fsecret",
  ])("rejects repository identifiers: %s", (repository) => {
    expect(selectionSchema.safeParse({ repository, pageIds: [] }).success).toBe(
      false,
    );
  });
  it("rejects duplicate/excess pages, unknown browser fields and non-UUID pages", () => {
    for (const value of [
      { repository: "a/b", pageIds: [fixturePageIds[0], fixturePageIds[0]] },
      { repository: "a/b", pageIds: ["malicious-url"] },
      { repository: "a/b", pageIds: [], token: "browser-token" },
    ])
      expect(selectionSchema.safeParse(value).success).toBe(false);
  });
  it("verifies public visibility and repository identity", async () => {
    for (const repo of [
      { full_name: fixtureRepository, private: true },
      { full_name: "other/repo", private: false },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(repo)),
      );
      await expect(
        verifyRepository(fixtureRepository, "token", budget()),
      ).rejects.toThrow("public");
    }
  });
  it("uses observed statuses without inferring assignment or merging", () => {
    const raw = fixtureItem(138, "text", false);
    expect(normalizeGitHubItem(raw, fixtureRepository).status).toBe("Open");
    expect(
      normalizeGitHubItem({ ...raw, state: "closed" }, fixtureRepository)
        .status,
    ).toBe("Closed");
    const pr = fixtureItem(142, "body");
    expect(
      normalizeGitHubItem({ ...pr, draft: true }, fixtureRepository).status,
    ).toBe("Draft");
    expect(
      normalizeGitHubItem({ ...pr, state: "closed" }, fixtureRepository).status,
    ).toBe("Closed");
    expect(
      normalizeGitHubItem(
        {
          ...pr,
          state: "closed",
          pull_request: { merged_at: "2026-10-24T00:00:00Z" },
        },
        fixtureRepository,
      ).status,
    ).toBe("Merged");
    expect(() =>
      normalizeGitHubItem(
        { ...raw, html_url: "https://evil.example" },
        fixtureRepository,
      ),
    ).toThrow();
  });
  it("preserves usable GitHub evidence when selected pages fail", async () => {
    const fake = fixtureFetch();
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("notion.com")
        ? new Response(null, { status: 401 })
        : fake(url),
    );
    const snapshot = await loadProject(
      fixtureSelection,
      "github-token",
      "notion-token",
      budget(),
    );
    expect(snapshot.evidence).toHaveLength(2);
    expect(snapshot.trace.filter((t) => t.outcome === "failed")).toHaveLength(
      3,
    );
    expect(snapshot.sourceErrors?.[0]).toMatchObject({
      provider: "notion",
      code: "unauthorized",
    });
  });
  it("caps provider requests and response bytes", async () => {
    const b = budget(2);
    let calls = 0;
    await Promise.all([b.run(async () => ++calls), b.run(async () => ++calls)]);
    await expect(b.run(async () => ++calls)).rejects.toThrow("limit");
    expect(calls).toBe(2);
    await expect(
      boundedJson(new Response("x".repeat(100)), 50),
    ).rejects.toThrow("large");
  });
  it("runs at most three concurrent provider requests", async () => {
    let active = 0,
      high = 0;
    const b = budget();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        b.run(async () => {
          active++;
          high = Math.max(active, high);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active--;
        }),
      ),
    );
    expect(high).toBe(3);
  });
});
describe("bounded Notion content", () => {
  it("preserves headings and nested identity, paginates, and skips child pages", async () => {
    const fake = fixtureFetch();
    const visited: string[] = [];
    const id = fixturePageIds[0];
    vi.stubGlobal("fetch", async (url: string) => {
      visited.push(url);
      if (url.includes("/pages/")) return fake(url);
      const root = url.includes(`/blocks/${id}/`);
      const block = (
        id: string,
        type: string,
        text: string,
        has_children = false,
      ) => ({
        id,
        type,
        has_children,
        [type]: { rich_text: [{ plain_text: text }] },
      });
      if (root && !url.includes("start_cursor"))
        return Response.json({
          results: [
            block(fixturePageIds[1], "heading_1", "Approved"),
            block(fixturePageIds[2], "toggle", "Nested", true),
            block(
              "44444444-4444-4444-8444-444444444444",
              "child_page",
              "Do not follow",
              true,
            ),
          ],
          has_more: true,
          next_cursor: "opaque-cursor",
        });
      return Response.json({
        results: [
          block(
            "55555555-5555-4555-8555-555555555555",
            "paragraph",
            root ? "Later root" : "Nested decision",
          ),
        ],
        has_more: false,
        next_cursor: null,
      });
    });
    const page = await readNotionPage(id, "token", budget());
    expect(
      page.passages.find((p) => p.text === "Nested decision"),
    ).toMatchObject({
      heading: "Approved",
      blockId: "55555555-5555-4555-8555-555555555555",
    });
    expect(visited.some((url) => url.includes("opaque-cursor"))).toBe(true);
    expect(visited.some((url) => url.includes("44444444-4444-4444"))).toBe(
      false,
    );
    expect(page.limitations.join()).toContain("not followed");
  });
  it("reports traversal caps instead of silently treating omitted content as empty", async () => {
    const fake = fixtureFetch();
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("/pages/")
        ? fake(url)
        : Response.json({
            results: Array.from({ length: 125 }, (_, n) => ({
              id: `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`,
              type: "paragraph",
              has_children: false,
              paragraph: { rich_text: [{ plain_text: "text" }] },
            })),
            has_more: false,
            next_cursor: null,
          }),
    );
    const page = await readNotionPage(fixturePageIds[0], "token", budget());
    expect(page.passages).toHaveLength(120);
    expect(page.limitations.join()).toContain("block limit");
  });
});
describe("evidence reads and versioning", () => {
  it("rejects unknown IDs, URLs, unrelated references, invalid file reads and repeats", async () => {
    const snapshot = await fixture();
    const b = budget(6);
    const reader = createEvidenceReader(snapshot, "token", b);
    for (const request of [
      {
        operation: "discussion" as const,
        sourceId: "https://evil.example",
        reference: null,
      },
      {
        operation: "reference" as const,
        sourceId: "github-142",
        reference: 999,
      },
      { operation: "files" as const, sourceId: "github-138", reference: null },
    ])
      expect((await reader.read(request)).outcome).toBe("failed");
    const request = {
      operation: "discussion" as const,
      sourceId: "github-138",
      reference: null,
    };
    expect((await reader.read(request)).outcome).toBe("ok");
    const used = b.used;
    expect((await reader.read(request)).outcome).toBe("failed");
    expect(b.used).toBe(used);
  });
  it("distinguishes explicit repository references from external URLs", async () => {
    const snapshot = await fixture();
    expect(
      explicitReferences(snapshot.evidence, fixtureRepository).has(138),
    ).toBe(true);
    const item = snapshot.evidence[0];
    item.passages[0].text = "https://github.com/other/repo/issues/999";
    expect(explicitReferences([item], fixtureRepository).size).toBe(0);
  });
  it("pins changed-file excerpts and marks unavailable patches", async () => {
    const snapshot = await fixture();
    const files = await readFiles(
      snapshot.evidence[0],
      fixtureRepository,
      "token",
      budget(),
    );
    expect(files).toHaveLength(2);
    expect(files[0].passages[0].file).toMatchObject({
      sha: "a".repeat(40),
      path: "src/recovery/config.ts",
      startLine: 1,
    });
    expect(files[0].url).toContain(`/blob/${"a".repeat(40)}/`);
  });
  it("rejects files if the head moves while reading", async () => {
    const snapshot = await fixture();
    const fake = fixtureFetch();
    let heads = 0;
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("/pulls/142")
        ? Response.json({
            head: { sha: (++heads === 1 ? "a" : "b").repeat(40) },
          })
        : fake(url),
    );
    await expect(
      readFiles(snapshot.evidence[0], fixtureRepository, "token", budget()),
    ).rejects.toThrow("changed");
  });
  it("discloses conversation limits and preserves chronological replies", async () => {
    vi.stubGlobal("fetch", fixtureFetch("incomplete"));
    const snapshot = await loadProject(
      fixtureSelection,
      "token",
      "token",
      budget(),
    );
    const details = await readDiscussion(
      snapshot.evidence[0],
      fixtureRepository,
      "token",
      budget(),
    );
    expect(details.length).toBe(30);
    expect(snapshot.evidence[0].limitations.join()).toContain(
      "possible resolution",
    );
  });
  it("bounds all model evidence while preserving existing passage identities", async () => {
    const snapshot = await fixture();
    const ids = snapshot.evidence.flatMap((e) => e.passages.map((p) => p.id));
    addEvidence(
      snapshot,
      Array.from({ length: 30 }, (_, n) => ({
        ...snapshot.evidence[0],
        id: `extra-${n}`,
        passages: [{ id: `extra-${n}:body`, text: "x".repeat(10000) }],
      })),
    );
    expect(JSON.stringify(modelEvidence(snapshot)).length).toBeLessThanOrEqual(
      limits.evidenceCharacters,
    );
    expect(
      snapshot.evidence.flatMap((e) => e.passages.map((p) => p.id)),
    ).toEqual(expect.arrayContaining(ids));
  });
  it("fingerprints ignore fetch time and ordering but change with content", async () => {
    const snapshot = await fixture();
    const a = fingerprint(snapshot);
    const copy = structuredClone(snapshot);
    copy.fetchedAt = "2099-01-01T00:00:00Z";
    copy.evidence.reverse().forEach((e) => {
      e.fetchedAt = copy.fetchedAt;
    });
    expect(fingerprint(copy)).toBe(a);
    copy.evidence[0].passages[0].text += " updated";
    expect(fingerprint(copy)).not.toBe(a);
  });
  it("rejects invalid or duplicate model citations and schema overflow", async () => {
    const snapshot = await fixture();
    const ref = snapshot.evidence[0].passages[0].id;
    const output = {
      overview: "A conflict",
      findings: [
        {
          category: "conflicting-expectations" as const,
          title: "Scope",
          discovery: "Mismatch",
          whyItMatters: "Release",
          suggestedAction: "Agree scope",
          evidence: [ref],
          counterevidencePassageIds: [],
          unknowns: ["Authority unclear"],
        },
      ],
      limitations: [],
    };
    expect(validateReferences(output, snapshot)).toEqual(output);
    expect(() =>
      validateReferences(
        {
          ...output,
          findings: [{ ...output.findings[0], evidence: ["invented"] }],
        },
        snapshot,
      ),
    ).toThrow("outside");
    expect(() =>
      validateReferences(
        {
          ...output,
          findings: [{ ...output.findings[0], evidence: [ref, ref] }],
        },
        snapshot,
      ),
    ).toThrow();
    expect(
      investigationSchema.safeParse({
        ...output,
        findings: Array(4).fill(output.findings[0]),
      }).success,
    ).toBe(false);
    expect(
      readSchema.safeParse({
        operation: "fetch-url",
        sourceId: "x",
        reference: null,
      }).success,
    ).toBe(false);
  });
  it("binds signed context receipts to session, scope, evidence and expiry", async () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
    vi.stubEnv("GITHUB_CLIENT_ID", "client");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "secret");
    vi.stubEnv("SESSION_PASSWORD", "password-at-least-thirty-two-characters");
    const snapshot = await fixture();
    const auth = {
      user: { id: 1, login: "synthetic" },
      accessToken: "secret-token",
      nonce: "nonce-at-least-twenty-characters",
      expiresAt: Date.now() + 10000,
    };
    const receipt = issueReceipt(snapshot, [], auth);
    expect(receipt).not.toContain("secret-token");
    expect(verifyReceipt(receipt, auth).fingerprint).toBe(snapshot.fingerprint);
    expect(() => verifyReceipt(`${receipt}tamper`, auth)).toThrow();
    expect(() =>
      verifyReceipt(receipt, { ...auth, nonce: "a-different-session-nonce" }),
    ).toThrow();
  });
});
it("opens explicitly referenced historical evidence without expanding to another repository", async () => {
  const snapshot = await fixture();
  snapshot.evidence[0].passages[0].text += " Earlier decision in #99.";
  const fake = fixtureFetch();
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("/issues/99")
      ? Response.json({
          ...fixtureItem(99, "Historical decision.", false),
          updated_at: "2026-09-01T00:00:00Z",
        })
      : fake(url),
  );
  const reader = createEvidenceReader(snapshot, "token", budget(6));
  const result = await reader.read({
    operation: "reference",
    sourceId: "github-142",
    reference: 99,
  });
  expect(result.outcome).toBe("ok");
  const historical = snapshot.evidence.find((e) => e.number === 99)!;
  expect(historical.layer).toBe("historical");
  expect(historical.inclusionReason).toContain(
    "Explicit same-repository reference",
  );
});
it("marks binary or omitted patches unavailable rather than an empty implementation", async () => {
  const snapshot = await fixture();
  const fake = fixtureFetch();
  vi.stubGlobal("fetch", async (url: string) =>
    url.includes("/pulls/142/files")
      ? Response.json([
          { filename: "recovery.bin", sha: "b".repeat(40), status: "modified" },
        ])
      : fake(url),
  );
  const files = await readFiles(
    snapshot.evidence[0],
    fixtureRepository,
    "token",
    budget(),
  );
  expect(files[0].passages).toEqual([]);
  expect(files[0].limitations.join()).toContain("Patch unavailable");
});
it("stops after provider rate limiting and reports actual HTTP attempts", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(null, { status: 429, headers: { "retry-after": "90" } }),
  );
  vi.stubGlobal("fetch", fetch);
  const b = budget(6);
  await expect(
    verifyRepository(fixtureRepository, "token", b),
  ).rejects.toMatchObject({ code: "rate-limited", retryAfter: 90 });
  await expect(
    verifyRepository(fixtureRepository, "token", b),
  ).rejects.toMatchObject({ retryAfter: 90 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(b.performed).toBe(1);
});
