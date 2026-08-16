import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_TEST_IMAGE_PROMPT,
  PROVIDER_TEST_PROMPT,
  runCommandScenario,
} from "../../electron/provider-tester/scenario-runner.ts";

function createCommand(options: {
  id: string;
  name: string;
  severity?: "core" | "soft" | "provider";
  delayAfterMs?: number;
  run: () => Promise<{
    status: "pass" | "fail" | "warning" | "skip";
    message: string;
  }>;
}) {
  return {
    id: options.id,
    name: options.name,
    action: options.id,
    severity: options.severity ?? "core",
    ...(options.delayAfterMs !== undefined ? { delayAfterMs: options.delayAfterMs } : {}),
    resolveRuns: () => [
      {
        stepId: options.id,
        stepName: options.name,
        action: options.id,
        run: async () => {
          const result = await options.run();
          return {
            ...result,
            result: {
              id: options.id,
              name: options.name,
              category: "advanced" as const,
              status: result.status,
              message: result.message,
              duration: 0,
              timestamp: Date.now(),
            },
          };
        },
      },
    ],
  };
}

void test("command scenario emits ordered progress events and keeps soft failures non-fatal", async () => {
  const progress: string[] = [];
  const scenarioIds = new Set<string>();
  const executed: string[] = [];

  const result = await runCommandScenario({
    runId: "run-soft-pass",
    scenarioId: "webview-test",
    slot: "ai1",
    providerId: "chatgpt",
    commandStartDelayMs: 0,
    emitProgress: (event) => {
      scenarioIds.add(event.scenarioId);
      progress.push(`${event.type}:${event.commandId ?? "suite"}:${event.status ?? "na"}`);
    },
    commands: [
      createCommand({
        id: "reset-default-page",
        name: "Reset Default Page",
        run: async () => {
          executed.push("reset-default-page");
          return { status: "pass", message: "default page loaded" };
        },
      }),
      createCommand({
        id: "attach-file",
        name: "Attach File",
        severity: "soft",
        run: async () => {
          executed.push("attach-file");
          return { status: "warning", message: "attach unsupported" };
        },
      }),
      createCommand({
        id: "final-bubbles",
        name: "Final Bubbles",
        run: async () => {
          executed.push("final-bubbles");
          return { status: "pass", message: "bubbles present" };
        },
      }),
    ],
  });

  assert.deepEqual(executed, ["reset-default-page", "attach-file", "final-bubbles"]);
  assert.equal(result.aborted, false);
  assert.equal(result.failed, 0);
  assert.equal(result.warnings, 1);
  assert.equal(result.scenarioId, "webview-test");
  assert.deepEqual([...scenarioIds], ["webview-test"]);
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.status]),
    [
      ["reset-default-page", "pass"],
      ["attach-file", "warning"],
      ["final-bubbles", "pass"],
    ]
  );
  assert.deepEqual(progress, [
    "started:suite:na",
    "command-start:reset-default-page:running",
    "command-complete:reset-default-page:pass",
    "command-start:attach-file:running",
    "command-complete:attach-file:warning",
    "command-start:final-bubbles:running",
    "command-complete:final-bubbles:pass",
    "completed:suite:na",
  ]);
});

void test("command scenario runner emits scenario metadata for non-test scenarios", async () => {
  const progress: string[] = [];

  const result = await runCommandScenario({
    runId: "run-webview-sync",
    scenarioId: "webview-sync",
    slot: "ai2",
    providerId: "grok",
    commandStartDelayMs: 0,
    emitProgress: (event) => {
      progress.push(`${event.scenarioId}:${event.type}:${event.commandId ?? "suite"}`);
    },
    commands: [
      createCommand({
        id: "collect-urls",
        name: "Collect Urls",
        run: async () => ({ status: "pass" as const, message: "collected" }),
      }),
    ],
  });

  assert.equal(result.scenarioId, "webview-sync");
  assert.equal(result.aborted, false);
  assert.equal(result.commands.length, 1);
  assert.deepEqual(progress, [
    "webview-sync:started:suite",
    "webview-sync:command-start:collect-urls",
    "webview-sync:command-complete:collect-urls",
    "webview-sync:completed:suite",
  ]);
});

void test("command scenario waits before each command when a pre-delay is configured", async () => {
  const startedAt: number[] = [];

  await runCommandScenario({
    runId: "run-command-delays",
    scenarioId: "webview-sync",
    slot: "ai1",
    providerId: "chatgpt",
    commandStartDelayMs: 25,
    commands: [
      createCommand({
        id: "first-command",
        name: "First Command",
        run: async () => {
          startedAt.push(Date.now());
          return { status: "pass", message: "first ok" };
        },
      }),
      createCommand({
        id: "second-command",
        name: "Second Command",
        run: async () => {
          startedAt.push(Date.now());
          return { status: "pass", message: "second ok" };
        },
      }),
    ],
  });

  assert.equal(startedAt.length, 2);
  const t0 = startedAt[0];
  const t1 = startedAt[1];
  assert.ok(t0 != null && t1 != null);
  assert.ok(
    t1 - t0 >= 25,
    `Expected at least 25ms command pre-delay, got ${t1 - t0}ms`
  );
});

void test("command scenario aborts remaining commands after core failure", async () => {
  const executed: string[] = [];

  const result = await runCommandScenario({
    runId: "run-core-fail",
    scenarioId: "webview-test",
    slot: "ai0",
    providerId: "opencode-ui",
    commandStartDelayMs: 0,
    commands: [
      createCommand({
        id: "disabled-send",
        name: "Disabled Send",
        run: async () => {
          executed.push("disabled-send");
          return { status: "fail", message: "send should be disabled" };
        },
      }),
      createCommand({
        id: "final-bubbles",
        name: "Final Bubbles",
        run: async () => {
          executed.push("final-bubbles");
          return { status: "pass", message: "should not run" };
        },
      }),
    ],
  });

  assert.deepEqual(executed, ["disabled-send"]);
  assert.equal(result.aborted, true);
  assert.equal(result.abortReason, "send should be disabled");
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.status]),
    [["disabled-send", "fail"]]
  );
});

void test("command scenario marks the active command as warning when stopped by user", async () => {
  const abortController = new AbortController();
  const executed: string[] = [];

  const resultPromise = runCommandScenario({
    runId: "run-user-stop",
    scenarioId: "webview-test",
    slot: "ai2",
    providerId: "grok",
    commandStartDelayMs: 0,
    signal: abortController.signal,
    commands: [
      createCommand({
        id: "long-command",
        name: "Long Command",
        run: async () => {
          executed.push("long-command");
          await new Promise<void>((resolve) => setTimeout(resolve, 30));
          return { status: "pass", message: "should be interrupted" };
        },
      }),
      createCommand({
        id: "never-runs",
        name: "Never Runs",
        run: async () => {
          executed.push("never-runs");
          return { status: "pass", message: "unexpected" };
        },
      }),
    ],
  });

  setTimeout(() => { abortController.abort(); }, 5);
  const result = await resultPromise;

  assert.deepEqual(executed, ["long-command"]);
  assert.equal(result.aborted, true);
  assert.equal(result.abortReason, "Scenario stopped by user");
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.status]),
    [["long-command", "warning"]]
  );
});

void test("provider test prompt stays deterministic for scroll and scrape assertions", () => {
  assert.equal(
    PROVIDER_TEST_PROMPT,
    "1'den 20'ye kadar numaralari yaz. Her satirda yalnizca bir sayi olsun. Baska aciklama ekleme."
  );
  assert.equal(
    PROVIDER_TEST_IMAGE_PROMPT,
    "3:2 oranli, beyaz fonda tek bir kirmizi elma gorseli uret. Metin ekleme."
  );
});

void test("command scenario uses the default one-second start delay when not overridden", async () => {
  const startedAt: number[] = [];

  await runCommandScenario({
    runId: "run-default-delay",
    scenarioId: "webview-test",
    slot: "ai2",
    providerId: "grok",
    commands: [
      createCommand({
        id: "first",
        name: "First",
        delayAfterMs: 0,
        run: async () => {
          startedAt.push(Date.now());
          return { status: "pass", message: "first ok" };
        },
      }),
      createCommand({
        id: "second",
        name: "Second",
        run: async () => {
          startedAt.push(Date.now());
          return { status: "pass", message: "second ok" };
        },
      }),
    ],
  });

  assert.equal(startedAt.length, 2);
  const t0 = startedAt[0];
  const t1 = startedAt[1];
  assert.ok(t0 != null && t1 != null);
  assert.ok(
    t1 - t0 >= 1000,
    `Expected at least 1000ms default command start delay, got ${t1 - t0}ms`
  );
});
