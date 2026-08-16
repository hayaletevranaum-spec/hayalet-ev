import assert from "node:assert/strict";
import test from "node:test";

import { executeHandlerWithLogging } from "../../mcp-server/core/handlers.ts";

void test("executeHandlerWithLogging logs start and success", async () => {
  const events: string[] = [];

  const result = await executeHandlerWithLogging(
    "demo_tool",
    { x: 1 },
    () => ({ ok: true }),
    {
      logToolCall: (name, args) => {
        events.push(`start:${name}:${String((args as { x: number }).x)}`);
        return { startTime: 100 };
      },
      logToolSuccess: (name) => {
        events.push(`success:${name}`);
      },
      logToolError: () => {
        events.push("error");
      },
      now: () => 150,
    }
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, ["start:demo_tool:1", "success:demo_tool"]);
});

void test("executeHandlerWithLogging logs error and rethrows", async () => {
  const events: string[] = [];

  await assert.rejects(
    async () =>
      await executeHandlerWithLogging(
        "demo_tool",
        { x: 1 },
        () => {
          throw new Error("boom");
        },
        {
          logToolCall: () => {
            events.push("start");
            return { startTime: 100 };
          },
          logToolSuccess: () => {
            events.push("success");
          },
          logToolError: () => {
            events.push("error");
          },
          now: () => 160,
        }
      ),
    /boom/
  );

  assert.deepEqual(events, ["start", "error"]);
});
