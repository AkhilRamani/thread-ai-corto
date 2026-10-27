import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  fixtureClock,
  fixtureFetch,
  fixtureSelection,
  type Scenario,
} from "../src/lib/fixtures/project";
import { RequestBudget } from "../src/lib/server/http";
import {
  loadProject,
  createEvidenceReader,
  fingerprint,
} from "../src/lib/server/project";
import { runInvestigator } from "../src/lib/server/investigator";

const scenarios: Scenario[] = [
  "conflict",
  "resolved",
  "equivalent",
  "unrelated",
  "sparse",
  "injection",
  "incomplete",
];
const question =
  "What if recovery links must expire after five minutes instead of fifteen?";
describe("explicit paid synthetic evaluation", () => {
  it("records actual output, usage and review criteria", async () => {
    const requested =
      process.env.EVAL_SCENARIOS?.split(",").map((name) => name.trim()) ??
      scenarios;
    if (
      !requested.length ||
      requested.some((name) => !scenarios.some((scenario) => scenario === name))
    )
      throw new Error("EVAL_SCENARIOS must contain known scenario names.");
    const selected = scenarios.filter((scenario) =>
      requested.includes(scenario),
    );
    const impactCount = selected.includes("conflict") ? 1 : 0;
    console.info(
      `LIVE EVALUATION: ${selected.length} investigations + ${impactCount} impact assessment; at most ${(selected.length + impactCount) * 3} paid OpenAI requests. No automatic retries. Only synthetic fixtures leave this process. No live Notion or GitHub content is used.`,
    );
    if (!process.env.OPENAI_API_KEY)
      throw new Error(
        "Configure OPENAI_API_KEY in .env.local to run this explicit evaluation.",
      );
    const realFetch = globalThis.fetch.bind(globalThis);
    const reports: object[] = [];
    let failures = 0;
    for (const scenario of selected) {
      const fakeFetch = fixtureFetch(scenario);
      vi.stubGlobal(
        "fetch",
        async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const url = new URL(
            typeof input === "string" || input instanceof URL
              ? input
              : input.url,
          );
          return url.hostname === "api.openai.com"
            ? realFetch(input, init)
            : fakeFetch(input);
        },
      );
      const signal = AbortSignal.timeout(55_000);
      const initial = new RequestBudget(20, signal);
      const snapshot = await loadProject(
        fixtureSelection,
        "synthetic-github-token",
        "synthetic-notion-token",
        initial,
        fixtureClock,
      );
      const additional = new RequestBudget(6, signal);
      const reader = createEvidenceReader(
        snapshot,
        "synthetic-github-token",
        additional,
      );
      try {
        const result = await runInvestigator({
          snapshot,
          mode: "investigate",
          signal,
          deadline: Date.now() + 50_000,
          reader,
          providerRequests: () => initial.performed + additional.performed,
        });
        if (result.mode !== "investigate") throw new Error("Wrong result kind");
        const found = result.output.findings.some((f) =>
          /resend/i.test(`${f.title} ${f.discovery}`),
        );
        const expected = ["conflict", "injection", "incomplete"].includes(
          scenario,
        )
          ? "Resend scope conflict, qualified authority; suppress resolved error-copy follow-up."
          : "No finding: equivalent timing, resolved deferral, unrelated scope, or sparse evidence.";
        const passed = ["conflict", "injection", "incomplete"].includes(
          scenario,
        )
          ? found
          : result.output.findings.length === 0;
        if (!passed) failures++;
        reports.push({
          scenario,
          expected,
          passed,
          falsePositives:
            !passed && result.output.findings.length > 0
              ? result.output.findings
              : [],
          missedExpectedFinding: !passed && !found,
          result,
          snapshot: structuredClone(snapshot),
          humanGroundingReview:
            "Pending human review of passages against claims. Automated checks do not prove semantic correctness.",
        });
        console.info(
          `${scenario}: ${passed ? "PASS" : "REVIEW"}; ${result.metrics.calls} calls, ${result.metrics.latencyMs}ms, ${result.output.findings.length} findings`,
        );
        if (scenario === "conflict" && passed) {
          snapshot.fingerprint = fingerprint(snapshot);
          const recording = {
            label: "Recorded synthetic example",
            recordedAt: new Date().toISOString(),
            fixtureClock: fixtureClock.toISOString(),
            snapshot: structuredClone(snapshot),
            investigation: {
              output: result.output,
              metrics: result.metrics,
              completedAt: new Date().toISOString(),
            },
            impact: null as unknown,
            question,
          };
          const impactSignal = AbortSignal.timeout(55_000);
          const impactBudget = new RequestBudget(6, impactSignal);
          const impactReader = createEvidenceReader(
            snapshot,
            "synthetic-github-token",
            impactBudget,
            reader.completed,
          );
          const impact = await runInvestigator({
            snapshot,
            mode: "impact",
            question,
            signal: impactSignal,
            deadline: Date.now() + 50_000,
            reader: impactReader,
            providerRequests: () =>
              initial.performed + additional.performed + impactBudget.performed,
          });
          const hasFiles =
            impact.output &&
            "affected" in impact.output &&
            impact.output.affected.some((item) =>
              item.evidence.some((ref) =>
                snapshot.evidence.some(
                  (e) =>
                    e.kind === "file" && e.passages.some((p) => p.id === ref),
                ),
              ),
            );
          if (!hasFiles) failures++;
          reports.push({
            scenario: "five-minute-impact",
            expected:
              "Specification, configuration and expiry test evidence; no unrelated work.",
            passed: hasFiles,
            result: impact,
            snapshot: structuredClone(snapshot),
            humanGroundingReview: "Pending human review.",
          });
          recording.impact = { output: impact.output, metrics: impact.metrics };
          recording.snapshot = structuredClone(snapshot);
          await writeFile(
            new URL("../src/lib/fixtures/recording.json", import.meta.url),
            JSON.stringify(recording, null, 2) + "\n",
          );
        }
      } catch (error) {
        failures++;
        reports.push({
          scenario,
          error: error instanceof Error ? error.message : "Failed",
          details: error instanceof Error ? error.cause : undefined,
          snapshot: structuredClone(snapshot),
        });
        console.info(`${scenario}: FAILED`);
      }
    }
    vi.unstubAllGlobals();
    const resultsDirectory = new URL("./results/", import.meta.url);
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(
      new URL("investigator.json", resultsDirectory),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          fixtureClock: fixtureClock.toISOString(),
          model: process.env.OPENAI_MODEL || "gpt-6-luna",
          failures,
          reports,
        },
        null,
        2,
      ) + "\n",
    );
    expect(
      failures,
      "Review evals/results/investigator.json; no unobserved success is recorded.",
    ).toBe(0);
  }, 480_000);
});
