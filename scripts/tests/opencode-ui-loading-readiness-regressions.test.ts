import assert from "node:assert/strict";
import test from "node:test";

type StageEvent = { channel: string; payload: { title: string; subtitle: string } };
type ReadyEvent = {
  channel: string;
  payload: { ready: boolean; unresolvedServers: string[]; mcpChecks: number; toolCount: number };
};

void test("opencode-ui emits stage progression and ready=true only after settled mcp and final tool snapshot", async () => {
  const { runOpencodeUiBootstrapPipeline } =
    await import("../../src/js/pages/opencode-ui/bootstrap-actions.ts");

  const stageEvents: StageEvent[] = [];
  const readyEvents: ReadyEvent[] = [];
  const callOrder: string[] = [];

  await runOpencodeUiBootstrapPipeline({
    deps: {
      checkHealth: async () => {
        callOrder.push("health");
        return { mcpServers: {} };
      },
      loadStatusContext: async () => {
        callOrder.push("status");
      },
      waitForMcpServersSettled: async () => {
        callOrder.push("mcp");
        return { ready: true, checks: 3, unresolvedServers: [] };
      },
      loadToolsFinalSnapshot: async () => {
        callOrder.push("tools-final");
        return { status: "loaded", toolIds: ["foo", "bar"] };
      },
    },
    emitStage: (title, subtitle) => {
      stageEvents.push({ channel: "opencode-ui-connect-stage", payload: { title, subtitle } });
    },
    emitToolsReady: (payload) => {
      readyEvents.push({ channel: "opencode-ui-tools-ready", payload });
    },
  });

  assert.deepEqual(callOrder, ["health", "status", "mcp", "tools-final"]);
  assert.equal(stageEvents.length >= 3, true);
  assert.equal(readyEvents.length, 1);
  assert.equal(readyEvents[0]?.channel, "opencode-ui-tools-ready");
  assert.deepEqual(readyEvents[0]?.payload, {
    ready: true,
    unresolvedServers: [],
    mcpChecks: 3,
    toolCount: 2,
  });
});

void test("opencode-ui keeps UI unlocked when mcp settle times out", async () => {
  const { runOpencodeUiBootstrapPipeline } =
    await import("../../src/js/pages/opencode-ui/bootstrap-actions.ts");

  const readyEvents: Array<{
    ready: boolean;
    unresolvedServers: string[];
    mcpChecks: number;
    toolCount: number;
  }> = [];

  await runOpencodeUiBootstrapPipeline({
    deps: {
      checkHealth: async () => ({ mcpServers: {} }),
      loadStatusContext: async () => {},
      waitForMcpServersSettled: async () => ({
        ready: false,
        checks: 5,
        unresolvedServers: ["context7", "websearch"],
      }),
      loadToolsFinalSnapshot: async () => ({
        status: "loaded",
        toolIds: ["ignored"],
      }),
    },
    emitStage: () => {},
    emitToolsReady: (payload) => {
      readyEvents.push(payload);
    },
  });

  assert.deepEqual(readyEvents, [
    {
      ready: true,
      unresolvedServers: ["context7", "websearch"],
      mcpChecks: 5,
      toolCount: 1,
    },
  ]);
});

void test("tools snapshot loader uses ids endpoint and falls back to tool listing endpoint", async () => {
  const { loadToolsFinalSnapshot } =
    await import("../../src/js/pages/opencode-ui/tools-prompts.ts");

  const calls: string[] = [];

  const result = await loadToolsFinalSnapshot(async (path) => {
    calls.push(path);
    if (path === "/experimental/tool/ids") {
      throw new Error("not available");
    }
    if (path === "/experimental/tool") {
      return {
        tools: [{ id: "app_hev_mcp_health" }, { id: "context7_query-docs" }],
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  });

  assert.deepEqual(calls, ["/experimental/tool/ids", "/experimental/tool"]);
  assert.equal(result.status, "loaded");
  assert.deepEqual(result.toolIds, ["app_hev_mcp_health", "context7_query-docs"]);
});

void test("tools snapshot loader derives Hayalet Ev MCP tools from OpenCode server ids only", async () => {
  const { loadToolsFinalSnapshot } =
    await import("../../src/js/pages/opencode-ui/tools-prompts.ts");
  const { splitOpenCodeServerToolIds } =
    await import("../../src/js/pages/opencode-ui/tool-catalog.ts");
  const globalWithWindow = globalThis as { window?: unknown };
  const previousWindow = globalWithWindow.window;
  let localMetadataProbeCount = 0;

  globalWithWindow.window = {
    electronAPI: {
      opencodeUiHevTools: () => {
        localMetadataProbeCount += 1;
        return { success: true, toolNames: ["stale_local_tool"] };
      },
    },
  };

  try {
    const result = await loadToolsFinalSnapshot(async (path) => {
      assert.equal(path, "/experimental/tool/ids");
      return ["app_hev_mcp_health", "app_hev_list_tools", "context7_query-docs"];
    });

    assert.equal(localMetadataProbeCount, 0);
    assert.equal(result.status, "loaded");
    assert.deepEqual(result.toolIds, [
      "app_hev_mcp_health",
      "app_hev_list_tools",
      "context7_query-docs",
    ]);
    assert.deepEqual(splitOpenCodeServerToolIds(result.toolIds), {
      openCodeToolIds: ["context7_query-docs"],
      hevToolIds: ["app_hev_mcp_health", "app_hev_list_tools"],
    });
  } finally {
    if (previousWindow === undefined) {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = previousWindow;
    }
  }
});
