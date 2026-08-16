const KNOWN_CLI_PROVIDERS = Object.freeze([
  {
    id: "opencode",
    label: "OpenCode",
    patterns: [/(^|[/\s])opencode([/\s]|$)/i],
  },
  {
    id: "codex",
    label: "Codex",
    patterns: [/@openai\/codex/i, /(^|[/\s])codex([/\s]|$)/i],
  },
  {
    id: "claude",
    label: "Claude",
    patterns: [/(^|[/\s])claude(?:-code)?([/\s]|$)/i],
  },
  {
    id: "gemini",
    label: "Gemini",
    patterns: [/(^|[/\s])gemini(?:-cli)?([/\s]|$)/i],
  },
  {
    id: "aider",
    label: "Aider",
    patterns: [/(^|[/\s])aider([/\s]|$)/i],
  },
  {
    id: "cursor",
    label: "Cursor",
    patterns: [/(^|[/\s])cursor([/\s]|$)/i],
  },
  {
    id: "qwen",
    label: "Qwen",
    patterns: [/(^|[/\s])qwen([/\s]|$)/i],
  },
  {
    id: "roo",
    label: "Roo",
    patterns: [/(^|[/\s])roo([/\s]|$)/i],
  },
]);

function normalizeEntry(entry) {
  if (entry === null || typeof entry !== "object") return null;
  const pid = Number.parseInt(String(entry.pid ?? ""), 10);
  const ppid = Number.parseInt(String(entry.ppid ?? ""), 10);
  const args = typeof entry.args === "string" ? entry.args.trim() : "";
  if (!Number.isFinite(pid) || !Number.isFinite(ppid) || args === "") {
    return null;
  }

  return {
    pid,
    ppid,
    args,
  };
}

function buildEntryMap(entries) {
  const map = new Map();
  for (const rawEntry of entries ?? []) {
    const entry = normalizeEntry(rawEntry);
    if (entry !== null) {
      map.set(entry.pid, entry);
    }
  }
  return map;
}

export function collectAncestorChain(entries, startPid) {
  const entryMap = buildEntryMap(entries);
  const chain = [];
  const visited = new Set();
  let currentPid = Number.isFinite(startPid) ? startPid : null;

  while (currentPid !== null && currentPid > 0 && !visited.has(currentPid)) {
    visited.add(currentPid);
    const entry = entryMap.get(currentPid);
    if (entry === undefined) {
      break;
    }
    chain.push(entry);
    currentPid = entry.ppid;
  }

  return chain;
}

export function detectCliProviderFromArgs(args) {
  if (typeof args !== "string" || args.trim() === "") {
    return null;
  }

  for (const provider of KNOWN_CLI_PROVIDERS) {
    if (provider.patterns.some((pattern) => pattern.test(args))) {
      return {
        id: provider.id,
        label: provider.label,
      };
    }
  }

  return null;
}

export function resolveWhereamiProviderContext({
  entries,
  currentPid,
  resolvedMode,
  probes,
}) {
  const chain = collectAncestorChain(entries, currentPid);
  const ancestors = chain.slice(1);

  let cliMatch = null;
  let matchedEntry = null;
  for (const entry of ancestors) {
    const provider = detectCliProviderFromArgs(entry.args);
    if (provider !== null) {
      cliMatch = provider;
      matchedEntry = entry;
      break;
    }
  }

  const opencodeServerRunning = probes?.opencodeServerRunning === true;
  const opencodeCliActive = cliMatch?.id === "opencode";
  const baseMode = typeof resolvedMode === "string" ? resolvedMode : "terminal";
  const canOverrideMode = baseMode === "terminal" || baseMode === "app";

  let effectiveMode = baseMode;
  let terminalOwner = "none";
  let reason = `No provider CLI override detected; base mode remains ${baseMode}.`;

  if (canOverrideMode && !opencodeServerRunning && opencodeCliActive) {
    effectiveMode = "opencode-terminal-mode";
    terminalOwner = "opencode";
    reason = "OpenCode CLI is the active terminal owner and no OpenCode serve process was detected.";
  } else if (canOverrideMode && !opencodeServerRunning && cliMatch !== null) {
    effectiveMode = "other-provider-cli";
    terminalOwner = "other-provider";
    reason = `${cliMatch.label} CLI is the active terminal owner and no OpenCode serve process was detected.`;
  } else if (canOverrideMode && opencodeServerRunning) {
    terminalOwner = "opencode-server";
    reason = "OpenCode serve process is active; keeping the base application mode.";
  }

  return {
    effectiveMode,
    terminalOwner,
    cliProvider: cliMatch?.id ?? null,
    cliProviderLabel: cliMatch?.label ?? null,
    cliProviderPid: matchedEntry?.pid ?? null,
    opencodeCliActive,
    opencodeServerRunning,
    reason,
  };
}
