import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getSessionSummary, readElectronLogs } from "../../mcp-server/tools/log-tools.ts";

void test("readElectronLogs structured level filter matches level field", async () => {
  const root = await mkdtemp(join(tmpdir(), "app-log-tools-"));

  try {
    const sessionDir = join(root, "logs", "app", "s1");
    await mkdir(sessionDir, { recursive: true });

    await writeFile(
      join(sessionDir, "structured.jsonl"),
      `${JSON.stringify({ timestamp: "2026-03-04T00:00:00.000Z", level: "error", source: "MAIN", message: "boom" })}\n`,
      "utf-8"
    );

    const result = await readElectronLogs(join(root, "logs", "app"), {
      app: "app",
      type: "structured",
      level: "error",
      sessionId: "s1",
    });

    const text = String(result.content[0]?.text ?? "");
    assert.equal(result.isError, undefined);
    assert.match(text, /boom/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("getSessionSummary returns fallback summary for mcp default session", async () => {
  const root = await mkdtemp(join(tmpdir(), "app-log-tools-"));

  try {
    const sessionDir = join(root, "logs", "mcp-server", "default");
    await mkdir(sessionDir, { recursive: true });

    const lines = [
      JSON.stringify({
        timestamp: "2026-03-04T00:00:00.000Z",
        level: "info",
        source: "mcp-server",
      }),
      JSON.stringify({
        timestamp: "2026-03-04T00:00:01.000Z",
        level: "error",
        source: "mcp-server",
      }),
    ].join("\n");

    await writeFile(join(sessionDir, "structured.jsonl"), `${lines}\n`, "utf-8");

    const result = await getSessionSummary(join(root, "logs", "mcp-server"), {
      app: "mcp-server",
      sessionId: "default",
    });

    const text = String(result.content[0]?.text ?? "");
    assert.equal(result.isError, undefined);
    assert.match(text, /Session Özeti: default/);
    assert.match(text, /Toplam Log: 2/);
    assert.match(text, /Hatalar: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("getSessionSummary returns incomplete summary when mcp default has no summary sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "app-log-tools-"));

  try {
    const sessionDir = join(root, "logs", "mcp-server", "default");
    await mkdir(sessionDir, { recursive: true });

    const result = await getSessionSummary(join(root, "logs", "mcp-server"), {
      app: "mcp-server",
      sessionId: "default",
    });

    const text = String(result.content[0]?.text ?? "");
    assert.equal(result.isError, undefined);
    assert.match(text, /Session Özeti: default/);
    assert.match(text, /Durum: (incomplete|tamamlanmadı)/);
    assert.match(text, /Toplam Log: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
