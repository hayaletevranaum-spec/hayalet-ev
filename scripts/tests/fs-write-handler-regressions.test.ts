import assert from "node:assert/strict";
import test from "node:test";

import { createFilesystemBasicTools } from "../../mcp-server/core/handlers/filesystem/basic-tools.ts";

function getWriteHandler(): (args: unknown) => Promise<unknown> {
  const tool = createFilesystemBasicTools().find(
    (entry) => (entry as { definition: { name: string } }).definition.name === "hev_fs_write"
  );
  assert.ok(tool, "hev_fs_write tool not found");
  return tool.handler as unknown as (args: unknown) => Promise<unknown>;
}

void test("hev_fs_write returns deterministic error when content is missing", async () => {
  const handler = getWriteHandler();

  const result = (await handler({ file_path: "/tmp/hev-missing-content.txt" })) as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };

  assert.equal(result.isError, true);
  assert.match(String(result.content?.[0]?.text ?? ""), /content.*string/i);
});

void test("hev_fs_write returns deterministic error when content is non-string", async () => {
  const handler = getWriteHandler();

  const result = (await handler({
    file_path: "/tmp/hev-non-string-content.txt",
    content: 42,
  })) as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };

  assert.equal(result.isError, true);
  assert.match(String(result.content?.[0]?.text ?? ""), /content.*string/i);
});
