import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

void test("shared scene consumers import canonical character and debug helpers", () => {
  const sources = [
    readFileSync("src/js/pages/assistant/assistant.ts", "utf8"),
    readFileSync("src/js/pages/analyze.ts", "utf8"),
    readFileSync("src/js/pages/server.ts", "utf8"),
    readFileSync("src/js/pages/rooms.ts", "utf8"),
    readFileSync("src/js/pages/settings/controller.ts", "utf8"),
    readFileSync("src/js/scene/renderers/character-layer.ts", "utf8"),
  ];

  for (const source of sources) {
    assert.doesNotMatch(source, /entrance\/scene\/scene-avatar\.js/);
    assert.doesNotMatch(source, /entrance\/scene\/scene-character-roster\.js/);
    assert.doesNotMatch(source, /entrance\/scene\/scene-editor\.js/);
    assert.doesNotMatch(source, /scene\/debug\/index\.js/);
    assert.doesNotMatch(source, /scene\/theme\/scene-theme-assets\.js/);
  }

  assert.match(sources[0] as string, /from "\.\.\/\.\.\/scene\/characters\/index\.js"/);
  assert.match(sources[0] as string, /from "\.\.\/\.\.\/scene-editor\/index\.js"/);
  assert.match(sources[0] as string, /from "\.\.\/\.\.\/scene-system\/index\.js"/);
  assert.match(sources[1] as string, /from "\.\.\/scene\/characters\/index\.js"/);
  assert.match(sources[1] as string, /from "\.\.\/scene-editor\/index\.js"/);
  assert.match(sources[1] as string, /from "\.\.\/scene-system\/index\.js"/);
});

void test("legacy entrance scene helper files are removed after migration", () => {
  const charactersIndex = readFileSync("src/js/scene/characters/index.ts", "utf8");
  const sceneEditorIndex = readFileSync("src/js/scene-editor/index.ts", "utf8");
  const sceneSystemIndex = readFileSync("src/js/scene-system/index.ts", "utf8");

  assert.equal(existsSync("src/js/pages/entrance/scene/scene-avatar.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-character-roster.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-character-state.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-editor.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-character-role.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-hotspots.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-debug.ts"), false);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-map.ts"), false);
  assert.match(charactersIndex, /export \* from "\.\/scene-avatar\.js"/);
  assert.match(charactersIndex, /export \* from "\.\/scene-character-roster\.js"/);
  assert.match(charactersIndex, /export \* from "\.\/scene-character-state\.js"/);
  assert.match(sceneEditorIndex, /export \* from "\.\/scene-layout-editor\.js"/);
  assert.match(sceneSystemIndex, /export \* from "\.\/scene-loading-theme\.js"/);
});
