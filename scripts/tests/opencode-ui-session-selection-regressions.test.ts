import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeSessionSelection,
  type BootstrapContext,
} from "../../src/js/pages/opencode-ui/bootstrap-actions.ts";
import type { OpencodeUiSessionSummary } from "../../src/js/pages/opencode-ui/types.ts";

function createSession(id: string, updatedAt: number): OpencodeUiSessionSummary {
  return {
    id,
    title: id,
    workspace_path: "/workspace/project",
    updated_at: updatedAt,
    created_at: updatedAt,
    archived_at: null,
  };
}

function createContext(options: {
  sessions: OpencodeUiSessionSummary[];
  activeSessionId?: string | null;
  createdSessionId?: string;
}): BootstrapContext & {
  createServerSessionCalls: string[];
  setActiveSessionCalls: Array<string | null>;
  loadSessionListCalls: number;
  loadHistoryCalls: number;
} {
  const createdSessionId = options.createdSessionId ?? "session-created";
  const createServerSessionCalls: string[] = [];
  const setActiveSessionCalls: Array<string | null> = [];
  let loadSessionListCalls = 0;
  let loadHistoryCalls = 0;

  return {
    runtime: {
      activeSessionId: options.activeSessionId ?? null,
      sessionTab: "archived",
    } as BootstrapContext["runtime"],
    byId: () => null,
    getSessionsForTab: (sessions) => sessions.filter((session) => session.archived_at == null),
    listSessionsFromDisk: async () => options.sessions,
    createServerSession: async (title?: string) => {
      createServerSessionCalls.push(title ?? "");
      return createdSessionId;
    },
    setActiveSession: async (sessionId) => {
      setActiveSessionCalls.push(sessionId);
    },
    loadSessionListAndRender: async () => {
      loadSessionListCalls += 1;
    },
    loadActiveSessionHistory: async () => {
      loadHistoryCalls += 1;
    },
    checkHealth: async () => ({ mcpServers: {} }),
    loadStatusContext: async () => {},
    loadToolsFinalSnapshot: async () => ({ status: "loaded", toolIds: [] }),
    syncActiveSessionHistoryIfUpdated: async () => {},
    get createServerSessionCalls() {
      return createServerSessionCalls;
    },
    get setActiveSessionCalls() {
      return setActiveSessionCalls;
    },
    get loadSessionListCalls() {
      return loadSessionListCalls;
    },
    get loadHistoryCalls() {
      return loadHistoryCalls;
    },
  };
}

void test("opencode-ui session selection opens a new session when resume mode is new", async () => {
  const context = createContext({
    sessions: [createSession("session-latest", 20), createSession("session-older", 10)],
    activeSessionId: "session-latest",
  });

  await initializeSessionSelection(context, "session-latest", "new");

  assert.equal(context.runtime.sessionTab, "active");
  assert.equal(context.createServerSessionCalls.length, 1);
  assert.deepEqual(context.setActiveSessionCalls, ["session-created"]);
  assert.equal(context.loadSessionListCalls, 1);
  assert.equal(context.loadHistoryCalls, 1);
});

void test("opencode-ui session selection falls back to shared active session when explicit resume id is stale", async () => {
  const context = createContext({
    sessions: [createSession("session-latest", 20), createSession("session-shared", 10)],
    activeSessionId: "session-shared",
  });

  await initializeSessionSelection(context, "session-stale", "last");

  assert.equal(context.createServerSessionCalls.length, 0);
  assert.deepEqual(context.setActiveSessionCalls, ["session-shared"]);
  assert.equal(context.loadSessionListCalls, 1);
  assert.equal(context.loadHistoryCalls, 1);
});
