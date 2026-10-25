# MySubscriptions

A short, source-backed brief to help developers resume their GitHub work.

## Current implementation

The approved interface, sample flow, direct GitHub OAuth, public-data retrieval, and user-triggered AI briefs are implemented. Live sources never receive a prerecorded brief. Public source data is sent to OpenAI only when the signed-in user requests generation.

`/` is the connection screen, `/dashboard` is the protected GitHub workspace, and `/sample` is the credential-free sample. The live workspace loads sources on entry and supports generation, cited observations, an optional next step, copy with source links, refresh, sign-out, and reconnect/retry states.

The sample uses fixed, synthetic activity and a prerecorded brief. Citations reveal the corresponding source descriptions. Refresh immediately clears the brief; generating it is a separate action. Copy includes source references and the sample disclosure. Synthetic sources deliberately have no invented GitHub links.

On `/sample`, open **Explore sample states** below the source list to inspect loading, before-generation, empty, partial, source-error, brief-error, and limited-context states. The simulated requests recover on retry. The page always identifies itself as a sample, independently of any live GitHub session.

## Run locally

Use Node.js 22.13 or later and pnpm 10.16.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The dev server binds only to loopback.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm start` serves a production build. `pnpm format` formats the application source.

If a restricted environment prevents Turbopack from binding its build-worker ports, `pnpm exec next build --webpack` uses Next.js's supported alternative bundler. The default build command remains unchanged.

## GitHub setup

Create a **GitHub OAuth App** in [developer settings](https://github.com/settings/developers). For local development, set:

- Homepage: `http://127.0.0.1:3000`
- Authorization callback: `http://127.0.0.1:3000/api/auth/github/callback`

Copy `.env.example` to `.env.local` if you do not already have one. Fill `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_PASSWORD` (at least 32 random characters; generate with `openssl rand -base64 48`). Set `APP_URL=http://127.0.0.1:3000`. Keep credentials local and never prefix them with `NEXT_PUBLIC_`.

Use the exact configured origin in the browser. `localhost` and `127.0.0.1` are different cookie origins. `APP_URL` must be an origin without a path, query, or fragment. On deployment use the canonical HTTPS origin and register its `/api/auth/github/callback` URL in a separate production OAuth App. Production rejects HTTP origins. Restart the server after changing environment variables if they have not reloaded.

The sample works without any credentials; unconfigured sign-in is explained on the entry screen.

## OpenAI setup and brief generation

Add `OPENAI_API_KEY` to `.env.local` and use `OPENAI_MODEL=gpt-6-luna` (also the default). The key stays server-side. GitHub retrieval and sample mode remain usable without it; the live dashboard explains that generation is unavailable. Reload the dashboard after configuring the key, restarting the dev server if necessary.

Generation uses the official OpenAI JavaScript SDK, [Responses API structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), and a shared Zod schema. [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) supports this format. No agent framework or model tools are involved.

`POST /api/brief` authenticates the session, checks the configured origin, and fetches a fresh GitHub snapshot using the session identity. It ignores client-supplied sources, accounts, prompts, and model choices. The interface puts the suggested next step directly below a short overview. Its primary action opens the first cited next-step source using the validated GitHub URL; synthetic sample sources remain in the page. Regeneration is secondary. A successful response contains `{ snapshot, brief }`; an empty fresh snapshot returns `brief: null` without an OpenAI call. If generation fails after retrieval, the error includes that fresh snapshot so the user can keep exploring it. An expired GitHub session clears all visible work and prompts reconnection.

The model receives at most 40 deduplicated items under the existing collection caps, including titles, descriptions bounded to 2,000 characters each, repositories, labels, statuses, dates, and coverage. Provider tokens and source URLs are excluded. The UI explains the transfer before generation. Text from repositories is untrusted evidence, never instructions. The prompt forbids inferred approval, blockers, code correctness, deployment, fabricated priority, and forced connections between unrelated work.

The result has a short title and overview, up to three observations, and a nullable next step. Every statement has source IDs. The server rejects malformed output, unknown IDs, duplicate citations, refusals, and incomplete responses. Citation validation proves that references exist; it does not prove every interpretation is correct. Sources remain available for review. Sparse evidence should produce a candid limitation and no invented next step.

There is one model call per generation, with no automatic retries, a 30-second SDK timeout, a 2,400-token output cap, low reasoning effort, and `store: false`. SDK logging is disabled. Disabling response storage is not a guarantee of zero provider retention. API responses and provider fetches are uncached. GitHub and model rate-limit delays are shown separately, without automatic retry; refreshing sources does not bypass the model cooldown. Refresh invalidates the brief, and obsolete requests cannot overwrite newer state.

## GitHub flow and boundaries

The authorization request uses random state and S256 PKCE, requests no additional OAuth scopes, and stores the attempt in a separate encrypted, HTTP-only cookie for ten minutes. The callback consumes the attempt, exchanges the code server-side, and verifies identity with `GET /user`. A session lasts at most eight hours, or less if the provider token expires earlier. Secure, host-only cookies are used on HTTPS. Tokens never enter client props, browser JavaScript, URLs, or application logs. Development request logging excludes the callback URL because its query carries an authorization code; deployment access logs should redact that query too.

The three public-only searches retrieve at most 20 authored PRs updated in the last 14 days, 10 open authored PRs, and 10 open assigned issues. Each is sorted by update time; overlapping results are deduplicated. Titles, descriptions, and labels are bounded. Open draft PRs are labelled Draft. PRs are labelled merged only when GitHub supplies a merge timestamp; closed alone is not treated as merged. Search indexing can lag behind activity on GitHub.

The UI reports caps, incomplete GitHub searches, and failed collections. Partial success preserves available data; total failure is an error rather than an empty snapshot. A revoked token clears the session and visible sources. Requests have timeouts and do not retry automatically. Refresh respects GitHub’s retry delay, including when a partial snapshot remains available.

| Route | Purpose |
| --- | --- |
| `GET /api/auth/github` | Start OAuth; navigation rather than prefetched application link |
| `GET /api/auth/github/callback` | Validate state, exchange code, verify identity, set session |
| `POST /api/auth/logout` | Clear session and pending sign-in, redirect home |
| `POST /api/github/sources` | Authenticated retrieval using the session's identity |
| `POST /api/brief` | Fresh snapshot and one validated, source-backed brief |

All POST routes require the configured same origin. Provider fetches and API responses use `no-store`. GitHub URLs are validated before being exposed as links, and descriptions render as plain text with line breaks preserved. Sign-out clears the local session; revoke the OAuth App separately in GitHub settings to revoke provider access. A copied stateless cookie cannot be immediately revoked server-side before its expiry. No database, background sync, private-repository access, or write operation is introduced.

## Structure

```text
src/app/                    Entry, sample, dashboard, layout and shared theme
src/app/api/                OAuth, sign-out, source retrieval and brief route handlers
src/components/ui/          shadcn-style primitives: Button and Skeleton
src/components/dashboard/   Brief, sources, header, sample states and controller
src/lib/contracts.ts        Typed API responses and source snapshots
src/lib/brief-schema.ts      Shared Zod brief contract
src/lib/server/             Server-only configuration, sessions, OAuth, GitHub and OpenAI
src/lib/sample-data.ts       Fixed synthetic fixtures
src/lib/brief-text.ts        Plain-text brief export
public/images/              Static images
docs/design/                Design documentation
```

The sample controller owns its simulated transitions. The live controller requests the same typed source contract from the application's API and cancels obsolete work on refresh or unmount. Product components receive typed data and callbacks; provider calls stay server-side. Refresh clears the preceding snapshot. Refresh invalidates the brief in both sample and live modes. The shared brief components and interaction hook handle citations, observations, the optional next step, and copy without provider logic.

The UI uses Next.js App Router, TypeScript, Tailwind CSS, the shadcn/ui Button pattern with Radix Slot, and Lucide. Components are owned locally. Component layout, typography, responsive rules, and interaction states use Tailwind utilities. Global CSS holds theme tokens, base styles, and accessibility defaults. The Button geometry is customised to the approved pill treatment. `components.json` preserves the shadcn aliases and theme configuration.

Fonts are bundled locally through Fontsource: Inter Variable with its optical-size axis for display and body text, and IBM Plex Mono for labels. No runtime font request goes to Google. ESLint 9 and TypeScript 5.9 are pinned to the supported ranges of the installed Next.js lint plugins; review those together when upgrading tooling.

## Verification

The UI includes visible keyboard focus, a skip link, expanded-state semantics, live status announcements, explicit sample labelling, and reduced-motion support. Tests cover the sample transitions plus OAuth state/PKCE, actual encrypted session round-trips, expiry/tampering, origin checks, sign-out, bounded queries, normalization, partial failures, revoked tokens, and stale client requests. GitHub responses are mocked in these automated tests.

Local browser verification covered GitHub sign-in, source retrieval, refresh, live brief generation, citation navigation, copying, and opening the suggested PR directly. Sample actions remain inside the illustrative source list. Automated checks cover auth, provider errors, quota exhaustion, output validation, timeouts, source preservation, and stale-request cancellation.

The four synthetic live evaluation cases passed their automated checks. A separate three-PR public Next.js fixture surfaced useful review caveats, but its first attempt failed citation validation; a second manual attempt passed. Human review also found a minor test-count phrasing error. These checks support the context-recovery use case, not a claim of reliable prioritization or measured time savings. Valid citations are not proof of semantic accuracy.

## Live brief evaluation

```sh
pnpm eval:brief
```

This separate command loads `.env.local` and makes four paid OpenAI requests using only fixed synthetic fixtures. Ordinary `pnpm test` makes no provider calls. The live cases cover related work, unrelated work, sparse descriptions, and injected instructions. Each checks the output contract and citations; sparse and adversarial cases have extra regression assertions. The command prints each brief and a short human-review rubric. Review the actual usefulness and grounding, not just the test result. The four synthetic cases have passed a live run; repeat the run after prompt or model changes and review the generated wording.

## Deployment and limitations

Before public deployment, configure the HTTPS origin, production GitHub OAuth application, session password, and OpenAI variables. Configure hosting-level rate limiting on `POST /api/brief` and provider spending controls. Client cooldowns prevent accidental repeats, but are not a durable quota or an abuse-control boundary. There is no database, cross-instance quota, persisted brief history, or background generation. Hosted end-to-end verification remains pending.

The complete scope and future direction are in the [system design](docs/architecture-and-design.md).
