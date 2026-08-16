import assert from "node:assert/strict";
import test from "node:test";

import { resolveWhereamiProviderContext } from "../lib/whereami-provider-context.mjs";

void test("classifies OpenCode CLI without serve as opencode terminal mode", () => {
  const result = resolveWhereamiProviderContext({
    currentPid: 300,
    resolvedMode: "app",
    probes: {
      opencodeServerRunning: false,
    },
    entries: [
      { pid: 300, ppid: 200, args: "node scripts/whereami.mjs" },
      { pid: 200, ppid: 100, args: "/bin/bash -lc npm run whereami" },
      { pid: 100, ppid: 1, args: "/usr/local/bin/opencode" },
    ],
  });

  assert.equal(result.effectiveMode, "opencode-terminal-mode");
  assert.equal(result.terminalOwner, "opencode");
  assert.equal(result.cliProvider, "opencode");
  assert.equal(result.opencodeCliActive, true);
});

void test("classifies non-OpenCode CLI without serve as other provider", () => {
  const result = resolveWhereamiProviderContext({
    currentPid: 300,
    resolvedMode: "app",
    probes: {
      opencodeServerRunning: false,
    },
    entries: [
      { pid: 300, ppid: 200, args: "node scripts/whereami.mjs" },
      { pid: 200, ppid: 100, args: "/bin/bash -lc npm run whereami" },
      { pid: 100, ppid: 1, args: "/home/test/.npm-global/bin/codex" },
    ],
  });

  assert.equal(result.effectiveMode, "other-provider-cli");
  assert.equal(result.terminalOwner, "other-provider");
  assert.equal(result.cliProvider, "codex");
  assert.equal(result.opencodeCliActive, false);
});

void test("keeps base mode when OpenCode serve is running", () => {
  const result = resolveWhereamiProviderContext({
    currentPid: 300,
    resolvedMode: "app",
    probes: {
      opencodeServerRunning: true,
    },
    entries: [
      { pid: 300, ppid: 200, args: "node scripts/whereami.mjs" },
      { pid: 200, ppid: 100, args: "/bin/bash -lc npm run whereami" },
      { pid: 100, ppid: 1, args: "/home/test/.npm-global/bin/codex" },
    ],
  });

  assert.equal(result.effectiveMode, "app");
  assert.equal(result.terminalOwner, "opencode-server");
  assert.equal(result.cliProvider, "codex");
  assert.equal(result.opencodeServerRunning, true);
});
