import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

void test("classic theme normalization is centralized and reused by settings schema", () => {
  const normalizerSource = readFileSync("src/js/ui/theme/appearance-normalizer.ts", "utf8");
  const settingsSchemaSource = readFileSync("src/js/modules/settings/settings-schema.ts", "utf8");
  const classicThemeManagerSource = readFileSync(
    "src/js/ui/theme/classic-theme-manager.ts",
    "utf8"
  );
  const themeIndexSource = readFileSync("src/js/ui/theme/index.ts", "utf8");

  assert.match(normalizerSource, /export function normalizeThemeAppearance/);
  assert.match(normalizerSource, /export function areThemeAppearanceSettingsEqual/);
  assert.match(normalizerSource, /export function resolveThemeFromAppearance/);
  assert.match(
    settingsSchemaSource,
    /import \{ normalizeThemeAppearance \} from "\.\.\/\.\.\/ui\/theme\/appearance-normalizer\.js"/
  );
  assert.match(classicThemeManagerSource, /from "\.\/appearance-normalizer\.js"/);
  assert.match(classicThemeManagerSource, /from "\.\/theme-persistence\.js"/);
  assert.match(classicThemeManagerSource, /from "\.\/theme-settings-ui\.js"/);
  assert.match(classicThemeManagerSource, /from "\.\/theme-settings-bindings\.js"/);
  assert.match(themeIndexSource, /export \{ ThemeManager \} from "\.\/classic-theme-manager\.js"/);
  assert.match(themeIndexSource, /export type \{ ThemeId \} from "\.\/classic-theme-manager\.js"/);
  assert.equal(existsSync("src/js/ui/theme-manager.ts"), false);
});

void test("classic theme host propagation uses dedicated host sync helpers", () => {
  const hostSyncSource = readFileSync("src/js/ui/theme/theme-host-sync.ts", "utf8");
  const opencodeUiSource = readFileSync("src/js/pages/opencode-ui/app.ts", "utf8");
  const assistantSource = readFileSync("src/js/pages/assistant/assistant.ts", "utf8");

  assert.match(hostSyncSource, /export function resolveThemeFromSearchParams/);
  assert.match(hostSyncSource, /export function isOpencodeUiThemeHost/);
  assert.match(hostSyncSource, /export function buildInlineThemeSyncScript/);
  assert.match(opencodeUiSource, /resolveThemeFromSearchParams/);
  assert.match(assistantSource, /buildInlineThemeSyncScript/);
  assert.match(assistantSource, /isOpencodeUiThemeHost/);
});

void test("classic scene scale tokens and theme aliases are centralized", () => {
  const designSystemIndexSource = readFileSync("src/styles/design-system/index.css", "utf8");
  const sceneScaleSource = readFileSync("src/styles/design-system/tokens/scene-scale.css", "utf8");
  const themeBaseSource = readFileSync("src/styles/design-system/themes/theme-base.css", "utf8");
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const entranceSceneSource = readFileSync("src/styles/entrance/scene.css", "utf8");
  const toastSource = readFileSync("src/styles/design-system/components/toast.css", "utf8");
  const opencodeUiTabsSource = readFileSync(
    "src/styles/design-system/components/opencode-ui-tabs.css",
    "utf8"
  );

  assert.match(designSystemIndexSource, /@import "\.\/tokens\/scene-scale\.css";/);
  assert.match(designSystemIndexSource, /@import "\.\/themes\/theme-classic-aliases\.css";/);
  assert.match(sceneScaleSource, /--scene-rem-0-72:/);
  assert.match(sceneScaleSource, /--scene-px-10:/);
  assert.doesNotMatch(entranceSceneSource, /--scene-rem-0-72:/);
  assert.doesNotMatch(entranceSceneSource, /--scene-px-10:/);
  assert.doesNotMatch(themeBaseSource, /--assistant-topbar-bg:/);
  assert.doesNotMatch(themeBaseSource, /--app-shell-bg:/);
  assert.match(themeAliasSource, /--assistant-topbar-bg:/);
  assert.match(themeAliasSource, /--app-shell-bg:/);
  assert.match(themeAliasSource, /:root\[data-theme-surface="solid"\]/);
  assert.doesNotMatch(toastSource, /--toast-max-w:/);
  assert.match(toastSource, /max-width: var\(--layout-toast-max-w\);/);
  assert.doesNotMatch(opencodeUiTabsSource, /max-height: 52vh;/);
  assert.match(
    opencodeUiTabsSource,
    /max-height: min\(62vh, var\(--layout-opencode-model-settings-list-max-h\)\);/
  );
});

void test("classic scene shell surfaces are centralized behind shared primitives", () => {
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const sceneShellSource = readFileSync("src/styles/scene-system/shell.css", "utf8");
  const assistantSource = readFileSync("src/styles/assistant.css", "utf8");
  const serverSource = readFileSync("src/styles/server.css", "utf8");
  const analyzeSource = readFileSync("src/styles/analyze.css", "utf8");
  const entranceSceneSource = readFileSync("src/styles/entrance/scene.css", "utf8");
  const mainSource = readFileSync("src/styles/main.css", "utf8");
  const editorPanelSource = readFileSync("src/styles/scene-editor/editor-panel.css", "utf8");
  const assistantPageSource = readFileSync("src/pages/assistant.html", "utf8");
  const serverPageSource = readFileSync("src/pages/server.html", "utf8");
  const analyzePageSource = readFileSync("src/pages/analyze.html", "utf8");
  const entrancePageSource = readFileSync("src/pages/entrance.html", "utf8");
  const settingsPageSource = readFileSync("src/pages/settings.html", "utf8");
  const whisperPageSource = readFileSync("src/pages/whisper.html", "utf8");
  const archivesPageSource = readFileSync("src/pages/archives.html", "utf8");

  assert.match(themeAliasSource, /--scene-shell-topbar-bg:/);
  assert.match(themeAliasSource, /--scene-shell-panel-bg:/);
  assert.match(themeAliasSource, /--scene-shell-embedded-bg:/);
  assert.match(themeAliasSource, /--scene-shell-framed-bg:/);
  assert.match(themeAliasSource, /--scene-shell-window-controls-bg:/);
  assert.match(sceneShellSource, /\.scene-shell__topbar/);
  assert.match(sceneShellSource, /\.scene-shell__panel\b/);
  assert.match(sceneShellSource, /\.scene-shell__panel-shade/);
  assert.match(sceneShellSource, /\.scene-shell__embedded-page/);
  assert.match(sceneShellSource, /\.scene-shell__framed-shell\b/);
  assert.match(sceneShellSource, /\.scene-shell__framed-shell-head/);
  assert.match(assistantPageSource, /assistant-topbar scene-shell__topbar/);
  assert.match(assistantPageSource, /assistant-webview-panel scene-shell__panel/);
  assert.match(serverPageSource, /server-panel scene-shell__panel/);
  assert.match(analyzePageSource, /analyze-wrapper scene-shell__panel/);
  assert.match(analyzePageSource, /analyze-scene__panel-shade scene-shell__panel-shade/);
  assert.match(entrancePageSource, /entrance-scene__view-shade scene-shell__panel-shade/);
  assert.match(settingsPageSource, /settings-panel-shell scene-shell__framed-shell/);
  assert.match(settingsPageSource, /settings-panel-head scene-shell__framed-shell-head/);
  assert.match(whisperPageSource, /whisper-page room-shell scene-shell__embedded-page/);
  assert.match(archivesPageSource, /archives-page scene-shell__embedded-page/);
  assert.match(assistantSource, /background: var\(--scene-shell-panel-viewport-bg\);/);
  assert.doesNotMatch(assistantSource, /\.assistant-scene__screen-shade\s*\{/);
  assert.doesNotMatch(serverSource, /\.server-scene__screen-shade\s*\{/);
  assert.doesNotMatch(analyzeSource, /\.analyze-scene__panel-shade\s*\{/);
  assert.doesNotMatch(entranceSceneSource, /\.entrance-scene__view-shade\s*\{/);
  assert.match(mainSource, /--settings-workbench-border: var\(--scene-shell-framed-border\);/);
  assert.doesNotMatch(mainSource, /\.settings-panel-shell::before\s*\{/);
  assert.match(editorPanelSource, /@media \(--breakpoint-max-768\)/);
  assert.doesNotMatch(editorPanelSource, /@media \(max-width: 720px\)/);
});

void test("shared page shells and responsive shell measurements are extracted from main.css", () => {
  const designSystemIndexSource = readFileSync("src/styles/design-system/index.css", "utf8");
  const pageShellsSource = readFileSync(
    "src/styles/design-system/components/page-shells.css",
    "utf8"
  );
  const mainSource = readFileSync("src/styles/main.css", "utf8");
  const layoutTokenSource = readFileSync("src/styles/design-system/tokens/layout.css", "utf8");
  const spacingTokenSource = readFileSync("src/styles/design-system/tokens/spacing.css", "utf8");

  assert.match(designSystemIndexSource, /@import "\.\/components\/page-shells\.css";/);
  assert.match(pageShellsSource, /\.room-shell \{/);
  assert.match(pageShellsSource, /\.archives-page__content \{/);
  assert.match(pageShellsSource, /\.page-settings\[data-workspace-tool-mode="overlay"\]/);
  assert.match(pageShellsSource, /@media \(--breakpoint-max-768\)/);
  assert.doesNotMatch(mainSource, /\.room-shell \{/);
  assert.doesNotMatch(mainSource, /\.archives-page__content \{/);
  assert.doesNotMatch(mainSource, /--relay-line-width: 28px;/);
  assert.match(mainSource, /\.relay-flow-line \{/);
  assert.match(layoutTokenSource, /--layout-topbar-slot-gap: 5px;/);
  assert.match(layoutTokenSource, /--layout-topbar-relay-line-w: 28px;/);
  assert.match(spacingTokenSource, /--topbar-height-compact: 84px;/);
  assert.match(spacingTokenSource, /--topbar-height-mobile: 76px;/);
  assert.match(spacingTokenSource, /@media \(--breakpoint-max-1024\)/);
  assert.doesNotMatch(mainSource, /:root \{\s*--topbar-height: 84px;/);
});

void test("shell-hosted archives and whisper styles are lazy loaded outside the main html graph", () => {
  const indexSource = readFileSync("src/index.html", "utf8");
  const runtimeStyleSource = readFileSync("src/js/app/runtime-page-styles.ts", "utf8");
  const archivesControllerSource = readFileSync("src/js/pages/archives/controller.ts", "utf8");
  const whisperControllerSource = readFileSync("src/js/pages/whisper/page-controller.ts", "utf8");

  assert.doesNotMatch(indexSource, /\/styles\/archives\.css/);
  assert.doesNotMatch(indexSource, /\/styles\/whisper\.css/);
  assert.match(
    runtimeStyleSource,
    /archives:\s*async \(\)\s*=>\s*await import\("\.\.\/\.\.\/styles\/archives\.css"\)/
  );
  assert.match(
    runtimeStyleSource,
    /whisper:\s*async \(\)\s*=>\s*await import\("\.\.\/\.\.\/styles\/whisper\.css"\)/
  );
  assert.match(archivesControllerSource, /await ensureRuntimePageStyles\("archives"\);/);
  assert.match(whisperControllerSource, /await ensureRuntimePageStyles\("whisper"\);/);
});

void test("shared surface recipes stay consolidated across classic utility panels", () => {
  const opencodeTabsSource = readFileSync(
    "src/styles/design-system/components/opencode-ui-tabs.css",
    "utf8"
  );
  const archivesSource = readFileSync("src/styles/archives.css", "utf8");
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const obsidianThemeSource = readFileSync(
    "src/styles/design-system/themes/theme-obsidian.css",
    "utf8"
  );
  const ivoryThemeSource = readFileSync(
    "src/styles/design-system/themes/theme-ivory-lab.css",
    "utf8"
  );
  const emberThemeSource = readFileSync(
    "src/styles/design-system/themes/theme-ember-console.css",
    "utf8"
  );

  assert.equal((opencodeTabsSource.match(/\.ds-todo-item,\s*\n\.ds-file-item \{/g) ?? []).length, 1);
  assert.match(
    archivesSource,
    /\.archives-list \.empty,\s*\n\.search-empty,\s*\n\.protocol-list \.empty,\s*\n\.protocol-editor-content \.ds-empty-state \{/
  );
  assert.match(archivesSource, /\.result-item:hover,\s*\n\.protocol-item:hover \{/);
  assert.match(archivesSource, /\.page-archives \.ds-surface-card \{/);
  assert.match(archivesSource, /background: var\(--archives-surface-card-bg, var\(--bg-panel\)\);/);
  assert.match(archivesSource, /\.page-archives \.form-input \{/);
  assert.match(archivesSource, /background: var\(--archives-field-bg, var\(--bg-input\)\);/);
  assert.match(archivesSource, /\.page-archives \.ds-choice-chip \{/);
  assert.match(archivesSource, /background: var\(--archives-choice-bg, var\(--bg-muted\)\);/);
  assert.doesNotMatch(archivesSource, /--surface-card-bg:\s*linear-gradient/);
  assert.doesNotMatch(archivesSource, /--field-bg:\s*linear-gradient/);
  assert.doesNotMatch(archivesSource, /--ds-choice-bg:\s*linear-gradient/);
  assert.match(themeAliasSource, /--archives-surface-card-bg:/);
  assert.match(themeAliasSource, /--archives-choice-bg:/);
  assert.match(themeAliasSource, /--archives-tab-count-bg-active:/);
  assert.match(obsidianThemeSource, /--archives-shell-bg:/);
  assert.match(ivoryThemeSource, /--archives-shell-bg:/);
  assert.match(emberThemeSource, /--archives-shell-bg:/);
});

void test("analyze and server scene palettes resolve through classic theme aliases", () => {
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const analyzeSource = readFileSync("src/styles/analyze.css", "utf8");
  const serverSource = readFileSync("src/styles/server.css", "utf8");

  assert.match(themeAliasSource, /--analyze-scene-surface-bg:/);
  assert.match(themeAliasSource, /--analyze-scene-archives-frame-bg:/);
  assert.match(themeAliasSource, /--server-scene-room-bg:/);
  assert.match(themeAliasSource, /--server-scene-activity-error-bg:/);
  assert.match(analyzeSource, /background: var\(--analyze-scene-surface-bg\);/);
  assert.match(analyzeSource, /background: var\(--analyze-scene-surface-overlay\);/);
  assert.match(analyzeSource, /background: var\(--analyze-scene-archives-frame-bg\);/);
  assert.match(serverSource, /background: var\(--server-scene-room-bg\);/);
  assert.match(serverSource, /background: var\(--server-scene-activity-bg\);/);
  assert.match(serverSource, /background: var\(--server-scene-activity-error-bg\);/);
  assert.doesNotMatch(analyzeSource, /rgb\(255 182 103 \/ 0\.16\)/);
  assert.doesNotMatch(serverSource, /rgb\(123 210 255 \/ 0\.12\)/);
});

void test("entrance scene palette resolves through classic theme aliases", () => {
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const entranceSceneSource = readFileSync("src/styles/entrance/scene.css", "utf8");

  assert.match(themeAliasSource, /--entrance-scene-page-bg:/);
  assert.match(themeAliasSource, /--entrance-scene-character-filter-loading:/);
  assert.match(themeAliasSource, /--entrance-scene-menu-bg:/);
  assert.match(entranceSceneSource, /background: var\(--entrance-scene-page-bg\);/);
  assert.match(entranceSceneSource, /filter: var\(--entrance-scene-character-filter-loading\);/);
  assert.match(entranceSceneSource, /background: var\(--entrance-scene-menu-bg\);/);
  assert.doesNotMatch(entranceSceneSource, /rgb\(/);
});

void test("assistant scene palette resolves through classic theme aliases", () => {
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const assistantSource = readFileSync("src/styles/assistant.css", "utf8");

  assert.match(themeAliasSource, /--assistant-scene-surface-bg:/);
  assert.match(themeAliasSource, /--assistant-scene-character-filter-loading:/);
  assert.match(themeAliasSource, /--assistant-scene-container-bg:/);
  assert.match(assistantSource, /background: var\(--assistant-scene-surface-bg\);/);
  assert.match(assistantSource, /background: var\(--assistant-scene-surface-overlay\);/);
  assert.match(assistantSource, /filter: var\(--assistant-scene-character-filter-loading\);/);
  assert.match(assistantSource, /background: var\(--assistant-scene-container-bg\);/);
  assert.doesNotMatch(assistantSource, /rgb\(/);
});

void test("shared overlay, splash, and settings scene palettes resolve through classic theme aliases", () => {
  const themeAliasSource = readFileSync(
    "src/styles/design-system/themes/theme-classic-aliases.css",
    "utf8"
  );
  const pageShellsSource = readFileSync(
    "src/styles/design-system/components/page-shells.css",
    "utf8"
  );
  const splashSource = readFileSync("src/styles/design-system/components/splash.css", "utf8");
  const mainSource = readFileSync("src/styles/main.css", "utf8");

  assert.match(themeAliasSource, /--workspace-tool-overlay-bg:/);
  assert.match(themeAliasSource, /--splash-scene-bg:/);
  assert.match(themeAliasSource, /--settings-scene-surface-bg:/);
  assert.match(pageShellsSource, /background: var\(--workspace-tool-overlay-bg\);/);
  assert.match(splashSource, /background: var\(--splash-scene-bg\);/);
  assert.match(mainSource, /background: var\(--settings-scene-surface-bg\);/);
  assert.match(mainSource, /background: var\(--settings-scene-surface-overlay\);/);
  assert.doesNotMatch(pageShellsSource, /rgb\(/);
  assert.doesNotMatch(splashSource, /rgb\(/);
});
