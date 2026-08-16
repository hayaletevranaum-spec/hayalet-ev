import type { WebviewTag } from "electron";
import { LogCategory, LogLevel } from "@shared/logging-core";
import type { BaseProviderConfig } from "@shared/provider.js";
import { Logger } from "../../modules/logger/index.js";
import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import { AppState } from "../../modules/app-state.js";
import { SlotController } from "../../modules/slot-controller.js";
import { TrafficManager } from "../../modules/traffic-manager.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { deliverToAssistant } from "../../modules/assistant-delivery.js";
import { ProviderRegistry } from "../../modules/webview/provider-registry.js";
import { WebviewManager } from "../../modules/webview-manager.js";
import {
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  type InlineStatusOverlayController,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import {
  createSharedScenarioOverlayController,
  createSharedWebviewStatusOverlayController,
} from "../../ui/overlay-presets.js";
import {
  buildScenarioCompletionMessage,
  buildScenarioProgressSummary,
  buildScenarioStatusCounts,
  buildScenarioStepsCompletedLabel,
  buildProviderTestResultsModalTitle,
  filterScenarioDisplayRows,
  formatScenarioStatusLabel,
  generateProviderTestResultsHTML,
  getScenarioCommandLabel,
  getScenarioEmptyMessage,
  getScenarioReadyLabel,
  getScenarioResultsFilterAriaLabel,
  getScenarioSyncModeLabel,
  getScenarioTitleLabel,
  resolveScenarioSurface,
  type ScenarioStatusFilter,
} from "../shared/provider-test-presentation.js";

import type { AppSettings } from "@shared/settings.js";
import type {
  ProviderScenarioCommandReport,
  ProviderScenarioProgressEvent,
  ProviderTestProgressEvent,
  ProviderTestSuite,
  ProviderWebviewSyncMode,
} from "@shared/provider.js";

type SlotType = "ai1" | "ai2";

function providerTestT(key: string, params?: Record<string, string | number | boolean>): string {
  return AppI18n.t(`providerTest.${key}`, params);
}

function entranceWebviewT(key: string, params?: Record<string, string | number | boolean>): string {
  return AppI18n.t(`entrance.webview.${key}`, params);
}

type TrafficManagerState = (typeof TrafficManager.state)[SlotType];

interface SlotState {
  hasAccount: boolean;
  connected: boolean;
  connecting: boolean;
  active: boolean;
}

interface ScenarioOverlayState {
  scenarioId: string;
  syncMode: ProviderWebviewSyncMode;
  testedSlot: SlotType;
  hostSlot: SlotType;
  providerName: string;
  phase: "launcher" | "running" | "completed";
  deliveryInFlight: boolean;
  filter: ScenarioStatusFilter;
  runId: string | null;
  totalCommandCount: number | null;
  commands: ProviderScenarioCommandReport[];
  message: string;
  suite: ProviderTestSuite | null;
}

interface WebviewElement extends HTMLElement {
  getWebContentsId?: () => number;
  getURL?: () => string;
  executeJavaScript?: (script: string) => Promise<unknown>;
  openDevTools?: () => void;
}

export class WebviewPanel {
  ai1Webview: HTMLElement | null;
  ai2Webview: HTMLElement | null;
  trafficUnsub: (() => void) | null;
  loadLogState: Record<string, { lastStart: number; lastStop: number }>;
  sessionUrlSaveTimers: Record<SlotType, ReturnType<typeof setTimeout> | null>;
  scenarioOverlayState: ScenarioOverlayState | null;
  webviewStatusOverlayControllers: Partial<Record<SlotType, InlineStatusOverlayController>>;
  scenarioOverlayControllers: Partial<Record<SlotType, ManagedOverlayController>>;
  providerTestProgressHandler: ((event: ProviderTestProgressEvent) => void) | null;

  constructor() {
    this.ai1Webview = null;
    this.ai2Webview = null;
    this.trafficUnsub = null;
    this.loadLogState = {
      ai1: { lastStart: 0, lastStop: 0 },
      ai2: { lastStart: 0, lastStop: 0 },
    };
    this.sessionUrlSaveTimers = {
      ai1: null,
      ai2: null,
    };
    this.scenarioOverlayState = null;
    this.webviewStatusOverlayControllers = {};
    this.scenarioOverlayControllers = {};
    this.providerTestProgressHandler = null;
  }

  init(): void {
    this.setupWebviewStatusOverlayControllers();
    this.setupScenarioOverlayControllers();
    this.setupEventListeners();
  }

  setupWebviewStatusOverlayControllers(): void {
    (["ai1", "ai2"] as SlotType[]).forEach((slot) => {
      if (this.webviewStatusOverlayControllers[slot] !== undefined) {
        return;
      }

      const overlayEl = document.getElementById(`${slot}-webview-overlay`);
      const mountEl = document.getElementById(`${slot}-webview-mount`);
      if (!(overlayEl instanceof HTMLElement) || !(mountEl instanceof HTMLElement)) {
        return;
      }

      this.webviewStatusOverlayControllers[slot] = createSharedWebviewStatusOverlayController({
        id: `${slot}-webview-overlay`,
        element: overlayEl,
        blockedTarget: mountEl,
      });
    });
  }

  setupScenarioOverlayControllers(): void {
    (["ai1", "ai2"] as SlotType[]).forEach((slot) => {
      if (this.scenarioOverlayControllers[slot] !== undefined) {
        return;
      }

      const overlayEl = document.getElementById(`${slot}-scenario-overlay`);
      if (!(overlayEl instanceof HTMLElement)) {
        return;
      }

      this.scenarioOverlayControllers[slot] = createSharedScenarioOverlayController({
        id: `${slot}-scenario-overlay`,
        element: overlayEl,
        group: OVERLAY_GROUPS.entranceScenario,
        kind: OVERLAY_KINDS.scenario,
        onAfterClose: () => {
          overlayEl.innerHTML = "";
          overlayEl.className = "webview-overlay is-hidden scenario-slot-overlay";
          const mountEl = document.getElementById(`${slot}-webview-mount`);
          mountEl?.classList.remove("webview-content-blocked");
        },
      });
    });
  }

  setupEventListeners(): void {
    try {
      const ai1DevtoolsBtn = document.getElementById("ai1-devtools-btn");
      if (ai1DevtoolsBtn) {
        ai1DevtoolsBtn.addEventListener("click", () => {
          this.openDevTools("ai1");
        });
      }

      const ai2DevtoolsBtn = document.getElementById("ai2-devtools-btn");
      if (ai2DevtoolsBtn) {
        ai2DevtoolsBtn.addEventListener("click", () => {
          this.openDevTools("ai2");
        });
      }

      const ai1TestBtn = document.getElementById("ai1-test-btn");
      if (ai1TestBtn) {
        ai1TestBtn.addEventListener("click", () => {
          this.handleTestClick("ai1");
        });
      }

      const ai1SyncBtn = document.getElementById("ai1-sync-btn");
      if (ai1SyncBtn) {
        ai1SyncBtn.addEventListener("click", () => {
          this.handleSyncClick("ai1");
        });
      }

      const ai2TestBtn = document.getElementById("ai2-test-btn");
      if (ai2TestBtn) {
        ai2TestBtn.addEventListener("click", () => {
          this.handleTestClick("ai2");
        });
      }

      const ai2SyncBtn = document.getElementById("ai2-sync-btn");
      if (ai2SyncBtn) {
        ai2SyncBtn.addEventListener("click", () => {
          this.handleSyncClick("ai2");
        });
      }
    } catch (err) {
      const error = /** @type {Error} */ err;
      Logger.error(
        LogCategory.ENTRANCE,
        AppI18n.t("entrance.logs.eventListenerSetupError", {
          message: getErrorMessage(error),
        })
      );
    }
  }

  subscribeToTraffic(): void {
    this.trafficUnsub ??= TrafficManager.onUpdate(
      ({ provider, state }: { provider?: string; state?: unknown }) => {
        if (provider !== undefined && provider !== "") {
          this.updateUrlDisplay(provider, state as TrafficManagerState);
        } else {
          (["ai1", "ai2"] as SlotType[]).forEach((p) => {
            this.updateUrlDisplay(p, TrafficManager.state[p]);
          });
        }
      }
    );
  }

  applyTitles(): void {
    const ai1Title = document.getElementById("ai1-title");
    const ai2Title = document.getElementById("ai2-title");
    if (ai1Title) ai1Title.textContent = AppState.getNickname("ai1");
    if (ai2Title) ai2Title.textContent = AppState.getNickname("ai2");
  }

  updateUrlDisplay(provider: string, state: TrafficManagerState | undefined): void {
    const urlDisplay = document.getElementById(`${provider}-url-display`);
    if (!urlDisplay) return;

    const hasAccount = !!AppState.getAccountForSlot(provider);
    if (!hasAccount) {
      urlDisplay.textContent = AppI18n.t("entrance.webview.noAccount.title");
      return;
    }

    const href = state?.lastHref ?? "";
    if (href !== "") {
      urlDisplay.textContent = href;
    } else {
      urlDisplay.textContent = "-";
    }
  }

  async setupWebviews(): Promise<void> {
    try {
      const ai1WebviewEl = document.getElementById("ai1-webview") as WebviewTag | null;
      const ai2WebviewEl = document.getElementById("ai2-webview") as WebviewTag | null;

      // NOTE: app.ts owns webview registration to avoid duplicate lifecycle hooks.
      if (ai1WebviewEl && !this.ai1Webview) {
        this.ai1Webview = ai1WebviewEl;
      }

      if (ai2WebviewEl && !this.ai2Webview) {
        this.ai2Webview = ai2WebviewEl;
      }

      const ai1Mount = document.getElementById("ai1-webview-mount");
      const ai2Mount = document.getElementById("ai2-webview-mount");

      if (ai1WebviewEl && ai1Mount && !ai1Mount.contains(ai1WebviewEl)) {
        SlotController.ensureWebviewMounted("ai1");
      }

      if (ai2WebviewEl && ai2Mount && !ai2Mount.contains(ai2WebviewEl)) {
        SlotController.ensureWebviewMounted("ai2");
      }

      const ai1HasAccount = !!AppState.getAccountForSlot("ai1");

      const ai1EventsSetup = ai1WebviewEl?.dataset["eventsSetup"];
      if (
        ai1WebviewEl &&
        ai1HasAccount &&
        (ai1EventsSetup === undefined || ai1EventsSetup === "")
      ) {
        const ai1ProviderId = AppState.getProviderIdForSlot("ai1") ?? "";

        this.setupWebviewEvents("ai1", ai1WebviewEl, ai1ProviderId);
        ai1WebviewEl.dataset["eventsSetup"] = "true";

        const ai1PreloadAttr = ai1WebviewEl.getAttribute("preload");
        const getPreloadPath = window.electronAPI?.["getPreloadPath"];
        if (
          typeof getPreloadPath === "function" &&
          (ai1PreloadAttr === null || ai1PreloadAttr === "")
        ) {
          try {
            const preloadPath = await getPreloadPath("ai1");
            if (preloadPath !== "") {
              ai1WebviewEl.setAttribute("preload", preloadPath);
              this.addLog(
                "ai1",
                "info",
                entranceWebviewT("logs.preloadScriptSet", { path: preloadPath })
              );
            }
          } catch (err) {
            const error = err as Error;
            Logger.warn(
              LogCategory.ENTRANCE,
              entranceWebviewT("logs.preloadPathResolveFailed", {
                slot: "AI1",
                message: getErrorMessage(error),
              })
            );
            this.addLog("ai1", "warning", entranceWebviewT("logs.preloadScriptUnavailable"));
          }
        }
      }

      const ai2HasAccount = !!AppState.getAccountForSlot("ai2");

      const ai2EventsSetup = ai2WebviewEl?.dataset["eventsSetup"];
      if (
        ai2WebviewEl &&
        ai2HasAccount &&
        (ai2EventsSetup === undefined || ai2EventsSetup === "")
      ) {
        const ai2ProviderId = AppState.getProviderIdForSlot("ai2") ?? "";

        this.setupWebviewEvents("ai2", ai2WebviewEl, ai2ProviderId);
        ai2WebviewEl.dataset["eventsSetup"] = "true";

        const ai2PreloadAttr = ai2WebviewEl.getAttribute("preload");
        const getPreloadPath2 = window.electronAPI?.["getPreloadPath"];
        if (
          typeof getPreloadPath2 === "function" &&
          (ai2PreloadAttr === null || ai2PreloadAttr === "")
        ) {
          try {
            const preloadPath = await getPreloadPath2("ai2");
            if (preloadPath !== "") {
              ai2WebviewEl.setAttribute("preload", preloadPath);
              this.addLog(
                "ai2",
                "info",
                entranceWebviewT("logs.preloadScriptSet", { path: preloadPath }),
                {
                  visibility: 2,
                }
              );
            }
          } catch (err) {
            const error = err as Error;
            Logger.warn(
              LogCategory.ENTRANCE,
              entranceWebviewT("logs.preloadPathResolveFailed", {
                slot: "AI2",
                message: getErrorMessage(error),
              })
            );
            this.addLog("ai2", "warning", entranceWebviewT("logs.preloadScriptUnavailable"));
          }
        }
      }
    } catch (err) {
      const error = err as Error;
      Logger.error(
        LogCategory.ENTRANCE,
        entranceWebviewT("logs.setupError", {
          message: getErrorMessage(error),
        })
      );
    }
  }

  getSlotState(_settings: AppSettings | null, provider: string): SlotState {
    const hasAccount =
      provider === "ai1" || provider === "ai2" ? AppState.isAssigned(provider) : false;
    const connected = AppState.isConnected(provider) === true;
    const connecting = SlotController.isTransitioning(provider) === true;
    return {
      hasAccount,
      connected,
      connecting,
      active: hasAccount && (connected || connecting),
    };
  }

  setDevtoolsEnabled(provider: string, enabled: boolean): void {
    const btn = document.getElementById(`${provider}-devtools-btn`) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("is-disabled", !enabled);
  }

  setTestButtonEnabled(provider: string, enabled: boolean): void {
    const btn = document.getElementById(`${provider}-test-btn`) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("is-disabled", !enabled);

    if (!enabled) {
      btn.title = providerTestT("buttonTitles.testDisabled");
    } else {
      btn.title = providerTestT("buttonTitles.testReady", {
        provider: provider.toUpperCase(),
      });
    }
  }

  setSyncButtonEnabled(provider: string, enabled: boolean): void {
    const btn = document.getElementById(`${provider}-sync-btn`) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("is-disabled", !enabled);

    if (!enabled) {
      btn.title = providerTestT("buttonTitles.syncDisabled");
    } else {
      btn.title = providerTestT("buttonTitles.syncReady", {
        provider: provider.toUpperCase(),
      });
    }
  }

  hasVerifiedSyncScenario(slot: SlotType): boolean {
    const providerId = AppState.getProviderIdForSlot(slot);
    if (providerId == null || providerId === "") {
      return false;
    }

    const providerConfig = ProviderRegistry.get(providerId) as BaseProviderConfig | null;
    return providerConfig?.webviewSync?.readiness === "verified";
  }

  isScenarioOverlayHost(slot: SlotType): boolean {
    return this.scenarioOverlayState?.hostSlot === slot;
  }

  openScenarioLauncher(slot: SlotType, scenarioId: string): void {
    if (this.scenarioOverlayState?.phase === "running") {
      return;
    }

    const surface = resolveScenarioSurface(slot);
    if (surface.kind !== "overlay") {
      return;
    }

    this.scenarioOverlayState = {
      scenarioId,
      syncMode: "full",
      testedSlot: slot,
      hostSlot: surface.hostSlot,
      providerName: AppState.getNickname(slot),
      phase: "launcher",
      deliveryInFlight: false,
      filter: "all",
      runId: null,
      totalCommandCount: null,
      commands: [],
      message: providerTestT("scenario.hint"),
      suite: null,
    };

    this.renderScenarioOverlay();
  }

  onLocaleChanged(): void {
    const state = this.scenarioOverlayState;
    if (!state) {
      return;
    }

    state.providerName = AppState.getNickname(state.testedSlot);
    const scenarioTitle = getScenarioTitleLabel(state.scenarioId);

    if (state.phase === "launcher") {
      state.message = providerTestT("scenario.hint");
    } else if (state.phase === "running" && state.commands.length === 0) {
      state.message =
        state.runId === null
          ? providerTestT("scenario.startedMessage", {
              providerName: state.providerName,
              scenarioTitle,
            })
          : providerTestT("scenario.preparingMessage", {
              providerName: state.providerName,
              scenarioTitle,
            });
    } else if (state.phase === "completed" && state.suite !== null) {
      state.message = buildScenarioCompletionMessage({
        passed: state.suite.passed,
        totalTests: state.suite.totalTests,
        commands: state.commands,
        ...(state.suite.aborted !== undefined ? { aborted: state.suite.aborted } : {}),
        ...(state.suite.abortReason !== undefined ? { abortReason: state.suite.abortReason } : {}),
      });
    }

    this.renderScenarioOverlay();
  }

  closeScenarioOverlay(): void {
    const state = this.scenarioOverlayState;
    if (!state) return;

    this.resetScenarioOverlayState(state);
    this.applyGating(SettingsManager.getSnapshot(), ["*"]);
  }

  private resetScenarioOverlayState(state: ScenarioOverlayState): void {
    this.scenarioOverlayControllers[state.hostSlot]?.close();
    this.scenarioOverlayState = null;
  }

  private requestScenarioCancellation(runId: string | null): void {
    if (runId === null || runId.trim() === "") {
      return;
    }

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return;
    }

    const cancelScenario = electronApi["cancelProviderScenario"];
    if (typeof cancelScenario !== "function") {
      return;
    }
    void Promise.resolve(cancelScenario({ runId })).catch((error: unknown) => {
      Logger.warn(
        LogCategory.ENTRANCE,
        providerTestT("scenario.cancelFailed", {
          message: getErrorMessage(error),
        })
      );
    });
  }

  private shouldDismissScenarioOverlayForSlotState(state: SlotState): boolean {
    return !state.hasAccount || (!state.connected && !state.connecting);
  }

  private dismissScenarioOverlayForUnavailableSlot(options?: { cancelActiveRun?: boolean }): void {
    const state = this.scenarioOverlayState;
    if (!state) {
      return;
    }

    if (options?.cancelActiveRun === true) {
      this.requestScenarioCancellation(state.runId);
    }

    this.resetScenarioOverlayState(state);
  }

  updateScenarioProgress(event: ProviderScenarioProgressEvent): void {
    const state = this.scenarioOverlayState;
    if (event.slot !== state?.testedSlot) return;
    if (state.runId !== null && event.runId !== state.runId) return;

    state.runId ??= event.runId;
    if (typeof event.scenarioCommandTotal === "number") {
      state.totalCommandCount = event.scenarioCommandTotal;
    }

    if (event.type === "started") {
      state.phase = "running";
      state.message = providerTestT("scenario.preparingMessage", {
        providerName: state.providerName,
        scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      });
    }

    if (
      (event.type === "command-start" || event.type === "command-complete") &&
      event.commandReport !== undefined
    ) {
      const commandReport = event.commandReport;
      const existing = state.commands.find((command) => command.id === commandReport.id);
      if (existing) {
        Object.assign(existing, commandReport);
      } else {
        state.commands.push({ ...commandReport });
      }
      state.message = event.message ?? state.message;
    }

    if (event.type === "completed") {
      state.phase = "completed";
      state.message = event.message ?? state.message;
    }

    this.renderScenarioOverlay();
  }

  renderScenarioOverlay(): void {
    const state = this.scenarioOverlayState;
    if (!state) return;

    const overlayEl = document.getElementById(`${state.hostSlot}-scenario-overlay`);
    const mountEl = document.getElementById(`${state.hostSlot}-webview-mount`);
    if (!overlayEl || !mountEl) return;

    this.scenarioOverlayControllers[state.hostSlot]?.open();
    overlayEl.className = "webview-overlay scenario-slot-overlay scenario-overlay";
    mountEl.classList.add("webview-content-blocked");

    const displayCommands =
      state.commands.length > 0 ? state.commands : (state.suite?.commands ?? []);
    const totalSteps = state.totalCommandCount ?? state.suite?.commands.length;
    const summary = buildScenarioProgressSummary({
      slot: state.testedSlot,
      providerName: state.providerName,
      scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      commands: displayCommands,
      ...(totalSteps !== undefined ? { totalSteps } : {}),
    });
    const counts = buildScenarioStatusCounts({ commands: displayCommands });
    const rows = filterScenarioDisplayRows({
      filter: state.filter,
      commands: displayCommands,
    });
    const isRunning = state.phase === "running";
    const canDeliverToAssistant =
      state.scenarioId === "webview-test" && state.phase === "completed" && state.suite !== null;
    const summaryMarkup = `
      <div class="scenario-overlay__summary" role="tablist" aria-label="${getScenarioResultsFilterAriaLabel()}">
        <button class="scenario-summary-chip scenario-summary-chip--pass${state.filter === "pass" ? " is-active" : ""}" type="button" data-filter-status="pass">
          ${counts.pass} ${formatScenarioStatusLabel("pass")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--fail${state.filter === "fail" ? " is-active" : ""}" type="button" data-filter-status="fail">
          ${counts.fail} ${formatScenarioStatusLabel("fail")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--warning${state.filter === "warning" ? " is-active" : ""}" type="button" data-filter-status="warning">
          ${counts.warning} ${formatScenarioStatusLabel("warning")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--skip${state.filter === "skip" ? " is-active" : ""}" type="button" data-filter-status="skip">
          ${counts.skip} ${formatScenarioStatusLabel("skip")}
        </button>
      </div>
    `;
    const syncModeMarkup =
      state.scenarioId === "webview-sync"
        ? `
            <div class="scenario-sync-mode" role="group" aria-label="${providerTestT("scenario.syncModeAria")}">
              <button class="scenario-sync-mode__option${state.syncMode === "soft" ? " is-active" : ""}" type="button" data-sync-mode="soft" ${isRunning ? "disabled" : ""}>${getScenarioSyncModeLabel("soft")}</button>
              <button class="scenario-sync-mode__option${state.syncMode === "full" ? " is-active" : ""}" type="button" data-sync-mode="full" ${isRunning ? "disabled" : ""}>${getScenarioSyncModeLabel("full")}</button>
              <button class="scenario-sync-mode__option${state.syncMode === "clean" ? " is-active" : ""}" type="button" data-sync-mode="clean" ${isRunning ? "disabled" : ""}>${getScenarioSyncModeLabel("clean")}</button>
            </div>
          `
        : "";

    const stepMarkup =
      rows.length === 0
        ? `<div class="scenario-empty">${getScenarioEmptyMessage(state.filter)}</div>`
        : rows
            .map((row) => {
              const messageClass =
                row.id.startsWith("navigate-session") ||
                row.id.startsWith("sync-session") ||
                row.id.startsWith("soft-sync-session") ||
                row.id === "open-session-urls" ||
                row.id === "sync-open-session-urls"
                  ? "scenario-step__message scenario-step__message--sync-progress"
                  : "scenario-step__message";
              const sessionPreview = row.sessionPreview;
              const previewSessionCount = sessionPreview?.sessions.length ?? 0;
              const previewMarkup =
                sessionPreview !== undefined && previewSessionCount > 0
                  ? `
                        <div class="scenario-step__preview-list" aria-label="${providerTestT("scenario.sessionPreviewAria")}">
                          <div class="scenario-step__preview-header">${providerTestT("scenario.sessionPreviewHeader", { total: sessionPreview.total })}</div>
                          ${sessionPreview.sessions
                            .map(
                              (session) => `
                                <div class="scenario-step__preview-item">
                                  <span class="scenario-step__preview-title">${session.title}</span>
                                  <span class="scenario-step__preview-url">${session.url}</span>
                                </div>
                              `
                            )
                            .join("")}
                        </div>
                      `
                  : "";

              return `
                    <div class="scenario-step scenario-step--${row.status}">
                      <div class="scenario-step__body">
                        <span class="scenario-step__name">${getScenarioCommandLabel(row.id, row.name)}</span>
                        ${row.message !== "" ? `<span class="${messageClass}">${row.message}</span>` : ""}
                        ${previewMarkup}
                      </div>
                      <span class="scenario-step__status">${formatScenarioStatusLabel(row.status)}</span>
                    </div>
                  `;
            })
            .join("");

    overlayEl.innerHTML = `
      <div class="scenario-overlay__header">
            <div>
              <div class="scenario-overlay__eyebrow">${state.testedSlot.toUpperCase()} ${getScenarioTitleLabel(state.scenarioId)}</div>
              <div class="overlay-title">${summary.title}</div>
              <div class="overlay-subtitle">${state.message}</div>
            </div>
        <button class="btn btn-ghost btn-sm scenario-overlay__close" type="button" ${isRunning ? "disabled" : ""}>${providerTestT("scenario.closeButton")}</button>
      </div>
          <div class="scenario-overlay__meta">
            <span>${buildScenarioStepsCompletedLabel(summary.completedSteps, summary.totalSteps)}</span>
            <span>${summary.activeStepId ?? getScenarioReadyLabel()}</span>
          </div>
          ${syncModeMarkup}
          ${summaryMarkup}
          <div class="scenario-overlay__steps">${stepMarkup}</div>
              <div class="scenario-overlay__actions">
                <button class="btn btn-primary btn-sm scenario-overlay__start" type="button" ${isRunning ? "disabled" : ""}>
                  ${state.phase === "launcher" ? providerTestT("scenario.startButton") : providerTestT("scenario.rerunButton")}
                </button>
                ${
                  isRunning
                    ? `<button class="btn btn-secondary btn-sm scenario-overlay__stop" type="button">${providerTestT("scenario.stopButton")}</button>`
                    : ""
                }
                ${state.suite ? `<button class="btn btn-secondary btn-sm scenario-overlay__copy" type="button">${providerTestT("scenario.copyJsonButton")}</button>` : ""}
                ${
                  canDeliverToAssistant
                    ? `<button class="btn btn-secondary btn-sm scenario-overlay__send-assistant" type="button" ${state.deliveryInFlight ? "disabled" : ""}>${
                        state.deliveryInFlight
                          ? providerTestT("scenario.deliverButtonBusy")
                          : providerTestT("scenario.deliverButton")
                      }</button>`
                    : ""
                }
              </div>
        `;

    this.scrollScenarioOverlayToBottom(overlayEl);

    overlayEl.querySelector(".scenario-overlay__close")?.addEventListener("click", () => {
      this.closeScenarioOverlay();
    });
    overlayEl.querySelector(".scenario-overlay__start")?.addEventListener("click", () => {
      void this.startScenarioTest(state.testedSlot);
    });
    overlayEl.querySelector(".scenario-overlay__stop")?.addEventListener("click", () => {
      void this.stopScenarioTest();
    });
    overlayEl.querySelectorAll<HTMLElement>("[data-sync-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextMode = button.dataset["syncMode"] as ProviderWebviewSyncMode | undefined;
        if (nextMode === undefined) return;
        state.syncMode = nextMode;
        this.renderScenarioOverlay();
      });
    });
    overlayEl.querySelector(".scenario-overlay__copy")?.addEventListener("click", () => {
      if (state.suite) {
        void this.copyScenarioSuiteJson(state.suite).catch((error) => {
          state.message = getErrorMessage(error as Error);
          this.renderScenarioOverlay();
        });
      }
    });
    overlayEl.querySelector(".scenario-overlay__send-assistant")?.addEventListener("click", () => {
      void this.deliverScenarioResultsToAssistant();
    });
    overlayEl.querySelectorAll<HTMLElement>("[data-filter-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset["filterStatus"] as ScenarioStatusFilter | undefined;
        if (filter === undefined) return;
        state.filter = state.filter === filter ? "all" : filter;
        this.renderScenarioOverlay();
      });
    });
  }

  private scrollScenarioOverlayToBottom(overlayEl: HTMLElement): void {
    const stepsEl = overlayEl.querySelector<HTMLElement>(".scenario-overlay__steps");
    if (!stepsEl) return;

    const scrollToBottom = (): void => {
      stepsEl.scrollTop = stepsEl.scrollHeight;
    };

    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.classList.add("clipboard-proxy");
      document.body.appendChild(textarea);

      try {
        textarea.focus();
        textarea.select();
        return document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }
  }

  private async copyScenarioSuiteJson(results: ProviderTestSuite): Promise<void> {
    const copied = await this.copyTextToClipboard(JSON.stringify(results, null, 2));
    if (!copied) {
      throw new Error(providerTestT("scenario.clipboardCopyFailed"));
    }

    Logger.info(LogCategory.ENTRANCE, providerTestT("modal.copiedLog"));
  }

  private buildAssistantDeliveryMessage(results: ProviderTestSuite): string {
    const completionMessage = buildScenarioCompletionMessage({
      passed: results.passed,
      totalTests: results.totalTests,
      commands: results.commands,
      ...(results.aborted !== undefined ? { aborted: results.aborted } : {}),
      ...(results.abortReason !== undefined ? { abortReason: results.abortReason } : {}),
    });
    const notableResults = results.results
      .filter((result) => result.status === "fail" || result.status === "warning")
      .slice(0, 8);
    const lines = [
      providerTestT("delivery.title", { scenarioId: results.scenarioId }),
      providerTestT("delivery.slot", { slot: results.slot.toUpperCase() }),
      providerTestT("delivery.provider", { provider: results.providerName }),
      providerTestT("delivery.summary", { summary: completionMessage }),
      providerTestT("delivery.duration", { seconds: (results.totalDuration / 1000).toFixed(1) }),
      providerTestT("delivery.counts", {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings,
        skipped: results.skipped,
      }),
    ];

    if (
      results.aborted === true &&
      results.abortReason !== undefined &&
      results.abortReason !== ""
    ) {
      lines.push(providerTestT("delivery.abort", { reason: results.abortReason }));
    }

    if (notableResults.length > 0) {
      lines.push("", providerTestT("delivery.notableResults"));
      notableResults.forEach((result) => {
        lines.push(`- [${result.status}] ${result.name}: ${result.message}`);
      });
    } else {
      lines.push("", providerTestT("delivery.allClear"));
    }

    if (results.runId !== undefined && results.runId !== "") {
      lines.push("", providerTestT("delivery.runId", { runId: results.runId }));
    }

    return lines.join("\n");
  }

  async deliverScenarioResultsToAssistant(): Promise<void> {
    const state = this.scenarioOverlayState;
    if (
      !state ||
      state.deliveryInFlight === true ||
      state.scenarioId !== "webview-test" ||
      state.suite === null
    ) {
      return;
    }

    state.deliveryInFlight = true;
    state.message = providerTestT("scenario.deliverySending");
    this.renderScenarioOverlay();

    try {
      const deliveryMessage = this.buildAssistantDeliveryMessage(state.suite);
      const result = await deliverToAssistant({
        message: deliveryMessage,
        page: "entrance-webview-test",
        metadata: {
          slot: state.testedSlot,
          scenarioId: state.scenarioId,
          runId: state.suite.runId ?? "",
        },
      });

      if (result.success !== true) {
        throw new Error(formatErrorWithDetail(providerTestT("delivery.failed"), result.message));
      }

      state.message = providerTestT("scenario.deliverySent");
      Logger.info(LogCategory.ENTRANCE, providerTestT("logs.deliveredToAssistant"), {
        slot: state.testedSlot,
        scenarioId: state.scenarioId,
      });
    } catch (error) {
      state.message = getErrorMessage(error);
      Logger.error(
        LogCategory.ENTRANCE,
        providerTestT("logs.deliveryToAssistantFailed", {
          message: getErrorMessage(error),
        })
      );
    } finally {
      state.deliveryInFlight = false;
      this.renderScenarioOverlay();
    }
  }

  async startScenarioTest(slot: SlotType): Promise<void> {
    if (
      this.scenarioOverlayState?.testedSlot !== slot ||
      this.providerTestProgressHandler !== null
    ) {
      return;
    }
    const state = this.scenarioOverlayState;
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      throw new Error(providerTestT("errors.electronApiUnavailable"));
    }

    const handler = (event: ProviderScenarioProgressEvent): void => {
      this.updateScenarioProgress(event);
    };
    this.providerTestProgressHandler = handler;
    const onProgress = electronApi["onProviderScenarioProgress"];
    if (typeof onProgress !== "function") {
      throw new Error(providerTestT("errors.electronApiUnavailable"));
    }
    onProgress(handler);

    try {
      state.phase = "running";
      state.deliveryInFlight = false;
      state.filter = "all";
      state.commands = [];
      state.runId = null;
      state.totalCommandCount = null;
      state.suite = null;
      state.message = providerTestT("scenario.startedMessage", {
        providerName: state.providerName,
        scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      });
      this.renderScenarioOverlay();

      const scenarioRequest =
        state.scenarioId === "webview-sync"
          ? {
              slot,
              scenarioId: state.scenarioId,
              syncMode: state.syncMode,
            }
          : {
              slot,
              scenarioId: state.scenarioId,
            };
      const runProviderScenario = electronApi["runProviderScenario"];
      if (typeof runProviderScenario !== "function") {
        throw new Error(providerTestT("errors.electronApiUnavailable"));
      }
      const results = (await runProviderScenario(scenarioRequest)) as ProviderTestSuite;

      if (results.refreshedConfig) {
        ProviderRegistry.update(results.refreshedConfig.id, results.refreshedConfig);
        const activeWebview = SlotController.getWebview(slot) as
          (HTMLElement & { send?: (channel: string, ...args: unknown[]) => void }) | null;
        activeWebview?.send?.("app-set-provider", {
          providerId: results.refreshedConfig.id,
          slot,
        });
      }

      state.phase = "completed";
      state.runId = results.runId ?? state.runId;
      state.totalCommandCount = results.commands.length;
      state.commands = results.commands;
      state.suite = results;
      const completionMessage = buildScenarioCompletionMessage({
        passed: results.passed,
        totalTests: results.totalTests,
        commands: state.commands,
        ...(results.aborted !== undefined ? { aborted: results.aborted } : {}),
        ...(results.abortReason !== undefined ? { abortReason: results.abortReason } : {}),
      });
      state.message = completionMessage;
      this.renderScenarioOverlay();

      Logger.info(
        LogCategory.ENTRANCE,
        providerTestT("logs.scenarioCompleted", {
          scenarioId: state.scenarioId,
          message: completionMessage,
        })
      );
    } catch (error) {
      state.phase = "completed";
      state.message = getErrorMessage(error);
      this.renderScenarioOverlay();

      Logger.error(
        LogCategory.ENTRANCE,
        providerTestT("logs.scenarioFailed", {
          scenarioId: state.scenarioId,
          message: getErrorMessage(error),
        })
      );
    } finally {
      const progressHandler = this.providerTestProgressHandler;
      const offProviderScenarioProgress = electronApi["offProviderScenarioProgress"];
      if (typeof offProviderScenarioProgress === "function") {
        offProviderScenarioProgress(progressHandler);
      }
      this.providerTestProgressHandler = null;
    }
  }

  async stopScenarioTest(): Promise<void> {
    const state = this.scenarioOverlayState;
    const electronApi = window.electronAPI;
    if (state?.phase !== "running" || electronApi === undefined) {
      return;
    }

    if (state.runId === null) {
      state.message = providerTestT("scenario.stopPreparing");
      this.renderScenarioOverlay();
      return;
    }

    state.message = providerTestT("scenario.stopRequested");
    this.renderScenarioOverlay();

    try {
      const cancelScenario = electronApi["cancelProviderScenario"];
      if (typeof cancelScenario !== "function") {
        return;
      }
      await cancelScenario({ runId: state.runId });
    } catch (error) {
      state.message = getErrorMessage(error);
      this.renderScenarioOverlay();
    }
  }

  handleTestClick(slot: "ai1" | "ai2"): void {
    const btn = document.getElementById(`${slot}-test-btn`) as HTMLButtonElement | null;
    if (!btn || btn.disabled === true) return;
    if (this.scenarioOverlayState?.phase === "running") return;

    this.collapseSettingsAccordion();
    this.openScenarioLauncher(slot, "webview-test");
  }

  handleSyncClick(slot: "ai1" | "ai2"): void {
    const btn = document.getElementById(`${slot}-sync-btn`) as HTMLButtonElement | null;
    if (!btn || btn.disabled === true) return;
    if (this.scenarioOverlayState?.phase === "running") return;

    this.collapseSettingsAccordion();
    this.openScenarioLauncher(slot, "webview-sync");
  }

  collapseSettingsAccordion(): void {
    const content = document.getElementById("settings-accordion-content");
    const toggle = document.getElementById("settings-accordion-toggle");
    if (!content || !toggle) return;

    if (content.classList.contains("is-expanded")) {
      content.classList.remove("is-expanded");
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  showTestResultsModal(results: ProviderTestSuite): void {
    void import("../../ui/modal-manager.js").then((module) => {
      const { ModalManager: modalManager } = module;

      const content = this.generateTestResultsHTML(results);

      modalManager.open({
        title: buildProviderTestResultsModalTitle(results),
        content,
        size: "large",
        buttons: [
          {
            text: providerTestT("modal.copyJsonButton"),
            class: "btn-ghost",
            onClick: (): void => {
              void this.copyScenarioSuiteJson(results).catch((error) => {
                Logger.error(
                  LogCategory.ENTRANCE,
                  providerTestT("modal.copyFailed", {
                    message: getErrorMessage(error),
                  })
                );
              });
            },
          },
          {
            text: providerTestT("modal.closeButton"),
            class: "btn-primary",
            onClick: (): void => {
              modalManager.close();
            },
          },
        ],
      });
    });
  }

  generateTestResultsHTML(results: ProviderTestSuite): string {
    return generateProviderTestResultsHTML(results);
  }

  applyGating(settings: AppSettings | null, _changedPaths: string[] = []): void {
    settings ??= SettingsManager.getSnapshot();
    this.applyTitles();

    const overlayState = this.scenarioOverlayState;
    if (overlayState) {
      const testedState = this.getSlotState(settings, overlayState.testedSlot);
      const hostState = this.getSlotState(settings, overlayState.hostSlot);
      const shouldDismissOverlay =
        this.shouldDismissScenarioOverlayForSlotState(testedState) ||
        this.shouldDismissScenarioOverlayForSlotState(hostState);

      if (shouldDismissOverlay) {
        this.dismissScenarioOverlayForUnavailableSlot({
          cancelActiveRun: overlayState.phase === "running",
        });
      }
    }

    const providers: SlotType[] = ["ai1", "ai2"];

    for (const provider of providers) {
      const state = this.getSlotState(settings, provider);
      const webviewEl = document.getElementById(`${provider}-webview`);
      const urlDisplay = document.getElementById(`${provider}-url-display`);
      const hasScenarioOverlay = this.isScenarioOverlayHost(provider);
      const overlayController = this.webviewStatusOverlayControllers[provider];

      if (hasScenarioOverlay) {
        this.setDevtoolsEnabled(provider, state.connected);
        this.setTestButtonEnabled(provider, state.hasAccount);
        this.setSyncButtonEnabled(
          provider,
          state.hasAccount && this.hasVerifiedSyncScenario(provider)
        );
        if (webviewEl) {
          webviewEl.classList.toggle("is-hidden", !(state.connected || state.connecting));
        }
        overlayController?.setState(null);
        this.renderScenarioOverlay();
        continue;
      }

      if (!state.hasAccount) {
        this.setDevtoolsEnabled(provider, false);
        this.setTestButtonEnabled(provider, false);
        this.setSyncButtonEnabled(provider, false);
        if (urlDisplay) urlDisplay.textContent = "";
        if (webviewEl) webviewEl.classList.add("is-hidden");
        overlayController?.setState({
          stateClass: "is-empty",
          icon: "🤖",
          title: entranceWebviewT("noAccount.title"),
          subtitle: entranceWebviewT("noAccount.subtitle"),
        });
        continue;
      }

      if (!state.connected && !state.connecting) {
        this.setDevtoolsEnabled(provider, false);
        if (urlDisplay) urlDisplay.textContent = "";
        overlayController?.setState({
          stateClass: "is-disconnected",
          icon: "⚡",
          title: entranceWebviewT("disconnected.title"),
          subtitle: entranceWebviewT("disconnected.subtitle"),
        });
        if (webviewEl) webviewEl.classList.add("is-hidden");
        continue;
      }

      if (state.connecting) {
        this.setDevtoolsEnabled(provider, false);
        overlayController?.setState({
          stateClass: "is-connecting",
          icon: "🔄",
          title: entranceWebviewT("connecting.title"),
          subtitle: entranceWebviewT("connecting.subtitle"),
        });
        const mountId = `${provider}-webview-mount`;
        const mountEl = document.getElementById(mountId);
        if (webviewEl && mountEl && !mountEl.contains(webviewEl)) {
          SlotController.ensureWebviewMounted(provider);
        }
        if (webviewEl) {
          SlotController.ensureWebviewAttached(provider);
        }
        continue;
      }

      this.setDevtoolsEnabled(provider, true);
      this.setTestButtonEnabled(provider, true);
      this.setSyncButtonEnabled(provider, this.hasVerifiedSyncScenario(provider));

      overlayController?.setState(null);

      const mountId = `${provider}-webview-mount`;
      const mountEl = document.getElementById(mountId);
      if (webviewEl && mountEl && !mountEl.contains(webviewEl)) {
        SlotController.ensureWebviewMounted(provider);
      }

      if (webviewEl) {
        SlotController.ensureWebviewAttached(provider);
      }

      if (provider === "ai1" && !this.ai1Webview) {
        void this.setupWebviews();
      }
      if (provider === "ai2" && !this.ai2Webview) {
        void this.setupWebviews();
      }
    }
  }

  setupWebviewEvents(
    type: SlotType,
    webviewEl: WebviewElement,
    providerId: string | null = null
  ): void {
    const scheduleSessionUrlSave = (slot: SlotType, url: string): void => {
      const normalizedUrl = url.trim();
      if (normalizedUrl === "") return;

      const settings = SettingsManager.getSnapshot();
      if (settings.slots[slot].resumeLastSession !== true) {
        return;
      }

      const timer = this.sessionUrlSaveTimers[slot];
      if (timer !== null) {
        clearTimeout(timer);
      }

      this.sessionUrlSaveTimers[slot] = setTimeout(() => {
        this.sessionUrlSaveTimers[slot] = null;
        void this.persistLastSessionUrl(slot, normalizedUrl);
      }, 700);
    };

    const injectProviderConfig = (): void => {
      void (async (): Promise<void> => {
        let currentUrl: string;
        try {
          currentUrl = webviewEl.getURL?.() ?? "";
        } catch (_) {
          return;
        }

        const isExcluded = WebviewManager.isUrlExcluded(type, currentUrl);
        if (isExcluded === true) return;

        const slotProviderId = AppState.getProviderIdForSlot(type);
        const currentProviderId = slotProviderId ?? providerId;
        const cfg =
          currentProviderId !== null && currentProviderId !== ""
            ? ProviderRegistry.get(currentProviderId)
            : null;
        if (cfg === null) {
          return;
        }

        try {
          if (typeof webviewEl.send === "function" && currentProviderId !== "") {
            webviewEl.send("app-set-provider", {
              providerId: currentProviderId,
              slot: type,
            });
          } else {
            const configScript = `
              (function() {
                try {
                  window.__app_slot = ${JSON.stringify(type)};
                  window.__app_provider_config = ${JSON.stringify(cfg)};
                  return true;
                } catch (e) {
                  console.error(
                    ${JSON.stringify(
                      AppI18n.t("webview.messageSender.logs.providerConfigInjectionFailed", {
                        provider: type,
                        providerId: currentProviderId,
                        message: "{{message}}",
                      })
                    )}.replace("{{message}}", e instanceof Error ? e.message : String(e)),
                    e
                  );
                  return false;
                }
              })();
            `;
            await webviewEl.executeJavaScript?.(configScript);
          }
        } catch (_err) {
          void _err;
        }
      })();
    };

    webviewEl.addEventListener("did-start-loading", () => {
      let currentUrl = "";
      try {
        currentUrl = webviewEl.getURL?.() ?? "";
      } catch (_) {}
      const isExcluded = WebviewManager.isUrlExcluded(type, currentUrl);

      const state = this.loadLogState[type] ?? { lastStart: 0, lastStop: 0 };
      const now = Date.now();

      if (isExcluded !== true && now - state.lastStart > 1200) {
        this.addLog(type, "info", entranceWebviewT("logs.pageLoading"), { visibility: 3 });
        state.lastStart = now;
      }
      this.loadLogState[type] = state;
    });

    webviewEl.addEventListener("dom-ready", () => {
      injectProviderConfig();
    });

    webviewEl.addEventListener("did-stop-loading", () => {
      const state = this.loadLogState[type] ?? { lastStart: 0, lastStop: 0 };
      const now = Date.now();

      if (now - state.lastStop > 1200) {
        this.addLog(type, "info", entranceWebviewT("logs.pageLoaded"), { visibility: 3 });
        state.lastStop = now;
      }
      this.loadLogState[type] = state;

      let currentUrl: string;
      try {
        currentUrl = webviewEl.getURL?.() ?? "";
      } catch (_) {
        return;
      }

      const isExcluded = WebviewManager.isUrlExcluded(type, currentUrl);
      if (isExcluded === true) return;

      scheduleSessionUrlSave(type, currentUrl);
    });

    webviewEl.addEventListener("did-navigate-in-page", () => {
      try {
        const currentUrl = webviewEl.getURL?.() ?? "";
        const isExcluded = WebviewManager.isUrlExcluded(type, currentUrl);
        if (isExcluded === true) {
          return;
        }
        scheduleSessionUrlSave(type, currentUrl);
      } catch (_) {}
    });

    webviewEl.addEventListener("console-message", (event: Event) => {
      const consoleEvent = event as Event & { message: string; level: number };
      const { message, level } = consoleEvent;
      const consoleMessage = entranceWebviewT("logs.consoleMessage", {
        slot: type.toUpperCase(),
        message,
      });

      // NOTE: Provider console output is diagnostic-only; keep it out of toast notifications.
      const logLevel =
        level === 2 ? LogLevel.ERROR : level === 1 ? LogLevel.WARNING : LogLevel.DEBUG;
      const logContext = {
        source: `${type}-webview`,
        slotId: type,
        consoleMessageLevel: level,
      };

      if (logLevel === LogLevel.DEBUG) {
        Logger.debug(LogCategory.WEBVIEW, consoleMessage, logContext);
      } else {
        Logger.panel(LogCategory.WEBVIEW, logLevel, consoleMessage, logContext);
      }
    });

    webviewEl.addEventListener(
      "ipc-message",
      (event: Event & { channel?: string; args?: unknown[] }) => {
        try {
          if (event.channel === undefined || event.channel === "") return;
          if (event.channel === "provider-state") {
            const payload = event.args?.[0] as
              | {
                  slot?: unknown;
                  readyState?: unknown;
                  sendState?: unknown;
                  thinkingState?: unknown;
                }
              | null
              | undefined;
            if (payload?.slot === type) {
              TrafficManager.applyProviderState(type, {
                ...(typeof payload.readyState === "string"
                  ? { readyState: payload.readyState }
                  : {}),
                ...(typeof payload.sendState === "string" ? { sendState: payload.sendState } : {}),
                ...(typeof payload.thinkingState === "string"
                  ? { thinkingState: payload.thinkingState }
                  : {}),
              });
            }
          }

          if (event.channel === "provider-usage") {
            const payload = event.args?.[0] as { tokens?: string | string[] } | null;
            if (payload !== null) {
              const titleEl = document.getElementById(`${type}-title`);
              if (titleEl) {
                const base = AppState.getNickname(type);
                const tokens = Array.isArray(payload.tokens)
                  ? payload.tokens.join(",")
                  : String(payload.tokens ?? "");
                titleEl.textContent =
                  tokens !== "" ? entranceWebviewT("usageTitleWithTokens", { base, tokens }) : base;
              }
            }
          }
        } catch (err) {
          const error = err as Error;
          Logger.warn(
            LogCategory.ENTRANCE,
            entranceWebviewT("logs.ipcHandlerError", {
              message: getErrorMessage(error),
            })
          );
        }
      }
    );

    webviewEl.addEventListener(
      "did-fail-load",
      (event: Event & { errorCode?: number; errorDescription?: string }) => {
        if (event.errorCode !== -3 && event.errorCode !== -102) {
          this.addLog(
            type,
            "error",
            entranceWebviewT("logs.loadFailed", {
              code: event.errorCode ?? 0,
              description: event.errorDescription ?? entranceWebviewT("logs.unknownLoadError"),
            })
          );
        } else if (event.errorCode === -3) {
          this.addLog(type, "info", entranceWebviewT("logs.loadCancelled"));
        }
      }
    );
  }

  async persistLastSessionUrl(slot: SlotType, url: string): Promise<void> {
    const settings = SettingsManager.getSnapshot();
    const accountId = AppState.getEntityPresence(slot).accountId;
    if (accountId === null || accountId === "") {
      return;
    }

    const accountIndex = settings.accounts.findIndex((account) => account.id === accountId);
    if (accountIndex === -1) {
      return;
    }

    const currentValue = settings.accounts[accountIndex]?.lastSessionUrl;
    if (currentValue === url) {
      return;
    }

    const updatedAccounts = [...settings.accounts];
    const account = updatedAccounts[accountIndex];
    if (account === undefined) {
      return;
    }

    updatedAccounts[accountIndex] = {
      ...account,
      lastSessionUrl: url,
      lastUsedAt: Date.now(),
    };

    await SettingsManager.save({
      ...settings,
      accounts: updatedAccounts,
    });
  }

  openDevTools(type: SlotType): void {
    try {
      const webview = type === "ai1" ? this.ai1Webview : this.ai2Webview;
      if (!webview) {
        this.addLog(type, "error", entranceWebviewT("logs.webviewMissing"));
        return;
      }

      (webview as WebviewElement).openDevTools?.();
      this.addLog(type, "info", entranceWebviewT("logs.devtoolsOpened"));
    } catch (err) {
      const error = err as Error;
      const message = entranceWebviewT("logs.devtoolsOpenError", {
        message: getErrorMessage(error),
      });
      Logger.error(LogCategory.ENTRANCE, message, {
        context: { type },
      });
      this.addLog(type, "error", message);
    }
  }

  addLog(_type: SlotType, level: string, message: string, meta?: Record<string, unknown>): void {
    if (level === "error") {
      Logger.error(LogCategory.WEBVIEW, message, meta);
    } else if (level === "warning") {
      Logger.warn(LogCategory.WEBVIEW, message, meta);
    } else if (level === "success") {
      Logger.info(LogCategory.WEBVIEW, message, { ...meta, outcome: "success" });
    } else {
      Logger.info(LogCategory.WEBVIEW, message, meta);
    }
  }

  destroy(): void {
    const progressHandler = this.providerTestProgressHandler;
    if (progressHandler !== null) {
      const offTestProgress = window.electronAPI?.["offProviderTestProgress"];
      if (typeof offTestProgress === "function") {
        offTestProgress(progressHandler);
      }
      this.providerTestProgressHandler = null;
    }

    if (this.trafficUnsub) {
      this.trafficUnsub();
      this.trafficUnsub = null;
    }

    (Object.keys(this.sessionUrlSaveTimers) as SlotType[]).forEach((slot) => {
      const timer = this.sessionUrlSaveTimers[slot];
      if (timer !== null) {
        clearTimeout(timer);
        this.sessionUrlSaveTimers[slot] = null;
      }
    });

    (Object.keys(this.webviewStatusOverlayControllers) as SlotType[]).forEach((slot) => {
      this.webviewStatusOverlayControllers[slot]?.setState(null);
      this.webviewStatusOverlayControllers[slot]?.destroy();
      delete this.webviewStatusOverlayControllers[slot];
    });

    (Object.keys(this.scenarioOverlayControllers) as SlotType[]).forEach((slot) => {
      this.scenarioOverlayControllers[slot]?.close();
      this.scenarioOverlayControllers[slot]?.destroy();
      delete this.scenarioOverlayControllers[slot];
    });
  }
}
