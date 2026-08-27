# Visual thesis — the telemetry night market

## Direction and rationale

Telemetry Budget Guard is a **night-market neon signage** utility. An observability bill is easiest to understand as a row of lit price boards: every signal has a visible rate, every proposed change changes the total, and a red shutter comes down before overspend. The site borrows the dense utility, handwritten price-ticket energy, and pools of colored light of a midnight street market without turning the CLI into decoration.

This is intentionally a single dark treatment. The ink-black canvas is the night; high-contrast paper text and cyan/amber signs remain readable. It does not follow the visitor's color scheme because the metaphor and tested contrast depend on darkness.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#080b0d` | page background |
| `stall` | `#11171a` | raised surfaces |
| `paper` | `#f5f2e8` | primary text |
| `paper-muted` | `#b7c1bd` | secondary text |
| `tube-cyan` | `#4de6d1` | primary action, pass state |
| `ticket-amber` | `#ffc45c` | estimates and annotations |
| `shutter-red` | `#ff6b6b` | failure state |
| `wire` | `#354247` | rules and borders |

All body combinations are ≥ 4.5:1. Status never depends on color: `PASS`, `FAIL`, icons, and explanatory text accompany it.

## Type

- Display and body: a system sans stack (`Inter` where installed, `ui-sans-serif`, `system-ui`) for fast, private loading and sturdy sign-letter shapes.
- Code and numbers: `ui-monospace`, `SFMono-Regular`, `Cascadia Code`, `Liberation Mono`; tabular figures make before/after columns stable.
- Scale: 16px body, 18px lead, 20px section intro, 28px section title, clamp(40px, 7vw, 76px) hero. Measures cap at 68 characters.

No font files are shipped: this avoids a network request and keeps the static product below budget while still using two purposeful typographic voices.

## Spacing and layout

An 8px rhythm drives gaps (8, 16, 24, 32, 48, 64, 96). A slightly skewed ticket edge and offset sign-shadow create product-specific depth. The desktop hero is a two-stall grid; at 390px the estimate board moves below the pitch, optional nav copy drops, and all actions become full-width. Targets are at least 44px.

## Interaction grammar

- Primary actions glow like a sign switching on; pressed actions move down 1px.
- Demo inputs resemble vendor tally slips, with a persistent baseline/proposed split.
- Results update in one place and announce through a polite live region.
- Focus uses a 3px amber outline with a dark offset, visible on every interactive control.
- Empty, invalid, offline, pass, and fail states each name the state and give the next action.

## Motion policy

Only opacity and transform animate, for 180–240ms. The hero illustration settles upward once, and changing totals cross-fade. Nothing loops or flashes. Under `prefers-reduced-motion: reduce`, scrolling is instant and all animation/transition durations are removed.

## Asset plan and provenance

- `site/public/night-market-telemetry.webp`: original AI-generated editorial illustration, used as explanatory atmosphere behind the estimator signboard. Generated 2026-08-27 with the factory `factory-image` deployment via `/opt/fleet/lib/gen-image.sh`, then converted locally to WebP. Prompt: “Wide editorial night-market scene reimagined as an observability data bazaar; small stalls made from dark server racks; glowing cyan trace ribbons, amber metric tokens, and coral log receipts flow toward a single illuminated budget gate; screen-print and cut-paper texture; deep ink-black background; cinematic but restrained; strong negative space on the left for landing-page copy; no people, no readable text, no logos, no gradients, no watermark; 3:2 landing-page hero.” Generated asset is original for this product; project use under the repository MIT license.
- Icons, ticket edges, grid, and signal diagrams are hand-authored in CSS/inline SVG and contain no third-party artwork.
