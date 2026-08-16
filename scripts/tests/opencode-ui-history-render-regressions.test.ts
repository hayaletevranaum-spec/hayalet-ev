import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldSkipAssistantMessage } from "../../src/js/pages/opencode-ui/chat-utils.ts";
import { buildMessageSnapshotToken } from "../../src/js/pages/opencode-ui/message-content.ts";

void test("opencode-ui history renderer uses a tool host when assistant text is empty", () => {
  const historyContent = readFileSync("src/js/pages/opencode-ui/history-actions.ts", "utf8");
  const appContent = readFileSync("src/js/pages/opencode-ui/app.ts", "utf8");

  assert.match(appContent, /function createHistoricAssistantToolHost\(\): HTMLElement \| null {/);
  assert.match(
    historyContent,
    /const toolTarget =\s*bubble\?\.parentElement instanceof HTMLElement\s*\?\s*bubble\.parentElement\s*:\s*toolCalls\.length > 0\s*\?\s*context\.createHistoricAssistantToolHost\(\)\s*:\s*null;/
  );
});

void test("opencode-ui history renderer binds todo panel to session detail", () => {
  const historyContent = readFileSync("src/js/pages/opencode-ui/history-actions.ts", "utf8");
  const appContent = readFileSync("src/js/pages/opencode-ui/app.ts", "utf8");

  assert.match(appContent, /function renderTodoPanel\(todos: OpencodeUiTodoItem\[\]\): void {/);
  assert.match(
    historyContent,
    /context\.renderTodoPanel\(Array\.isArray\(detail\.todos\) \? detail\.todos : \[\]\);/
  );
});

void test("opencode-ui history renderer binds files panel to session detail", () => {
  const historyContent = readFileSync("src/js/pages/opencode-ui/history-actions.ts", "utf8");
  const appContent = readFileSync("src/js/pages/opencode-ui/app.ts", "utf8");

  assert.match(appContent, /function renderFilesPanel\(files: string\[\], workspacePath: string\): void {/);
  assert.match(
    historyContent,
    /context\.renderFilesPanel\(\s*Array\.isArray\(detail\.changed_files\) \? detail\.changed_files : \[\],\s*detail\.workspace_path\s*\);/
  );
});

void test("opencode-ui live snapshot key tracks tool call changes", () => {
  const baseToken = buildMessageSnapshotToken({
    role: "assistant",
    text: "done",
    blocks: [],
    files: [],
    notices: [],
    toolCalls: [{ name: "bash", args: "pwd", result: "/workspace/project" }],
  });
  const withPreviewToken = buildMessageSnapshotToken({
    role: "assistant",
    text: "done",
    blocks: [],
    files: [
      {
        name: "error.png",
        fileName: "error.png",
        media_type: "image/png",
        previewUrl: "data:image/png;base64,abc",
      },
    ],
    notices: [],
    toolCalls: [{ name: "bash", args: "pwd", result: "/workspace/project" }],
  });
  const withNoticeToken = buildMessageSnapshotToken({
    role: "assistant",
    text: "done",
    blocks: [],
    files: [],
    notices: [{ tone: "warning", title: "retrying in 25s" }],
    toolCalls: [{ name: "bash", args: "pwd", result: "/workspace/project" }],
  });
  const withBlocksToken = buildMessageSnapshotToken({
    role: "assistant",
    text: "done",
    blocks: [{ kind: "reasoning", title: "Reasoning", text: "Check renderer contract" }],
    files: [],
    notices: [],
    toolCalls: [{ name: "bash", args: "pwd", result: "/workspace/project" }],
  });

  assert.notEqual(baseToken, withPreviewToken);
  assert.notEqual(baseToken, withNoticeToken);
  assert.notEqual(baseToken, withBlocksToken);
});

void test("chat utils skip rendering empty assistant bubbles only when no visual block remains", () => {
  assert.equal(
    shouldSkipAssistantMessage({
      text: "",
      blocks: [],
      files: [],
      notices: [],
      hasInteractiveRenderer: false,
    }),
    true
  );
  assert.equal(
    shouldSkipAssistantMessage({
      text: "",
      blocks: [],
      files: [{ name: "screenshot.png", media_type: "image/png" }],
      notices: [],
      hasInteractiveRenderer: false,
    }),
    false
  );
  assert.equal(
    shouldSkipAssistantMessage({
      text: "",
      blocks: [],
      files: [],
      notices: [{ tone: "error", title: "The usage limit has been reached" }],
      hasInteractiveRenderer: false,
    }),
    false
  );
  assert.equal(
    shouldSkipAssistantMessage({
      text: "",
      blocks: [{ kind: "reasoning", title: "Reasoning", text: "Inspect payload" }],
      files: [],
      notices: [],
      hasInteractiveRenderer: false,
    }),
    false
  );
  assert.equal(
    shouldSkipAssistantMessage({
      text: "",
      blocks: [],
      files: [],
      notices: [],
      hasInteractiveRenderer: true,
    }),
    false
  );
});
