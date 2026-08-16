import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

void test("ui mode orchestration centralizes option definitions and shared dropdown rendering", () => {
  const stateSource = readFileSync("src/js/app/ui-mode/state.ts", "utf8");
  const dropdownSource = readFileSync("src/js/app/ui-mode/dropdown.ts", "utf8");
  const navigationSource = readFileSync("src/js/app/navigation.ts", "utf8");
  const windowControlsSource = readFileSync("src/js/scene/window-controls.ts", "utf8");

  assert.match(stateSource, /state:\s*"classic"/);
  assert.match(stateSource, /state:\s*"scene"/);
  assert.match(stateSource, /state:\s*"scene-editor"/);
  assert.match(stateSource, /state:\s*"ghost-agent"/);
  assert.match(stateSource, /function getUiModeRestartOptions/);
  assert.match(dropdownSource, /function buildUiModeOptionMarkup/);
  assert.match(dropdownSource, /export function renderUiModeDropdowns/);
  assert.match(navigationSource, /from "\.\/ui-mode\/index\.js"/);
  assert.match(navigationSource, /renderUiModeDropdowns\(\)/);
  assert.match(windowControlsSource, /buildUiModeOptionsMarkup/);
});

void test("scene cleanup removes legacy facades and keeps canonical roots only", () => {
  const sceneEditorIndexSource = readFileSync("src/js/scene-editor/index.ts", "utf8");
  const sceneSystemIndexSource = readFileSync("src/js/scene-system/index.ts", "utf8");
  const uiIndexSource = readFileSync("src/js/ui/index.ts", "utf8");

  assert.equal(existsSync("src/js/scene/theme-pack.ts"), false);
  assert.equal(existsSync("src/js/scene/debug-store.ts"), false);
  assert.equal(existsSync("src/js/scene/scene-debug-rooms.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-debug.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-map.ts"), false);
  assert.equal(existsSync("src/js/scene/debug"), false);
  assert.equal(existsSync("src/js/scene/theme"), false);
  assert.match(sceneEditorIndexSource, /scene-editor-store\.js/);
  assert.match(sceneEditorIndexSource, /scene-layout-editor\.js/);
  assert.match(sceneSystemIndexSource, /scene-theme-registry\.js/);
  assert.match(sceneSystemIndexSource, /scene-theme-assets\.js/);
  assert.match(uiIndexSource, /export \{ ThemeManager \} from "\.\/theme\/index"/);
});
