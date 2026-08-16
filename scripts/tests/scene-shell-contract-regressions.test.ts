import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

void test("scene shell css is wired into the design system", () => {
  const mainCss = read("src/styles/main.css");
  const designSystemIndex = read("src/styles/design-system/index.css");
  const sceneSystemIndex = read("src/styles/scene-system/index.css");
  const sceneEditorIndex = read("src/styles/scene-editor/index.css");
  const sceneShellCss = read("src/styles/scene-system/shell.css");
  const sceneClickableCss = read("src/styles/scene-system/clickable.css");
  const debugOverridesCss = read("src/styles/scene-editor/debug-overrides.css");

  assert.match(mainCss, /@import "\.\/scene-system\/index\.css";/);
  assert.match(mainCss, /@import "\.\/scene-editor\/index\.css";/);
  assert.doesNotMatch(designSystemIndex, /scene-shell\.css/);
  assert.match(sceneSystemIndex, /@import "\.\/shell\.css";/);
  assert.match(sceneSystemIndex, /@import "\.\/clickable\.css";/);
  assert.match(sceneEditorIndex, /editor-panel\.css/);
  assert.match(sceneEditorIndex, /debug-overrides\.css/);
  assert.match(sceneShellCss, /\.scene-shell__view/);
  assert.match(sceneClickableCss, /\.scene-clickable__button/);
  assert.match(sceneClickableCss, /\.scene-clickable__label/);
  assert.match(sceneClickableCss, /scene-clickable-back-arrow-shift/);
  assert.match(debugOverridesCss, /\[data-scene-editor="true"\]/);
  assert.match(debugOverridesCss, /\.scene-clickable__label/);
  assert.match(debugOverridesCss, /\.assistant-scene__character/);
  assert.doesNotMatch(sceneShellCss, /scene-back-zone/);
  assert.doesNotMatch(debugOverridesCss, /entrance-scene__hotspot-label/);
  assert.doesNotMatch(debugOverridesCss, /analyze-scene__hotspot-label/);
  assert.doesNotMatch(debugOverridesCss, /assistant-scene__hotspot-label/);
  assert.doesNotMatch(debugOverridesCss, /server-scene__hotspot-label/);
  assert.doesNotMatch(debugOverridesCss, /settings-scene__hotspot-label/);
  assert.doesNotMatch(sceneShellCss, /\[data-scene-back-zone="left"\]/);
  assert.doesNotMatch(sceneShellCss, /\[data-scene-back-zone="right"\]/);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "src/styles/design-system/components/scene-shell.css")), false);
});

void test("scene pages no longer ship static back-zone markup", () => {
  const targets = [
    "src/pages/assistant.html",
    "src/pages/server.html",
    "src/pages/analyze.html",
    "src/index.html",
    "src/pages/entrance.html",
  ];

  targets.forEach((target) => {
    const source = read(target);
    assert.doesNotMatch(source, /data-scene-back-zone=/);
    assert.doesNotMatch(source, /scene-back-zone__copy/);
  });
});

void test("scene controllers render the shared generated back layer", () => {
  const targets = [
    "src/js/pages/assistant/assistant.ts",
    "src/js/pages/server.ts",
    "src/js/pages/analyze.ts",
    "src/js/pages/settings/controller.ts",
    "src/js/pages/entrance/scene/scene-controller.ts",
  ];

  targets.forEach((target) => {
    const source = read(target);
    assert.match(source, /renderSceneBackLayer/);
    assert.match(source, /themeDefaults:/);
    assert.match(source, /getSceneBackNodeForView|syncSceneViewRuntime|scene-shell__view/);
    assert.doesNotMatch(source, /bindSceneBackZones/);
  });
});
