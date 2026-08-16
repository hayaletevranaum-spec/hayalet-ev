# Classic CSS Ownership Matrix

## Shell And Standalone Entrypoints

| Entrypoint | Kind | Linked stylesheets | Notes |
| --- | --- | --- | --- |
| `src/index.html` | shell document | `main.css`, `entrance.css`, `analyze.css`, `server.css`, `rooms.css`, `assistant.css` | Main shell boot document. `page-init.ts` still injects raw page fragments into one runtime document, but `archives.css` and `whisper.css` load lazily through `src/js/app/runtime-page-styles.ts` when those workspace tools open. |
| `src/pages/archives.html` | standalone document | `main.css`, `archives.css` | Standalone archives view with shared room-shell/page-shell primitives from the design-system layer imported by `main.css`. |
| `src/pages/whisper.html` | standalone document | `main.css`, `whisper.css` | Standalone whisper dock view with shared room-shell/page-shell primitives from the design-system layer imported by `main.css`. |
| `src/pages/settings.html` | standalone document | `main.css` | Settings relies on shared page-shell/workbench rules from the design-system layer plus shell/runtime layout from `main.css`. |
| `src/pages/opencode-ui.html` | standalone document | `main.css` | Opencode uses the design-system/workspace shell that currently lives in `main.css`. |

## Fragment Inputs And Runtime Injection

`src/js/app/page-init.ts` imports these templates with `?raw` and injects them into `#pages-container`:

Delivery semantics:
- `linked stylesheet` means the shell document keeps the page CSS linked at boot.
- `lazy runtime stylesheet` means the shell resolves the page CSS on demand through `src/js/app/runtime-page-styles.ts`.

| Fragment | Page id | Ownership | Shell delivery |
| --- | --- | --- | --- |
| `src/pages/entrance.html` | `page-entrance` | `shell page-runtime`, `embedded fragment`, `scene-specific` | linked stylesheet: `src/styles/entrance.css` |
| `src/pages/analyze.html` | `page-analyze` | `shell page-runtime`, `embedded fragment`, `scene-specific` | linked stylesheet: `src/styles/analyze.css` |
| `src/pages/server.html` | `page-server` | `shell page-runtime`, `embedded fragment`, `scene-specific` | linked stylesheet: `src/styles/server.css` |
| `src/pages/rooms.html` | `page-rooms` | `shell page-runtime`, `embedded fragment` | linked stylesheet: `src/styles/rooms.css` |
| `src/pages/assistant.html` | `page-assistant` | `shell page-runtime`, `embedded fragment`, `scene-specific` | linked stylesheet: `src/styles/assistant.css` |
| `src/pages/settings.html` | `page-settings` | `standalone page`, `shell page-runtime`, `embedded fragment`, `scene-specific` | linked stylesheet: `src/styles/main.css` |
| `src/pages/archives.html` | `page-archives` | `standalone page`, `shell page-runtime`, `embedded fragment` | standalone linked stylesheet: `src/styles/archives.css`; shell lazy runtime stylesheet: `src/js/app/runtime-page-styles.ts` |
| `src/pages/whisper.html` | `page-whisper` | `standalone page`, `shell page-runtime`, `embedded fragment` | standalone linked stylesheet: `src/styles/whisper.css`; shell lazy runtime stylesheet: `src/js/app/runtime-page-styles.ts` |

## Stylesheet Ownership

| Stylesheet | Ownership tags | Notes |
| --- | --- | --- |
| `src/styles/main.css` | `shared shell`, `standalone page` | Main shell runtime, settings workbench layout, and opencode standalone layout. |
| `src/styles/design-system/components/page-shells.css` | `shared shell`, `standalone page`, `embedded fragment` | Reusable room-shell, archives shell, settings page, and workspace-tool overlay scaffolds extracted from `main.css`. |
| `src/styles/entrance.css` | `shell page-runtime`, `embedded fragment`, `scene-specific` | Classic entrance slot layout and imported entrance scene/account/report layers. |
| `src/styles/analyze.css` | `shell page-runtime`, `embedded fragment`, `scene-specific` | Analyze conversation layout and embedded archives scene panel surfaces. |
| `src/styles/assistant.css` | `shell page-runtime`, `embedded fragment`, `scene-specific` | Assistant topbar/runtime surfaces and assistant scene shell. |
| `src/styles/server.css` | `shell page-runtime`, `embedded fragment`, `scene-specific` | Server workspace panels and server scene shell. |
| `src/styles/rooms.css` | `shell page-runtime`, `embedded fragment` | Rooms shell and runtime-installed room surfaces. |
| `src/styles/archives.css` | `standalone page`, `shell page-runtime`, `embedded fragment` | Standalone archives stylesheet plus shell-hosted archives rules loaded on demand via `src/js/app/runtime-page-styles.ts`. |
| `src/styles/whisper.css` | `standalone page`, `shell page-runtime`, `embedded fragment` | Standalone whisper stylesheet plus shell-hosted whisper rules loaded on demand via `src/js/app/runtime-page-styles.ts`. |

No stylesheet is tagged as `candidate for deletion` in the current ownership contract. Cleanup stays blocked until selector-contract coverage and ownership splitting make deletion safe.

## Runtime Selector Contracts

These selectors are treated as public runtime interfaces during CSS refactors because TypeScript generates or mutates them:

| Contract | Producer | Backing CSS |
| --- | --- | --- |
| splash screen | `src/js/ui/splash-screen.ts` | `src/styles/design-system/components/splash.css` |
| room manager overlay | `src/js/modules/rooms/room-overlay-markup.ts` | `src/styles/main.css` |
| whisper runtime rows | `src/js/pages/whisper/controller.ts` | `src/styles/whisper.css`, `src/styles/entrance/scene.css` |
| backup overlay markup | `src/js/pages/settings/panels/backup-markup.ts` | `src/styles/main.css` |
| settings account row | `src/js/pages/settings/accounts/account-panel.ts` | `src/styles/entrance/account.css`, `src/styles/main.css` |
| live-log overlay | `src/js/pages/settings/live-log/overlay-render.ts` | `src/styles/entrance/report.css`, `src/styles/server.css` |
| settings scene theme option | `src/js/pages/settings/panels/theme.ts` | `src/styles/design-system/components/theme-settings.css` |
