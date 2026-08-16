import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("scene runtime sessions and scene-backed pages subscribe to runtime theme and asset refreshes", () => {
  const runtimeSessionSource = readFileSync(
    "src/js/scene-editor/scene-debug-runtime-session.ts",
    "utf8"
  );
  const roomsSource = readFileSync("src/js/pages/rooms.ts", "utf8");
  const entranceSource = readFileSync("src/js/pages/entrance/scene/scene-controller.ts", "utf8");
  const settingsSource = readFileSync("src/js/pages/settings/controller.ts", "utf8");
  const assistantSource = readFileSync("src/js/pages/assistant/assistant.ts", "utf8");
  const analyzeSource = readFileSync("src/js/pages/analyze.ts", "utf8");
  const serverSource = readFileSync("src/js/pages/server.ts", "utf8");

  assert.match(runtimeSessionSource, /reloadFromActiveTheme\(debugEnabled: boolean\): void;/);
  assert.match(runtimeSessionSource, /reloadFromActiveTheme\(debugEnabled: boolean\): void \{/);

  [roomsSource, entranceSource, settingsSource, assistantSource, analyzeSource, serverSource].forEach(
    (source) => {
      assert.match(source, /SceneThemeManager\.onChange\(\(\) => \{/);
      assert.match(source, /subscribeSceneThemeAssetDraft\(\(\) => \{/);
      assert.match(source, /reloadFromActiveTheme\(/);
    }
  );

  assert.match(settingsSource, /this\.background\.src = getSceneRoomBackgroundSrc\("settings"\);/);
});
