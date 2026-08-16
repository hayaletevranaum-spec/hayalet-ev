import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(filePath: string): string {
  return readFileSync(resolve(root, filePath), "utf-8");
}

void test("index does not include temporary test page button", () => {
  const indexHtml = read("src/index.html");
  assert.doesNotMatch(indexHtml, /data-page="test"/);
});

void test("page-init does not wire temporary test page assets", () => {
  const pageInit = read("src/js/app/page-init.ts");

  assert.doesNotMatch(pageInit, /pages\/test\.js/);
  assert.doesNotMatch(pageInit, /pages\/test\.html\?raw/);
  assert.doesNotMatch(pageInit, /controllers\["test"\]/);
});

void test("navigation allows assistant page to activate side-nav item", () => {
  const indexHtml = read("src/index.html");
  const assistantPage = read("src/pages/assistant.html");
  const entrancePage = read("src/pages/entrance.html");
  const navigation = read("src/js/app/navigation.ts");

  assert.match(indexHtml, /data-page="assistant"/);
  assert.match(indexHtml, /data-ui-mode-option="ghost-agent"/);
  assert.match(assistantPage, /id="page-assistant"/);
  assert.match(entrancePage, /id="page-entrance"/);
  assert.match(navigation, /const SPECIAL_PAGES = \["webview"\];/);
  assert.match(navigation, /createGhostHandoffRuntimePatch/);
  assert.match(navigation, /updateAssistantRuntimeState/);
  assert.doesNotMatch(navigation, /LEGACY_ASSISTANT_PAGE/);
  assert.match(navigation, /function resolvePageDomNames\(pageName: string\)/);
  assert.match(navigation, /return \[pageName\];/);
  assert.match(navigation, /function matchesPageDataset/);
  assert.doesNotMatch(navigation, /assistant-btn/);
});
