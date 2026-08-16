import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterPath = "src/js/pages/assistant/opencode-adapter.ts";
const configPath = "src/js/modules/webview/providers/opencode/config.ts";

function readAdapter(): string {
  return readFileSync(adapterPath, "utf8");
}

function readConfig(): string {
  return readFileSync(configPath, "utf8");
}

void test("opencode config derives a workspace route from the encoded directory path", () => {
  const configContent = readConfig();

  assert.match(configContent, /function encodeWorkspaceSegment\(workspace: string\): string/);
  assert.match(
    configContent,
    /return btoa\(binary\)\.replace\(\/\\\+\/g, "-"\)\.replace\(\/\\\/\/g, "_"\)\.replace\(\/=\+\$\/u, ""\);/
  );
  assert.match(
    configContent,
    /return encodedWorkspace === "" \? serverUrl : `\$\{serverUrl\}\/\$\{encodedWorkspace\}`;/
  );
});

void test("opencode adapter prefers the workspace-scoped route returned from workspacePath", () => {
  const adapterContent = readAdapter();

  assert.match(adapterContent, /private _resolveWorkspaceUrl\(/);
  assert.match(adapterContent, /return opencodeConfig\.getWorkspaceUrl\(workspacePath\.trim\(\), port\);/);
  assert.match(adapterContent, /running\.workspacePath/);
  assert.match(adapterContent, /result\.workspacePath/);
});
