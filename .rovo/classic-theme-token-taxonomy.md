# Classic Theme Token Taxonomy

## Layers

| Layer | Owner | Rule |
| --- | --- | --- |
| `primitive` | `src/styles/design-system/tokens/*.css` | Own raw scales only: color primitives, spacing, sizing, layout, breakpoints, motion, borders, shadows, and effects. |
| `semantic theme` | `src/styles/design-system/themes/theme-*.css` | Own theme-resolved aliases only: surfaces, text roles, scene shell states, and page-level semantic slots. |
| `component alias` | `src/styles/design-system/components/*.css` | Own reusable component hooks and variant aliases, not hardcoded palette literals. |
| `page alias` | `src/styles/*.css`, `src/styles/entrance/*.css` | Own page-local semantic intent and geometry, not duplicated component tokens or raw palette values. |
| `scene scale alias` | planned shared token file under `src/styles/design-system/tokens/` | Canonical home for `--scene-rem-*`, `--scene-px-*`, and `--scene-em-*` once the remaining consumers stop depending on entrance scene import order. |

## Migration Rules

1. Raw literals stay in `primitive` files only.
2. Theme files map primitives into semantic aliases and must not absorb page-specific geometry.
3. Component files may expose override hooks but should defer palette and surface choices to semantic theme aliases.
4. Page files may keep layout geometry and page-only exceptions, but repeated surface treatments should move to component or theme aliases.
5. `--scene-*` measurement tokens move to a shared token layer before consumer cleanup so import order stays explicit.

## Current Guardrails

- `main.css` is shared-shell infrastructure, not a dumping ground for future page-specific surfaces.
- `assistant.css`, `analyze.css`, `server.css`, `rooms.css`, `archives.css`, and `whisper.css` are page owners; repeated surface contracts found there should be promoted instead of copied.
- Classic theme IDs are stable compatibility contracts: `obsidian`, `ivory-lab`, and `ember-console`.
- Token migrations must preserve the ownership model enforced by `scripts/lib/classic-css-contract.mjs` and `scripts/tests/classic-css-entrypoint-regressions.test.ts`.
