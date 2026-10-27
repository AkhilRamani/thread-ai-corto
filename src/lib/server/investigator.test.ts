// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { parse, constructors } = vi.hoisted(() => ({
  parse: vi.fn(),
  constructors: vi.fn(),
}));
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  class MockOpenAI extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super(options);
      constructors(options);
      this.responses.parse = parse;
    }
  }
  return { ...actual, default: MockOpenAI };
});
import OpenAI from "openai";
import { runInvestigator } from "./investigator";
import { loadProject } from "./project";
import { RequestBudget } from "./http";
import { fixtureFetch, fixtureSelection } from "@/lib/fixtures/project";
const response = (output: unknown) => ({
  status: "completed",
  output: [],
  output_parsed: output,
  usage: { input_tokens: 100, output_tokens: 50 },
});
const final = {
  overview: "No defensible disagreement established.",
  findings: [],
  limitations: ["Limited selected evidence."],
};
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  vi.stubGlobal("fetch", fixtureFetch());
  parse.mockReset();
  constructors.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  const signal = AbortSignal.timeout(5000);
  const snapshot = await loadProject(
    fixtureSelection,
    "token",
    "token",
    new RequestBudget(20, signal),
  );
  return {
    snapshot,
    signal,
    deadline: Date.now() + 55000,
    mode: "investigate" as const,
    providerRequests: () => 8,
    reader: { canRead: () => true, read: vi.fn(async () => undefined) },
  };
}
describe("bounded model orchestration", () => {
  it("allows two selection rounds then one synthesis and reports actual calls", async () => {
    parse
      .mockResolvedValueOnce(
        response({
          reads: [
            {
              operation: "discussion",
              sourceId: "github-142",
              reference: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ reads: [] }))
      .mockResolvedValueOnce(response(final));
    const options = await setup();
    const result = await runInvestigator(options);
    expect(result.output).toEqual(final);
    expect(result.metrics).toMatchObject({
      calls: 3,
      inputTokens: 300,
      outputTokens: 150,
    });
    expect(options.reader.read).toHaveBeenCalledTimes(1);
    expect(constructors).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, logLevel: "off" }),
    );
    for (const [input, options] of parse.mock.calls) {
      expect(input.store).toBe(false);
      expect(input.input[0].content).not.toContain("synthetic-key");
      expect(options.timeout).toBeLessThanOrEqual(55000);
    }
  });
  it("finishes early when no useful read is selected", async () => {
    parse
      .mockResolvedValueOnce(response({ reads: [] }))
      .mockResolvedValueOnce(response(final));
    const options = await setup();
    await runInvestigator(options);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(options.reader.read).not.toHaveBeenCalled();
  });
  it("reserves synthesis time instead of starting another planner call", async () => {
    parse.mockResolvedValueOnce(response(final));
    const options = await setup();
    options.deadline = Date.now() + 15000;
    await runInvestigator(options);
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it("preserves evidence and rejects invalid citations, refusal, and incomplete responses", async () => {
    for (const output of [
      response({
        ...final,
        findings: [
          {
            category: "deferred-work",
            title: "Finding",
            discovery: "Claim",
            whyItMatters: "Reason",
            suggestedAction: "Check",
            evidence: ["unknown-id"],
            counterevidencePassageIds: [],
            unknowns: ["Unknown"],
          },
        ],
      }),
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
        output_parsed: null,
      },
      { status: "incomplete", output: [], output_parsed: final },
    ]) {
      const options = await setup();
      options.reader.canRead = () => false;
      parse.mockResolvedValueOnce(output);
      await expect(runInvestigator(options)).rejects.toThrow();
      expect(options.snapshot.evidence.length).toBeGreaterThan(0);
      expect(options.snapshot.trace.at(-1)?.outcome).toBe("failed");
    }
  });
  it("honours model rate limits with no retry", async () => {
    const options = await setup();
    options.reader.canRead = () => false;
    parse.mockRejectedValueOnce(
      new OpenAI.RateLimitError(
        429,
        { message: "private evidence" },
        "limited",
        new Headers({ "retry-after": "75" }),
      ),
    );
    await expect(runInvestigator(options)).rejects.toMatchObject({
      code: "rate-limited",
      retryAfter: 75,
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it("does not call a model after the overall deadline", async () => {
    const options = await setup();
    options.deadline = Date.now() - 1;
    await expect(runInvestigator(options)).rejects.toMatchObject({
      code: "timeout",
    });
    expect(parse).not.toHaveBeenCalled();
  });
});
it("uses reserved synthesis time after a selection timeout without retrying selection", async () => {
  parse
    .mockRejectedValueOnce(new OpenAI.APIUserAbortError())
    .mockResolvedValueOnce(response(final));
  const options = await setup();
  const result = await runInvestigator(options);
  expect(result.output).toEqual(final);
  expect(parse).toHaveBeenCalledTimes(2);
  expect(options.snapshot.limitations.join()).toContain("selection timed out");
  expect(options.reader.read).not.toHaveBeenCalled();
});
it("enforces the total evidence ceiling even when coverage metadata grows after retrieval", async () => {
  const options = await setup();
  options.reader.canRead = () => false;
  options.snapshot.evidence[0].passages[0].text = "x".repeat(61000);
  await expect(runInvestigator(options)).rejects.toMatchObject({
    code: "evidence-budget",
  });
  expect(parse).not.toHaveBeenCalled();
});
