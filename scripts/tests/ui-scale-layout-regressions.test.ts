import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

void test("low-resolution app shells keep viewport height under ui zoom", () => {
  const layoutSource = readFileSync("src/styles/design-system/tokens/layout.css", "utf8");
  const mainSource = readFileSync("src/styles/main.css", "utf8");
  const sceneShellSource = readFileSync("src/styles/scene-system/shell.css", "utf8");

  assert.match(
    layoutSource,
    /--layout-app-height-zoom-compensated:\s*calc\(\s*var\(--layout-app-height\)\s*\/\s*max\(var\(--app-ui-scale-factor, 1\), 0\.01\)\s*\)/
  );
  assert.match(
    layoutSource,
    /--layout-page-height:\s*calc\(var\(--layout-app-height-zoom-compensated\)\s*-\s*var\(--topbar-height\)\)/
  );
  assert.match(
    mainSource,
    /#app\s*\{[\s\S]*height:\s*var\(--layout-app-height-zoom-compensated\);/
  );
  assert.match(
    mainSource,
    /body\.menu-hidden \.main-content\s*\{[\s\S]*height:\s*var\(--layout-app-height-zoom-compensated\);/
  );
  assert.match(
    mainSource,
    /\.app-shell\s*\{[\s\S]*height:\s*var\(--layout-app-height-zoom-compensated\);/
  );
  assert.match(
    sceneShellSource,
    /\[data-ui-mode="scene"\] \.main-content\s*\{[\s\S]*height:\s*var\(--layout-app-height-zoom-compensated\);/
  );
});
