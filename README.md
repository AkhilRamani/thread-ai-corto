# Thread

A developer workspace that turns GitHub activity into a useful starting point and checks whether project plans agree with the work. Built for the [MySubscriptions take-home assignment](MySubscriptions_TakeHome.md).

- **PR brief:** a short overview and suggested next step from your public pull requests and assigned issues, with source details and discussions available alongside it.
- **Plan check:** compare one public repository with up to five selected Notion pages, inspect cited disagreements, and explore the impact of a proposed requirement change.

## Try it locally

Requires Node.js 22.13+ and pnpm 10.16.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the sample workspace](http://127.0.0.1:3000/sample). No credentials or external calls are needed: PR brief is illustrative, while Plan check replays recorded model output over synthetic sources.

## Connect real services

Copy [`.env.example`](.env.example) to `.env.local` and configure the services you need. Credentials stay server-side; do not prefix them with `NEXT_PUBLIC_`.

| Variable                                   | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `APP_URL`                                  | Exact browser origin, e.g. `http://127.0.0.1:3000`                     |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth App credentials                                           |
| `SESSION_PASSWORD`                         | At least 32 random characters; generate with `openssl rand -base64 48` |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | Notion public connection credentials; optional for PR brief            |
| `OPENAI_API_KEY`                           | Required for live AI output, not source preview                        |
| `OPENAI_MODEL`                             | Defaults to `gpt-6-luna`                                               |

1. Register a [GitHub OAuth App](https://github.com/settings/developers) with homepage `APP_URL` and callback `${APP_URL}/api/auth/github/callback`.
2. For Plan check, create a [Notion public connection](https://developers.notion.com/guides/get-started/authorization) with **Read content** capability and callback `${APP_URL}/api/auth/notion/callback`.
3. Restart the dev server. Open the exact `APP_URL` and sign in with GitHub. This also connects GitHub; Notion is connected separately from Plan check, where you grant page access and select the pages to inspect.

`localhost` and `127.0.0.1` are different origins. Use the same origin in your browser, environment and callback registrations. Production requires HTTPS.

Source preview makes no AI call. Select **Generate my brief** or **Run plan check** to send the selected source text to OpenAI.

## Architecture and AI

One Next.js application uses React, TypeScript, Tailwind and shadcn UI, with direct GitHub, Notion and OpenAI integrations. Provider tokens remain in encrypted HTTP-only cookies; there is no database. Selections and results live in page memory and survive tab switches, but not a page reload.

PR brief makes one structured model call. Plan check can request additional discussion or PR file evidence through a server-controlled allowlist before producing findings. Zod validates output structure and citation IDs; the UI opens the corresponding source passages. A requirement-change assessment rechecks the inspected evidence before reusing its context.

See [architecture and design](docs/architecture-and-design.md) for boundaries, security decisions and trade-offs.

## Verification and evaluation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests mock providers and the model SDK. A webpack build is also available with `pnpm exec next build --webpack` if Turbopack is restricted by the environment.

The separate [AI evaluation](docs/evaluation.md) records eight synthetic scenario checks and reproduction instructions. It makes paid model calls and is not part of `pnpm test`. Local GitHub/Notion authorization, investigation and impact assessment were also verified with fictional demo data.

## Limitations and next steps

- GitHub access is public-only. Retrieval is capped; a check does not cover the entire backlog, repository or conversation history.
- Valid citations identify inspected passages; they do not prove every model claim is correct. Findings are review aids, not release approval or evidence of passing tests.
- Results are not persisted. Changing scope invalidates derived output; expired or revoked connections require reconnection.
- Public deployment still needs HTTPS callbacks, hosting-level abuse limits, spending controls and sensitive-log redaction. This submission has been verified locally.

Next improvements would be broader discussion coverage based on observed misses, evaluation on consented real projects, and user-controlled history if repeated checks justify persistence.
