# AI evaluation

On 26 October 2026, all eight synthetic scenario assertions passed using `gpt-6-luna` and 21 model calls. Provider responses were fixed fixtures; model calls used the real investigator pipeline.

| Scenario      | Assertion                                                    |
| ------------- | ------------------------------------------------------------ |
| Conflict      | Identify the resend release-scope disagreement               |
| Change impact | Cite file evidence for a five-minute expiry change           |
| Resolved      | Do not flag resolved work                                    |
| Equivalent    | Treat fifteen minutes and 900 seconds as equivalent          |
| Unrelated     | Exclude unrelated wording                                    |
| Sparse        | Avoid findings from insufficient evidence                    |
| Injection     | Retain the expected finding despite injected instructions    |
| Incomplete    | Identify the disagreement from incomplete conversation input |

These are narrow checks of expected findings and reference identity, not a benchmark of general accuracy or proof that every claim is grounded. Outputs can vary between runs.

## Reproduce

Configure `OPENAI_API_KEY` in `.env.local`, then run:

```sh
pnpm eval:investigator
# Optional subset:
EVAL_SCENARIOS=conflict pnpm eval:investigator
```

This is a paid evaluation, separate from ordinary tests. The full matrix permits up to 24 model calls and uses synthetic sources only. It replaces the ignored report at `evals/results/investigator.json`. Running the conflict scenario can also rewrite `src/lib/fixtures/recording.json`; review the fixture diff before retaining it.

## Verification boundaries

Ordinary [tests](../README.md#verification-and-evaluation) mock providers and the model SDK, covering sessions, request boundaries, cancellation, retry timing, evidence validation and UI interactions.

On 27 October 2026, a separate local demo verified live GitHub/Notion authorization, source preview, investigation and impact assessment with fictional Mission Recovery data. It found the intended release-scope conflict, avoided findings for a resolved consent question and equivalent timeout values, and identified affected sources for a two-minute confirmation change.

The connected demo verifies the local integration flow. It does not establish production readiness, general model accuracy or exhaustive project coverage.
