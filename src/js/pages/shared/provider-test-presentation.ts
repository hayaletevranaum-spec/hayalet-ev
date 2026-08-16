import type {
  ProviderScenarioCommandReport,
  ProviderScenarioCommandStatus,
  ProviderSessionPreview,
  ProviderTestSlot,
  ProviderTestResult,
  ProviderTestSuite,
  ProviderWebviewSyncMode,
  TestStatus,
} from "../../../types/provider.ts";
import { AppI18n } from "../../modules/i18n/index.js";

export interface ProviderTestOverlayHost {
  kind: "overlay";
  hostSlot: "ai1" | "ai2";
  testedSlot: "ai1" | "ai2";
}

export interface ProviderTestSidePanelHost {
  kind: "side-panel";
  hostSlot: "ai0";
  testedSlot: "ai0";
}

export type ProviderTestSurface = ProviderTestOverlayHost | ProviderTestSidePanelHost;

export interface ScenarioProgressSummary {
  title: string;
  completedSteps: number;
  totalSteps: number;
  activeStepId: string | null;
  hasFailures: boolean;
}

export type ScenarioStatusFilter = "all" | TestStatus;

export interface ScenarioStatusCounts {
  all: number;
  pass: number;
  fail: number;
  warning: number;
  skip: number;
}

export interface ScenarioDisplayRow {
  id: string;
  name: string;
  status: ProviderScenarioCommandStatus;
  message: string;
  sessionPreview?: ProviderSessionPreview;
}

function providerTestT(key: string, params?: Record<string, string | number | boolean>): string {
  return AppI18n.t(`providerTest.${key}`, params);
}

const SCENARIO_TITLE_KEYS: Record<string, string> = {
  "webview-test": "scenario.labels.webviewTest",
  "webview-sync": "scenario.labels.webviewSync",
};

const SCENARIO_COMMAND_KEYS: Record<string, string> = {
  "reset-default-page": "scenario.commands.resetDefaultPage",
  "sidebar-open": "scenario.commands.sidebarOpen",
  "session-list": "scenario.commands.sessionList",
  "sidebar-close": "scenario.commands.sidebarClose",
  "prepare-input": "scenario.commands.prepareInput",
  "disabled-send": "scenario.commands.disabledSend",
  "drag-drop-surface": "scenario.commands.dragDropSurface",
  "inject-message": "scenario.commands.injectMessage",
  "enabled-send": "scenario.commands.enabledSend",
  "attach-file": "scenario.commands.attachFile",
  "send-thinking": "scenario.commands.sendThinking",
  "final-bubbles": "scenario.commands.finalBubbles",
  "generated-image": "scenario.commands.generatedImage",
  "scroll-behavior": "scenario.commands.scrollBehavior",
  "provider-capabilities": "scenario.commands.providerCapabilities",
  "open-sidebar": "scenario.commands.openSidebar",
  "wait-sidebar-ready": "scenario.commands.waitSidebarReady",
  "check-sidebar-ready": "scenario.commands.checkSidebarReady",
  "collect-session-urls": "scenario.commands.collectSessionUrls",
  "soft-sync-session": "scenario.commands.softSyncSession",
  "navigate-session": "scenario.commands.navigateSession",
  "sync-session": "scenario.commands.syncSession",
  "refresh-conversation-list": "scenario.commands.refreshConversationList",
};

const SCENARIO_SYNC_MODE_KEYS: Record<ProviderWebviewSyncMode, string> = {
  soft: "scenario.syncModes.soft",
  full: "scenario.syncModes.full",
  clean: "scenario.syncModes.clean",
};

function translateProviderScenarioLabel(key: string | undefined, fallback: string): string {
  if (key == null || key === "") {
    return fallback;
  }

  const translated = providerTestT(key);
  return translated === `providerTest.${key}` ? fallback : translated;
}

export function getScenarioTitleLabel(scenarioId: string, fallback?: string): string {
  const normalizedFallback = fallback?.trim() ?? "";
  return translateProviderScenarioLabel(
    SCENARIO_TITLE_KEYS[scenarioId],
    normalizedFallback !== "" ? normalizedFallback : scenarioId
  );
}

export function getScenarioCommandLabel(commandId: string, fallback?: string): string {
  const normalizedFallback = fallback?.trim() ?? "";
  return translateProviderScenarioLabel(
    SCENARIO_COMMAND_KEYS[commandId],
    normalizedFallback !== "" ? normalizedFallback : commandId
  );
}

export function getScenarioSyncModeLabel(mode: ProviderWebviewSyncMode): string {
  return translateProviderScenarioLabel(SCENARIO_SYNC_MODE_KEYS[mode], mode);
}

export const resolveScenarioSurface = resolveProviderTestSurface;

export function resolveProviderTestSurface(slot: ProviderTestSlot): ProviderTestSurface {
  if (slot === "ai1") {
    return { kind: "overlay", hostSlot: "ai2", testedSlot: slot };
  }
  if (slot === "ai2") {
    return { kind: "overlay", hostSlot: "ai1", testedSlot: slot };
  }
  return { kind: "side-panel", hostSlot: "ai0", testedSlot: slot };
}

function toDisplayRow(command: ProviderScenarioCommandReport): ScenarioDisplayRow {
  const sessionPreview =
    command.details?.sessionPreview ??
    (typeof command.output === "object" &&
    command.output !== null &&
    "sessionPreview" in command.output
      ? ((command.output as { sessionPreview?: ProviderSessionPreview }).sessionPreview ??
        undefined)
      : undefined);

  return {
    id: command.id,
    name: getScenarioCommandLabel(command.id, command.name),
    status: command.status,
    message: command.message,
    ...(sessionPreview !== undefined ? { sessionPreview } : {}),
  };
}

export function buildScenarioProgressSummary(input: {
  slot: ProviderTestSlot;
  providerName: string;
  scenarioTitle?: string;
  commands: Array<Pick<ProviderScenarioCommandReport, "id" | "name" | "status">>;
  totalSteps?: number;
}): ScenarioProgressSummary {
  const completedSteps = input.commands.filter((command) => command.status !== "running").length;
  const activeStep = input.commands.find((command) => command.status === "running") ?? null;

  return {
    title: providerTestT("scenario.runningTitle", {
      providerName: input.providerName,
      scenarioTitle:
        input.scenarioTitle?.trim() !== ""
          ? (input.scenarioTitle ?? "")
          : providerTestT("scenario.defaultTitle"),
    }),
    completedSteps,
    totalSteps: input.totalSteps ?? input.commands.length,
    activeStepId: activeStep?.id ?? null,
    hasFailures: input.commands.some((command) => command.status === "fail"),
  };
}

export function buildScenarioStatusCounts(input: {
  commands: Array<Pick<ProviderScenarioCommandReport, "status">>;
}): ScenarioStatusCounts {
  return {
    all: input.commands.length,
    pass: input.commands.filter((command) => command.status === "pass").length,
    fail: input.commands.filter((command) => command.status === "fail").length,
    warning: input.commands.filter((command) => command.status === "warning").length,
    skip: input.commands.filter((command) => command.status === "skip").length,
  };
}

export function buildScenarioCompletionMessage(input: {
  passed?: number;
  totalTests?: number;
  commands?: Array<Pick<ProviderScenarioCommandReport, "status">>;
  aborted?: boolean;
  abortReason?: string;
}): string {
  if (input.aborted === true) {
    return input.abortReason?.trim() !== "" && input.abortReason !== undefined
      ? input.abortReason
      : providerTestT("scenario.abortedDefault");
  }

  const fallbackCommands = input.commands ?? [];
  const passed =
    typeof input.passed === "number"
      ? input.passed
      : fallbackCommands.filter((command) => command.status === "pass").length;
  const totalTests =
    typeof input.totalTests === "number" ? input.totalTests : fallbackCommands.length;

  if (totalTests <= 0) {
    return providerTestT("scenario.completedGeneric");
  }

  return providerTestT("scenario.completedWithCounts", {
    passed,
    total: totalTests,
  });
}

export function filterScenarioDisplayRows(input: {
  filter: ScenarioStatusFilter;
  commands: ProviderScenarioCommandReport[];
}): ScenarioDisplayRow[] {
  const rows = input.commands.map((command) => toDisplayRow(command));

  if (input.filter === "all") {
    return rows;
  }

  return rows.filter((row) => row.status === input.filter);
}

export function formatScenarioStatusLabel(status: ProviderScenarioCommandStatus): string {
  switch (status) {
    case "pass":
    case "fail":
    case "warning":
    case "skip":
    case "running":
      return providerTestT(`status.${status}`);
    default:
      return status;
  }
}

export function getScenarioResultsFilterAriaLabel(): string {
  return providerTestT("scenario.resultsFilterAria");
}

export function getScenarioEmptyMessage(filter: ScenarioStatusFilter): string {
  return providerTestT(filter === "all" ? "scenario.emptyNotStarted" : "scenario.emptyNoResults");
}

export function buildScenarioStepsCompletedLabel(completed: number, total: number): string {
  return providerTestT("scenario.stepsCompleted", { completed, total });
}

export function getScenarioReadyLabel(): string {
  return providerTestT("scenario.readyState");
}

export function buildProviderTestResultsModalTitle(results: ProviderTestSuite): string {
  return providerTestT("modal.title", {
    providerName: results.providerName,
    slot: results.slot.toUpperCase(),
  });
}

function getProviderTestCategoryName(category: string): string {
  switch (category) {
    case "preflight":
      return providerTestT("modal.categories.preflight");
    case "dom":
      return providerTestT("modal.categories.dom");
    case "interactive":
      return providerTestT("modal.categories.interactive");
    case "scraping":
      return providerTestT("modal.categories.scraping");
    case "advanced":
      return providerTestT("modal.categories.advanced");
    default:
      return category;
  }
}

function buildProviderTestResultDetails(test: ProviderTestResult): string {
  if (!test.details) {
    return "";
  }

  let html = '<div class="test-details">';

  if (test.details.selector !== undefined && test.details.selector !== "") {
    html += `<div class="detail-item"><strong>${providerTestT("modal.selectorLabel")}:</strong> <code>${test.details.selector}</code></div>`;
  }

  if (test.details.error !== undefined && test.details.error !== "") {
    html += `<div class="detail-item detail-error"><strong>${providerTestT("modal.errorLabel")}:</strong> ${test.details.error}</div>`;
  }

  if (test.details.element) {
    const el = test.details.element;
    html += `<div class="detail-item"><strong>${providerTestT("modal.elementLabel")}:</strong> ${el.tagName} (${providerTestT("modal.visibleLabel")}: ${String(el.visible)}, ${providerTestT("modal.enabledLabel")}: ${String(el.enabled)})</div>`;
    if (el.textContent !== undefined && el.textContent !== "") {
      html += `<div class="detail-item"><strong>${providerTestT("modal.textLabel")}:</strong> ${el.textContent.slice(0, 50)}...</div>`;
    }
  }

  html += "</div>";
  return html;
}

export function generateProviderTestResultsHTML(results: ProviderTestSuite): string {
  const { passed, failed, skipped, warnings, totalTests, totalDuration, aborted, abortReason } =
    results;

  let html = `
      <div class="test-results-summary">
        <div class="test-stats">
          <span class="stat-item stat-pass">${providerTestT("modal.statsPassed", { count: passed })}</span>
          <span class="stat-item stat-fail">${providerTestT("modal.statsFailed", { count: failed })}</span>
          ${warnings > 0 ? `<span class="stat-item stat-warning">${providerTestT("modal.statsWarnings", { count: warnings })}</span>` : ""}
          ${skipped > 0 ? `<span class="stat-item stat-skip">${providerTestT("modal.statsSkipped", { count: skipped })}</span>` : ""}
        </div>
        <div class="test-meta">
          <span>${providerTestT("modal.duration", { seconds: (totalDuration / 1000).toFixed(2) })}</span>
          <span>${providerTestT("modal.total", { count: totalTests })}</span>
        </div>
        ${aborted === true ? `<div class="test-aborted">${providerTestT("modal.aborted", { reason: abortReason ?? providerTestT("modal.unknownReason") })}</div>` : ""}
      </div>
    `;

  const categories: Record<string, ProviderTestResult[]> = {};
  results.results.forEach((result) => {
    categories[result.category] ??= [];
    categories[result.category]?.push(result);
  });

  const categoryEmoji: Record<string, string> = {
    preflight: "🚀",
    dom: "📋",
    interactive: "🎮",
    scraping: "📝",
    advanced: "🔬",
  };

  for (const [category, tests] of Object.entries(categories)) {
    html += `
        <div class="test-category">
          <h3 class="category-title">${categoryEmoji[category] ?? "📦"} ${getProviderTestCategoryName(category)}</h3>
          <div class="test-results-list">
      `;

    tests.forEach((test) => {
      const statusEmoji: Record<string, string> = {
        pass: "✅",
        fail: "❌",
        skip: "⏭️",
        warning: "⚠️",
      };

      html += `
          <div class="test-result-item test-${test.status}">
            <div class="test-header">
              <span class="test-status">${statusEmoji[test.status] ?? "•"}</span>
              <span class="test-name">${test.name}</span>
              <span class="test-duration">${test.duration}ms</span>
            </div>
            <div class="test-message">${test.message}</div>
            ${buildProviderTestResultDetails(test)}
        `;

      html += "</div>";
    });

    html += `
          </div>
        </div>
      `;
  }

  return html;
}
