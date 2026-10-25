# MySubscriptions

A short, source-backed brief to help developers resume their GitHub work.

## Current implementation

This is the first implementation slice: the approved responsive interface and an interactive sample flow. GitHub OAuth, live retrieval, and OpenAI generation are the next slice. Nothing in this version calls GitHub or OpenAI. No credentials are required to run it.

The sample uses fixed, synthetic activity and a prerecorded brief. Citations reveal the corresponding source descriptions. Refresh immediately clears the brief; generating it is a separate action. Copy includes source references and the sample disclosure. Synthetic sources deliberately have no invented GitHub links.

Open **Explore sample states** below the source list to inspect loading, before-generation, empty, partial, source-error, brief-error, and limited-context states. The simulated requests recover on retry. The page always identifies itself as a sample.

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

## Structure

```text
src/app/                    Next.js route, layout, metadata, shared theme
src/components/ui/          shadcn-style primitives: Button and Skeleton
src/components/dashboard/   Brief, sources, header, sample states and controller
src/lib/contracts.ts        Typed source snapshots and briefs
src/lib/sample-data.ts       Fixed synthetic fixtures
src/lib/brief-text.ts        Plain-text brief export
public/images/              Optimised decorative wave artwork
docs/design/                Approved visual target and design decisions
```

The sample controller owns transitions and simulated latency. Product components receive data and callbacks; they do not fetch providers. Request timers are cancelled on scenario changes and unmount, and refresh invalidates the prior brief. The existing component contract can receive real server results in the next slice.

The UI uses Next.js App Router, TypeScript, Tailwind CSS, the shadcn/ui Button pattern with Radix Slot, and Lucide. Components are owned locally. The Button geometry is customised to the approved pill treatment. `components.json` preserves the shadcn aliases and theme configuration.

Fonts are bundled locally through Fontsource: Inter Variable with its optical-size axis for display and body text, and IBM Plex Mono for labels. No runtime font request goes to Google. ESLint 9 and TypeScript 5.9 are pinned to the supported ranges of the installed Next.js lint plugins; review those together when upgrading tooling.

## Design and verification

[Approved design](docs/design/approved-design.png) · [Visual foundation](docs/design/visual-foundation.md) · [System design](docs/architecture-and-design.md)

The page follows the approved insight → wave brief → next step → sources hierarchy. The decorative wave is a static, generated WebP derived from the supplied reference. A contrast scrim deepens only the reading area; the artwork has no text baked in. It does not use a shader, animation loop, or canvas dependency. Mobile fits the abstract texture to the panel so its warm corners remain visible.

The UI includes visible keyboard focus, a skip link, expanded-state semantics, live status announcements, explicit sample labelling, and reduced-motion support. Focused tests cover brief invalidation, cancellation of stale work, retry recovery, partial-source grounding, and copied references. Browser checks cover the principal sample interactions and responsive layout. These checks do not constitute verification of OAuth or model integration, which are not implemented yet.

## Next slice

Connect the typed interface to direct GitHub OAuth and bounded public-data retrieval, then add structured brief generation and provider-specific error handling. The complete agreed scope and future direction are in the [system design](docs/architecture-and-design.md).

Reference implementations: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [shadcn/ui](https://ui.shadcn.com/docs), and [Design Systems Surf](https://designsystems.surf/).
