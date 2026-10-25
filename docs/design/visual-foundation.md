# MySubscriptions visual foundation

Reference: [Design Systems Surf](https://designsystems.surf/), inspected in the browser on 25 October 2026, including [Products](https://designsystems.surf/products), the [library](https://designsystems.surf/design-systems), and [GitHub detail](https://designsystems.surf/design-systems/github). The supplied footer screenshot anchors the visual direction. Measurements below come from rendered desktop pages. Reference screenshots and working measurements are retained locally and excluded from the submission.

## Reference values

| Element | Observed style |
| --- | --- |
| Page | White `#ffffff`; primary text `#000000` |
| Broad neutral section | `#fafafa`, with 96px vertical padding |
| Secondary text | Black at 60% opacity |
| Library metadata | Black at 45% opacity; descriptive rather than essential status text |
| Soft control surface | `#f5f5f5`; some secondary controls use black at 2% opacity |
| Hero | Inter Display, 56px / 61.6px, weight 500, tracking -1.68px |
| Section heading | Inter Display, 40px / 50px, weight 500, tracking -0.8px |
| Library page heading | Inter Display, 40px / 48px, weight 500, tracking -1.2px |
| Detail section heading | Inter, 24px / 28.8px, weight 500, tracking -0.96px |
| Subheading | Inter Display, 32px / 40px, weight 500, tracking -0.32px |
| Body | Inter, 16px / 24px, weight 400, tracking -0.32px |
| Navigation and button text | Inter, 16px / 24px, weight 500, tracking -0.32px |
| Small labels | IBM Plex Mono, 12px / 18px, weight 400 |
| Library row title | Inter, 20px / 30px, weight 500, tracking -0.6px |
| Library row | Approximately 80px tall, flat list without individual cards |
| Main buttons | Approximately 48px high, 12px 24px padding, 100px radius |
| Main button label | White, 16px / 24px, weight 500; no shadow or unnecessary icon |
| Header buttons | Approximately 38px high, 16px horizontal padding, 100px radius |
| Content container | 1180px maximum width including 22px horizontal padding |
| Reading column | 720px maximum width inside the 1136px usable container |
| Main section gap | 96px |
| Internal gaps | 4px, 8px, 12px, 16px, 32px, 48px depending on hierarchy |

The measured orange button background is:

```css
radial-gradient(75% 150% at 100% 114.2%, #ffb70f 0%, #ff5400 100%)
```

The footer uses a black primary button and a 4px spectrum divider. The live divider is a canvas shader, not a CSS gradient. The approved composition uses the wave brief panel instead of this divider.

The blue-green feature background elsewhere is promotional artwork, not the site palette. It does not belong behind the dashboard.

## Approved direction

The user approved the latest wave-panel composition, saved as [approved-design.png](approved-design.png). This is the implementation target. The insight leads, followed by the wave brief, next step, and sources. The supplied wave panel defines the gradient aesthetic. This is the one intentional colour feature in an otherwise neutral interface.

The matching panel on [Pricing](https://designsystems.surf/pricing) measures 860px wide and approximately 407px tall on desktop, with a 16px radius, 96px vertical padding, 32px internal gaps, and a centred 560px reading column. The main copy is Inter 20px / 30px, weight 400. Its blue, lavender, peach, and yellow wave is rendered with a canvas shader.

- Keep the page heading outside the gradient. The panel contains a short brief and its source references; it is not a testimonial and needs no quotation mark or attribution.
- Preserve the broad soft waves, rounded corners, and generous empty space. Keep lighter peach and yellow areas towards the edges so white copy remains readable. Verify contrast on the actual rendered background.
- Keep the suggested next step, black primary button, and source list on white below the panel. Show one refresh control in the source section.
- The wave is decorative. Start with a still composition; any later movement must be subtle, avoid layout changes, and respect reduced motion.
- Use the gradient panel as the focal point; omit the competing spectrum divider from this composition.
- On narrow screens, reduce outer gutters and panel padding, retain readable line spacing, allow the panel to grow with content, and avoid fixed-height clipping.

### Supporting signed-in reference

The supplied signed-in screenshot is a secondary reference, not a replacement layout. Apply its compact account controls, quiet supporting text, subtle separators, and generous grouping to the header and empty states. Empty states should have one clear heading, one short explanation, and the relevant action. Keep the approved single-column flow; the reference's sidebar, prompt input, notification controls, bookmarks, and upgrade features are outside this product's scope.

## Application mapping

- Use the reference typography, colour roles, button geometry, and spacing rhythm as shared CSS tokens. Avoid per-component approximations.
- Use a 40px dashboard heading, 24px section headings, 16px body text, and small mono metadata. Keep headings at weight 500, not oversized bold display type.
- Keep the dashboard on a white page, with one brief followed by supporting evidence. Use 96px between major sections, 32px between heading and content, and 16px within related text groups. Let the page scroll rather than compressing the complete product into one viewport.
- Use black pills with white labels for the default primary action, matching the supplied footer. Keep the measured orange variant available as a deliberate accent, never a competing second primary action. Secondary controls use pale neutral fills and black text.
- Keep colour confined to the selected wave brief panel. The surrounding page, source links, statuses, and controls remain neutral.
- Present GitHub sources as flat, generously spaced rows with neutral metadata. Keep extra descriptions behind disclosure. Display coverage and failures when relevant without surrounding every item with badges.
- Keep the product footer small and relevant. Borrow the reference's spacing and alignment without copying its marketing link inventory.
- Verify text contrast in implementation. Essential statuses must remain readable even where the source uses very light metadata.
- Preserve the site's visual language while using MySubscriptions content, navigation, and GitHub interactions.

## Build sequence

The first sample flow is implemented. Its rendered desktop panel is 860 × 380px to match the approved composition, with 22px / 32px brief copy and 16px citations. Mobile uses 18px / 28px brief copy. A static wave asset and a contrast scrim preserve the colour family while deepening the reading area. The selected middle wave artwork is retained with a lighter 46% contrast overlay beneath the copy. QA captures stay local; verification is summarised in the [README](../../README.md).

1. Establish theme tokens and reusable UI primitives from the approved design, then build the sample dashboard and its states.
2. Connect the same typed screen to GitHub OAuth, retrieval, and brief generation.
3. Verify responsive layouts, visual fidelity, accessibility, and real integration behaviour.

The original image concepts are rejected: they were too dense, changed button treatments, and introduced unsupported colours. Preserve the selected composition's empty space and restrained typography. Images establish composition only; measured styles remain the implementation source of truth. Visual QA must check spacing rhythm, line lengths, heading hierarchy, button proportions, gradient contrast, and mobile wrapping against the supplied references.
