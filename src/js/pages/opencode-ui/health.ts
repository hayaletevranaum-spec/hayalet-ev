import { apiCall } from "./api.js";
import { t } from "./i18n.js";
import { loadOpenCodeServerToolSnapshot } from "./tool-catalog.js";

export type McpStatusMap = Record<string, unknown>;

interface GlobalHealthResponse {
  healthy?: boolean;
  version?: string;
  [key: string]: unknown;
}

interface PathResponse {
  path?: string;
  directory?: string;
  worktree?: string;
}

interface OpencodeConfigResponse {
  plugin?: unknown;
  plugins?: unknown;
  [key: string]: unknown;
}

const TRANSITIONAL_MCP_STATUSES = new Set([
  "",
  "starting",
  "initializing",
  "restarting",
  "connecting",
  "pending",
]);

const MANUAL_MCP_SERVER_NAMES = new Set(["app"]);
const MCP_TOGGLE_PENDING = new Set<string>();
let workspacePathForManualMcp = "";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractMcpStatus(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim().toLowerCase();
  }

  if (raw !== null && raw !== undefined && typeof raw === "object") {
    const directStatus = (raw as { status?: unknown }).status;
    if (typeof directStatus === "string") {
      return directStatus.trim().toLowerCase();
    }
  }

  return "";
}

function getMcpStatusBadge(status: string): {
  label: string;
  badgeType: "success" | "warning" | "error";
} {
  switch (status) {
    case "connected":
    case "ready":
      return { label: t("health.statusActive"), badgeType: "success" };
    case "starting":
    case "initializing":
    case "connecting":
    case "restarting":
    case "pending":
      return { label: t("health.statusStarting"), badgeType: "warning" };
    case "disconnected":
      return { label: t("health.statusDisconnected"), badgeType: "error" };
    case "error":
    case "failed":
      return { label: t("health.statusError"), badgeType: "error" };
    default:
      return { label: t("health.statusUnknown"), badgeType: "warning" };
  }
}

async function loadHevToolCountFromOpenCodeServer(): Promise<number | null> {
  const snapshot = await loadOpenCodeServerToolSnapshot(async (path) => {
    return await apiCall<unknown>("GET", path);
  });

  return snapshot.status === "error" ? null : snapshot.hevToolIds.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
  );
}

function normalizeStateLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "healthy":
    case "ready":
    case "connected":
    case "active":
    case "ok":
      return t("health.statusActive");
    case "starting":
    case "initializing":
    case "connecting":
    case "restarting":
    case "pending":
      return t("health.statusStarting");
    case "error":
    case "failed":
    case "unhealthy":
      return t("health.statusError");
    case "disabled":
    case "inactive":
    case "off":
      return t("health.statusClosed");
    default:
      return value;
  }
}

function formatSummaryCount(value: number, unit: string): string {
  return `${String(value)} ${unit}`;
}

function summarizeStatusValue(raw: unknown, unit: string): string | null {
  if (typeof raw === "string" && raw.trim() !== "") {
    return normalizeStateLabel(raw);
  }

  if (typeof raw === "boolean") {
    return raw ? t("health.statusActive") : t("health.statusClosed");
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return formatSummaryCount(raw, unit);
  }

  if (Array.isArray(raw)) {
    return formatSummaryCount(raw.length, unit);
  }

  if (!isRecord(raw)) {
    return null;
  }

  const statusValue = raw["status"] ?? raw["state"] ?? raw["health"];
  if (typeof statusValue === "string" && statusValue.trim() !== "") {
    return normalizeStateLabel(statusValue);
  }

  const countValue = raw["count"] ?? raw["total"] ?? raw["active"] ?? raw["loaded"];
  if (typeof countValue === "number" && Number.isFinite(countValue)) {
    return formatSummaryCount(countValue, unit);
  }

  const listValue = raw["servers"] ?? raw["items"] ?? raw["plugins"] ?? raw["list"];
  if (Array.isArray(listValue)) {
    return formatSummaryCount(listValue.length, unit);
  }

  const enabledValue = raw["enabled"] ?? raw["healthy"] ?? raw["ok"];
  if (typeof enabledValue === "boolean") {
    return enabledValue ? t("health.statusActive") : t("health.statusClosed");
  }

  return null;
}

function resolveHealthSummary(
  health: GlobalHealthResponse,
  keys: string[],
  unit: string
): string | null {
  for (const key of keys) {
    const summary = summarizeStatusValue(health[key], unit);
    if (summary !== null && summary !== "") {
      return summary;
    }
  }

  return null;
}

async function loadPluginSummaryFromApiClient(): Promise<string | null> {
  const apiClient = window.electronAPI?.["APIClient"] as
    | {
        getPlugins?: () => Promise<unknown>;
      }
    | undefined;
  const getPlugins = apiClient?.["getPlugins"];
  if (typeof getPlugins !== "function") {
    return null;
  }

  try {
    const result = await getPlugins();
    if (!isRecord(result)) {
      return null;
    }

    const plugins = result["plugins"];
    if (Array.isArray(plugins)) {
      return formatSummaryCount(plugins.length, t("health.pluginLabel").toLocaleLowerCase());
    }

    return summarizeStatusValue(plugins, t("health.pluginLabel").toLocaleLowerCase());
  } catch (_error) {
    return null;
  }
}

async function loadPluginSummaryFromConfig(): Promise<string | null> {
  try {
    const result = await apiCall<OpencodeConfigResponse>("GET", "/config");
    if (!isRecord(result)) {
      return null;
    }

    const plugins = result["plugin"] ?? result["plugins"];
    if (Array.isArray(plugins)) {
      return formatSummaryCount(plugins.length, t("health.pluginLabel").toLocaleLowerCase());
    }

    return summarizeStatusValue(plugins, t("health.pluginLabel").toLocaleLowerCase());
  } catch (_error) {
    return null;
  }
}

function setHealthDetailValue(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element != null) {
    element.textContent = value;
    element.setAttribute("title", value);
  }
}

function buildLspSummary(health: GlobalHealthResponse): string {
  const summary = resolveHealthSummary(
    health,
    [
      "lsp",
      "lspStatus",
      "lsp_status",
      "lspServer",
      "lspServers",
      "languageServer",
      "languageServers",
    ],
    t("panel.serverTab").toLocaleLowerCase()
  );

  return summary ?? t("health.serverNoData");
}

function buildPluginSummary(health: GlobalHealthResponse, apiSummary: string | null): string {
  return (
    resolveHealthSummary(
      health,
      ["plugins", "plugin", "pluginStatus", "plugin_status", "pluginCount", "pluginsCount"],
      t("health.pluginLabel").toLocaleLowerCase()
    ) ??
    apiSummary ??
    t("health.serverNoData")
  );
}

function buildHealthBadgeLabel(healthy: boolean): string {
  return healthy ? t("health.badgeHealthy") : t("health.badgeUnhealthy");
}

function buildHealthBadgeClass(healthy: boolean): string {
  return healthy ? "ds-status-badge--success" : "ds-status-badge--error";
}

function buildManualMcpConfig(name: string, enabled: boolean): Record<string, unknown> | null {
  if (!MANUAL_MCP_SERVER_NAMES.has(name)) {
    return null;
  }

  const workspacePath = workspacePathForManualMcp.trim();
  if (workspacePath === "") {
    return null;
  }

  if (name === "app") {
    const normalizedWorkspacePath = workspacePath.replace(/[\\/]$/, "");
    const launcherPath = `${normalizedWorkspacePath}/mcp-server/start.js`;
    return {
      type: "local",
      command: ["node", launcherPath],
      timeout: 60000,
      enabled,
    };
  }

  return null;
}

async function handleMcpToggleChange(input: HTMLInputElement): Promise<void> {
  const serverName = (input.dataset["mcpName"] ?? "").trim();
  const isManual = input.dataset["mcpManual"] === "1";

  if (serverName === "") {
    input.checked = !input.checked;
    return;
  }

  if (!isManual) {
    input.checked = !input.checked;
    return;
  }

  if (MCP_TOGGLE_PENDING.has(serverName)) {
    return;
  }

  const desiredEnabled = input.checked;
  const config = buildManualMcpConfig(serverName, desiredEnabled);
  if (config === null) {
    input.checked = !desiredEnabled;
    return;
  }

  MCP_TOGGLE_PENDING.add(serverName);
  input.disabled = true;

  try {
    await apiCall("POST", "/mcp", {
      name: serverName,
      config,
    });
  } catch (_error) {
    input.checked = !desiredEnabled;
  } finally {
    MCP_TOGGLE_PENDING.delete(serverName);
    await checkHealth();
    try {
      window.dispatchEvent(
        new CustomEvent("opencode-ui:mcp-changed", {
          detail: { name: serverName, enabled: desiredEnabled },
        })
      );
    } catch (_error) {}
  }
}

let mcpToggleHandlersBound = false;

function bindMcpToggleHandlers(): void {
  if (mcpToggleHandlersBound || typeof document === "undefined") {
    return;
  }

  const listEl = document.getElementById("mcp-list");
  if (listEl == null) {
    return;
  }

  listEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (!target.classList.contains("ds-mcp-switch__input")) {
      return;
    }

    void handleMcpToggleChange(target);
  });

  mcpToggleHandlersBound = true;
}

function renderMcpServerRows(
  entries: Array<[string, unknown]>,
  hevToolCount: number | null,
  allowToggle: boolean
): string {
  return entries
    .map(([name, raw]) => {
      const status = extractMcpStatus(raw);
      const isBusy = MCP_TOGGLE_PENDING.has(name);
      const isConnected = status === "connected" || status === "ready";
      const isTransitional = TRANSITIONAL_MCP_STATUSES.has(status) || isBusy;
      const statusBadge = isBusy
        ? { label: t("health.statusProcessing"), badgeType: "warning" as const }
        : getMcpStatusBadge(status);
      const disabled = isTransitional || !allowToggle;
      const switchClass = "ds-mcp-switch" + (disabled ? " ds-mcp-switch--disabled" : "");
      const safeName = escapeHtml(name);
      const countBadge =
        name === "app" && typeof hevToolCount === "number"
          ? '<span class="ds-mcp-tool-count">' + String(hevToolCount) + " tool</span>"
          : "";

      return (
        '<div class="ds-item-row">' +
        '<span class="ds-item-row__name">' +
        safeName +
        "</span>" +
        countBadge +
        '<span class="ds-status-badge ds-status-badge--' +
        statusBadge.badgeType +
        '">' +
        statusBadge.label +
        "</span>" +
        '<label class="' +
        switchClass +
        '">' +
        '<input type="checkbox" class="ds-mcp-switch__input" data-mcp-name="' +
        safeName +
        '" data-mcp-manual="' +
        (allowToggle ? "1" : "0") +
        '"' +
        (isConnected ? " checked" : "") +
        (disabled ? " disabled" : "") +
        " />" +
        '<span class="ds-mcp-switch__slider"></span>' +
        "</label>" +
        "</div>"
      );
    })
    .join("");
}

function renderMcpGroup(
  title: string,
  entries: Array<[string, unknown]>,
  hevToolCount: number | null,
  allowToggle: boolean
): string {
  if (entries.length === 0) {
    return "";
  }

  return (
    '<div class="ds-mcp-group">' +
    '<div class="ds-mcp-group__header">' +
    '<span class="ds-mcp-group__title">' +
    title +
    "</span>" +
    '<span class="ds-mcp-group__count">' +
    String(entries.length) +
    "</span>" +
    "</div>" +
    renderMcpServerRows(entries, hevToolCount, allowToggle) +
    "</div>"
  );
}

function renderMcpServers(mcpServers: McpStatusMap, hevToolCount: number | null): void {
  const panel = document.getElementById("mcp-panel");
  if (panel != null) {
    panel.classList.remove("is-hidden");
  }

  const listEl = document.getElementById("mcp-list");
  const countEl = document.getElementById("mcp-count");
  if (listEl == null) {
    return;
  }

  const entries = Object.entries(mcpServers);
  if (countEl != null) {
    countEl.textContent = String(entries.length);
  }

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="ds-empty-state">${t("health.emptyMcp")}</div>`;
    return;
  }

  const manualEntries = entries.filter(([name]) => MANUAL_MCP_SERVER_NAMES.has(name));
  const builtInEntries = entries.filter(([name]) => !MANUAL_MCP_SERVER_NAMES.has(name));

  const sections = [
    renderMcpGroup(t("health.builtInServersTitle"), builtInEntries, null, false),
    renderMcpGroup(t("health.manualServersTitle"), manualEntries, hevToolCount, true),
  ].filter((section) => section !== "");

  listEl.innerHTML = sections.join("");
}

export function getUnresolvedMcpServers(mcpServers: McpStatusMap | undefined): string[] {
  if (!mcpServers || typeof mcpServers !== "object") {
    return [];
  }

  const entries = Object.entries(mcpServers);
  if (entries.length === 0) {
    return [];
  }

  const unresolved: string[] = [];
  for (const [serverName, raw] of entries) {
    const status = extractMcpStatus(raw);
    if (TRANSITIONAL_MCP_STATUSES.has(status)) {
      unresolved.push(serverName);
    }
  }

  return unresolved;
}

export function areAllMcpServersSettled(mcpServers: McpStatusMap | undefined): boolean {
  if (!mcpServers || typeof mcpServers !== "object") {
    return true;
  }

  const entries = Object.entries(mcpServers);
  if (entries.length === 0) {
    return true;
  }

  return getUnresolvedMcpServers(mcpServers).length === 0;
}

export interface McpSettledResult {
  ready: boolean;
  checks: number;
  unresolvedServers: string[];
}

export async function checkHealth(): Promise<{ mcpServers: McpStatusMap }> {
  bindMcpToggleHandlers();

  const [globalHealth, mcpServers, hevToolCount, pluginSummaryFromConfig, pluginSummaryFromApi] =
    await Promise.all([
      apiCall<GlobalHealthResponse>("GET", "/global/health"),
      apiCall<McpStatusMap>("GET", "/mcp"),
      loadHevToolCountFromOpenCodeServer(),
      loadPluginSummaryFromConfig(),
      loadPluginSummaryFromApiClient(),
    ]);

  const versionEl = document.getElementById("version");
  if (versionEl != null) {
    versionEl.textContent = globalHealth.version ?? "-";
  }

  const healthy = globalHealth.healthy === true;
  const healthBadgeEl = document.getElementById("health-badge");
  if (healthBadgeEl != null) {
    healthBadgeEl.classList.remove(
      "ds-status-badge--warning",
      "ds-status-badge--success",
      "ds-status-badge--error"
    );
    healthBadgeEl.classList.add(buildHealthBadgeClass(healthy));

    const healthBadgeLabelEl = healthBadgeEl.querySelector("span:last-child");
    if (healthBadgeLabelEl != null) {
      healthBadgeLabelEl.textContent = buildHealthBadgeLabel(healthy);
    }
  }

  setHealthDetailValue("lsp-status", buildLspSummary(globalHealth));
  setHealthDetailValue(
    "plugin-status",
    buildPluginSummary(globalHealth, pluginSummaryFromConfig ?? pluginSummaryFromApi)
  );

  renderMcpServers(mcpServers, hevToolCount);

  return { mcpServers };
}

export async function loadStatusContext(): Promise<void> {
  const pathResult = await apiCall<PathResponse>("GET", "/path");

  const path = pathResult.directory ?? pathResult.worktree ?? pathResult.path ?? "";
  workspacePathForManualMcp = path;

  if (path !== "") {
    const workingDirEl = document.getElementById("working-dir");
    if (workingDirEl != null) {
      workingDirEl.textContent = path;
      workingDirEl.setAttribute("title", path);
    }

    const workspaceLabelEl = document.getElementById("workspace-active");
    if (workspaceLabelEl != null) {
      const parts = path.split("/").filter((part) => part !== "");
      const folderName =
        parts.length > 0
          ? (parts[parts.length - 1] ?? t("workspace.mainLabel"))
          : t("workspace.mainLabel");
      workspaceLabelEl.textContent = folderName;
    }
  }
}

async function wait(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function waitForMcpServersSettled(
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    checkHealthFn?: () => Promise<{ mcpServers: McpStatusMap }>;
    waitFn?: (delayMs: number) => Promise<void>;
  } = {}
): Promise<McpSettledResult> {
  const timeoutMs = options.timeoutMs ?? 20000;
  const intervalMs = options.intervalMs ?? 1000;
  const checkHealthFn = options.checkHealthFn ?? checkHealth;
  const waitFn = options.waitFn ?? wait;
  const startedAt = Date.now();

  const poll = async (checks: number): Promise<McpSettledResult> => {
    const snapshot = await checkHealthFn();
    const nextChecks = checks + 1;
    const unresolved = getUnresolvedMcpServers(snapshot.mcpServers);

    if (unresolved.length === 0 && areAllMcpServersSettled(snapshot.mcpServers)) {
      return { ready: true, checks: nextChecks, unresolvedServers: [] };
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return { ready: false, checks: nextChecks, unresolvedServers: unresolved };
    }

    await waitFn(intervalMs);
    return await poll(nextChecks);
  };

  return await poll(0);
}
