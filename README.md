# MySubscriptions

A short, source-backed brief to help developers resume their GitHub work.

## Current implementation

The approved interface, sample flow, direct GitHub OAuth, and live public-data retrieval are implemented. OpenAI generation is the next slice. Live sources never receive a prerecorded brief and no data is sent to OpenAI in this version.

`/` is the connection screen, `/dashboard` is the protected GitHub workspace, and `/sample` is the credential-free sample. The live workspace loads sources on entry and supports refresh, source descriptions, GitHub links, sign-out, and reconnect/retry states.

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

Both POST routes require the configured same origin. Provider fetches and API responses use `no-store`. GitHub URLs are validated before being exposed as links, and descriptions render as plain text with line breaks preserved. Sign-out clears the local session; revoke the OAuth App separately in GitHub settings to revoke provider access. A copied stateless cookie cannot be immediately revoked server-side before its expiry. No database, background sync, private-repository access, or write operation is introduced.

## Structure

```text
src/app/                    Entry, sample, dashboard, layout and shared theme
src/app/api/                OAuth, sign-out and source retrieval route handlers
src/components/ui/          shadcn-style primitives: Button and Skeleton
src/components/dashboard/   Brief, sources, header, sample states and controller
src/lib/contracts.ts        Typed source snapshots and briefs
src/lib/server/             Server-only configuration, sessions, OAuth and GitHub
src/lib/sample-data.ts       Fixed synthetic fixtures
src/lib/brief-text.ts        Plain-text brief export
public/images/              Static images
docs/design/                Design documentation
```

The sample controller owns its simulated transitions. The live controller requests the same typed source contract from the application's API and cancels obsolete work on refresh or unmount. Product components receive typed data and callbacks; provider calls stay server-side. Refresh clears the preceding snapshot. The sample's refresh also invalidates its brief; step 3 will apply the same rule to live generation.

The UI uses Next.js App Router, TypeScript, Tailwind CSS, the shadcn/ui Button pattern with Radix Slot, and Lucide. Components are owned locally. Component layout, typography, responsive rules, and interaction states use Tailwind utilities. Global CSS holds theme tokens, base styles, and accessibility defaults. The Button geometry is customised to the approved pill treatment. `components.json` preserves the shadcn aliases and theme configuration.

Fonts are bundled locally through Fontsource: Inter Variable with its optical-size axis for display and body text, and IBM Plex Mono for labels. No runtime font request goes to Google. ESLint 9 and TypeScript 5.9 are pinned to the supported ranges of the installed Next.js lint plugins; review those together when upgrading tooling.

## Verification

The UI includes visible keyboard focus, a skip link, expanded-state semantics, live status announcements, explicit sample labelling, and reduced-motion support. Tests cover the sample transitions plus OAuth state/PKCE, actual encrypted session round-trips, expiry/tampering, origin checks, sign-out, bounded queries, normalization, partial failures, revoked tokens, and stale client requests. GitHub responses are mocked in these automated tests.

Local browser verification covered GitHub sign-in, empty and populated source lists, refresh, deduplication across queries, expanded descriptions, and GitHub links. Model integration is not implemented.

## Next slice

Add user-triggered structured brief generation, source validation, and AI-specific failure handling. Generate against a freshly retrieved snapshot and return that same snapshot with the brief. The complete agreed scope and future direction are in the [system design](docs/architecture-and-design.md).
