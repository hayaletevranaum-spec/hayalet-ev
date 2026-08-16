import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("ghost agent preload exposes server-based IPC methods", () => {
  const preloadContent = readFileSync("ghost-agent/electron/preload.cjs", "utf8");

  assert.match(preloadContent, /ghostServerStatus/);
  assert.match(preloadContent, /ghostServerConnect/);
  assert.match(preloadContent, /ghostServerStop/);
  assert.doesNotMatch(preloadContent, /ghostProviderConnect/);
});

void test("ghost agent main registers server-based channels only", () => {
  const mainContent = readFileSync("ghost-agent/electron/main.ts", "utf8");

  assert.match(mainContent, /"ghost-server-status"/);
  assert.match(mainContent, /"ghost-server-connect"/);
  assert.match(mainContent, /"ghost-server-stop"/);
  assert.doesNotMatch(mainContent, /"ghost-provider-connect"/);
});

void test("ghost agent renderer removes provider selection UI and uses server bridge", () => {
  const htmlContent = readFileSync("ghost-agent/src/renderer/index.html", "utf8");
  const rendererContent = readFileSync("ghost-agent/src/renderer/index.ts", "utf8");

  assert.doesNotMatch(htmlContent, /ghost-provider-select/);
  assert.match(rendererContent, /ghostServerStatus/);
  assert.match(rendererContent, /ghostServerConnect/);
  assert.match(rendererContent, /ghostServerStop/);
  assert.doesNotMatch(rendererContent, /ghostProviderConnect/);
});
