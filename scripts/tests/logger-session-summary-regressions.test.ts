import assert from "node:assert/strict";
import test from "node:test";

import type { LogEntry } from "@shared/index.js";
import { buildSessionStats } from "../../electron/logger/core/session-stats.ts";

void test("buildSessionStats aggregates totals by level and category", () => {
  const stats = buildSessionStats([
    { level: "info" as LogEntry["level"], category: "system" },
    { level: "warning" as LogEntry["level"], category: "system" },
    { level: "error" as LogEntry["level"], category: "slot" },
    { level: "info" as LogEntry["level"], category: "slot" },
  ]);

  assert.equal(stats.totalLogs, 4);
  assert.equal(stats.byLevel["info"], 2);
  assert.equal(stats.byLevel["warning"], 1);
  assert.equal(stats.byLevel["error"], 1);
  assert.equal(stats.byCategory["system"], 2);
  assert.equal(stats.byCategory["slot"], 2);
  assert.equal(stats.errorCount, 1);
  assert.equal(stats.warningCount, 1);
});
