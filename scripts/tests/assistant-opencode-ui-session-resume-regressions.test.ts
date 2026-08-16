import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistantIndexPath = "src/js/pages/assistant/assistant.ts";
const assistantBindingsPath = "src/js/pages/assistant/webview-bindings.ts";

function readAssistantIndex(): string {
  return readFileSync(assistantIndexPath, "utf8");
}

function readAssistantBindings(): string {
  return readFileSync(assistantBindingsPath, "utf8");
}

void test("assistant listens opencode-ui session change event and persists last session id", () => {
  const bindingsContent = readAssistantBindings();
  const indexContent = readAssistantIndex();

  assert.match(bindingsContent, /event\.channel === "opencode-ui-session-changed"/);
  assert.match(bindingsContent, /onOpencodeSessionChanged\(sessionId\)/);
  assert.match(indexContent, /_saveLastOpencodeUiSessionId\(sessionId\)/);
  assert.match(
    indexContent,
    /SettingsManager\.set\("assistants\.lastOpencodeUiSessionId", sessionId\)/
  );
});

void test("opencode-ui connect url resolver injects resumeSessionId from settings", () => {
  const content = readAssistantIndex();

  assert.match(content, /providerId === "opencode-ui"/);
  assert.match(content, /assistants\?\.lastOpencodeUiSessionId/);
  assert.match(content, /parsed\.searchParams\.set\("resumeMode", this\._isResumeEnabled\(options\) \? "last" : "new"\)/);
  assert.match(content, /parsed\.searchParams\.set\("resumeSessionId", resumeSessionId\)/);
});

void test("opencode-ui connect url resolver injects active theme and assistant syncs live theme updates", () => {
  const content = readAssistantIndex();

  assert.match(content, /parsed\.searchParams\.set\("theme", ThemeManager\.current\)/);
  assert.match(content, /ThemeManager\.onChange\(\(theme\) =>/);
  assert.match(content, /buildInlineThemeSyncScript/);
  assert.match(content, /isOpencodeUiThemeHost/);
});

void test("opencode-ui connect url resolver converts packaged file routes into absolute page URLs", () => {
  const content = readAssistantIndex();

  assert.match(content, /window\.location\.protocol === "file:" && baseUrl\.startsWith\("\/"\)/);
  assert.match(content, /new URL\("\.", window\.location\.href\)/);
  assert.match(content, /if \(isPackagedFileRoute\) \{\s*return parsed\.toString\(\);/s);
});

void test("opencode connect url resolver ignores stale root resume urls when adapter returns a workspace route", () => {
  const content = readAssistantIndex();

  assert.match(content, /providerId === "opencode"/);
  assert.match(content, /const normalizedSavedPath = savedParsed\.pathname\.replace\(\/\\\/\+\$\/u, ""\);/);
  assert.match(content, /const normalizedBasePath = baseParsed\.pathname\.replace\(\/\\\/\+\$\/u, ""\);/);
  assert.match(content, /const savedPath = normalizedSavedPath === "" \? "\/" : normalizedSavedPath;/);
  assert.match(content, /const basePath = normalizedBasePath === "" \? "\/" : normalizedBasePath;/);
  assert.match(content, /savedParsed\.origin === baseParsed\.origin && savedPath === "\/" && basePath !== "\/"/);
});
