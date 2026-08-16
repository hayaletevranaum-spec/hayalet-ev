export type OverlayApp = "app" | "mcp-server" | "ghost-agent" | "android-companion";

export interface OverlayLogEntry {
  id: string;
  app: OverlayApp;
  sessionId: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  locale?: string;
  messageKey?: string;
  source: string;
  visibility?: number;
  correlationId?: string;
  context?: Record<string, unknown>;
}

export interface OverlayState {
  activeApp: OverlayApp;
  paused: boolean;
  baseLogsDir: string;
  entriesByApp: Record<OverlayApp, OverlayLogEntry[]>;
  sessionsByApp: Record<OverlayApp, string[]>;
  selectedSessionByApp: Record<OverlayApp, string>;
  lastFingerprintByApp: Record<OverlayApp, string>;
  selectedEntryId: string;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export function createInitialOverlayState(): OverlayState {
  return {
    activeApp: "app",
    paused: false,
    baseLogsDir: "",
    entriesByApp: {
      app: [],
      "mcp-server": [],
      "ghost-agent": [],
      "android-companion": [],
    },
    sessionsByApp: {
      app: [],
      "mcp-server": [],
      "ghost-agent": [],
      "android-companion": [],
    },
    selectedSessionByApp: {
      app: "",
      "mcp-server": "",
      "ghost-agent": "",
      "android-companion": "",
    },
    lastFingerprintByApp: {
      app: "",
      "mcp-server": "",
      "ghost-agent": "",
      "android-companion": "",
    },
    selectedEntryId: "",
    pollTimer: null,
  };
}

export function isOverlayApp(value: unknown): value is OverlayApp {
  return (
    value === "app" ||
    value === "mcp-server" ||
    value === "ghost-agent" ||
    value === "android-companion"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((part) => part !== "")
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/[\\/]+$/g, "");
      }
      return part.replace(/^[\\/]+|[\\/]+$/g, "");
    })
    .join("/");
}

export function decodeBase64ToUtf8(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function normalizeLogEntry(
  app: OverlayApp,
  fallbackSessionId: string,
  raw: Record<string, unknown>
): OverlayLogEntry | null {
  const rawTimestamp = asText(raw["timestamp"]);
  const fallbackTimestamp = asText(raw["isoTimestamp"]);
  const timestamp = rawTimestamp !== "" ? rawTimestamp : fallbackTimestamp;
  const message = asText(raw["message"]);

  if (timestamp === "" || message === "") {
    return null;
  }

  const rawLevel = asText(raw["level"]);
  const fallbackLevel = asText(raw["type"]);
  const levelRaw = rawLevel !== "" ? rawLevel : fallbackLevel;
  const level = levelRaw !== "" ? levelRaw.toLowerCase() : "info";
  const rawCategory = asText(raw["category"]);
  const category = rawCategory !== "" ? rawCategory : "system";
  const rawSource = asText(raw["source"]);
  const source = rawSource !== "" ? rawSource : app;
  const rawSessionId = asText(raw["sessionId"]);
  const sessionId = rawSessionId !== "" ? rawSessionId : fallbackSessionId;
  const correlationId = asText(raw["correlationId"]);
  const locale = asText(raw["locale"]);
  const messageKey = asText(raw["messageKey"]);

  const visibilityValue = raw["visibility"];
  const visibility = typeof visibilityValue === "number" ? visibilityValue : undefined;

  const context = asRecord(raw["context"]) ?? asRecord(raw["meta"]);
  const id = `${app}|${sessionId}|${timestamp}|${source}|${category}|${message}`;

  return {
    id,
    app,
    sessionId,
    timestamp,
    level,
    category,
    message,
    ...(locale !== "" ? { locale } : {}),
    ...(messageKey !== "" ? { messageKey } : {}),
    source,
    ...(visibility !== undefined ? { visibility } : {}),
    ...(correlationId !== "" ? { correlationId } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

export function appendEntries(
  state: OverlayState,
  app: OverlayApp,
  incoming: OverlayLogEntry[],
  maxLogs: number
): void {
  if (incoming.length === 0) {
    return;
  }

  const merged = [...incoming, ...state.entriesByApp[app]];
  const unique = new Map<string, OverlayLogEntry>();

  for (const entry of merged) {
    if (!unique.has(entry.id)) {
      unique.set(entry.id, entry);
    }
  }

  state.entriesByApp[app] = Array.from(unique.values())
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, maxLogs);
}
