import type { TranslationParams } from "@shared/i18n.js";
import { getErrorMessage } from "@shared/index.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import {
  confirmCaptureBootstrapInstall,
  connectCaptureDevice,
  dismissCaptureOperation,
  disconnectCaptureDevice,
  getCaptureStatus,
  refreshCaptureStatus,
  runCaptureAction,
} from "../../../modules/capture/electron-client.js";
import { SettingsManager } from "../../../modules/settings-manager.js";
import { notifyUser } from "../../../ui/user-notification.js";
import { CaptureTranscriptRuntimePanel } from "../capture/transcript-runtime-panel.js";
import { registerSettingsPanelLifecycle } from "../controller.js";
import { applySettingsPanelStaticTranslations } from "../panel-i18n.js";
import type {
  CaptureActionOutcome,
  CaptureAndroidDeviceStatus,
  CaptureHostDependencyState,
  CaptureHostAction,
  CaptureServiceStatus,
} from "../../../../types/capture.js";

let initialized = false;

function captureT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`entrance.capture.${key}`, params);
}

type CapturePanelState = {
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  status: CaptureServiceStatus | null;
  actionProgressTimer: number | null;
};

function createDefaultState(): CapturePanelState {
  return {
    loading: false,
    actionLoading: false,
    error: null,
    status: null,
    actionProgressTimer: null,
  };
}

function stopActionProgressPolling(state: CapturePanelState): void {
  if (state.actionProgressTimer !== null) {
    window.clearInterval(state.actionProgressTimer);
    state.actionProgressTimer = null;
  }
}

function startActionProgressPolling(root: HTMLElement, state: CapturePanelState): void {
  stopActionProgressPolling(state);
  state.actionProgressTimer = window.setInterval(() => {
    void refreshCaptureStatus()
      .then((status) => {
        state.status = status;
        renderAndroidManagementState(root, state);
        renderHostDependencies(root, state);
        syncActionButtons(root, state);
      })
      .catch(() => {});
  }, 700);
}

function primeActionProgress(
  state: CapturePanelState,
  root: HTMLElement,
  action: CaptureHostAction,
  message = captureT("android.progress.starting")
): void {
  if (state.status === null) {
    return;
  }

  state.status = {
    ...state.status,
    operation: {
      state: "running",
      action,
      message,
      progress: 0.02,
      details: state.status.operation.details,
      updatedAt: Date.now(),
    },
  };
  renderAndroidManagementState(root, state);
  renderHostDependencies(root, state);
}

function describeOperationAction(action: CaptureHostAction | null): string {
  switch (action) {
    case null:
      return "Android companion";
    case "prepare-host-dependencies":
      return captureT("dependencies.actions.prepare");
    case "install-companion":
      return captureT("android.actions.install");
    case "launch-companion":
      return captureT("android.actions.open");
    case "connect-device":
      return captureT("android.actions.connect");
    case "disconnect-device":
      return captureT("android.actions.disconnect");
    case "start-analyze-session":
      return "Analyze capture";
    case "stop-analyze-session":
      return "Capture stop";
    case "start-analyze-preview":
      return "Analyze preview";
    case "stop-analyze-preview":
      return "Analyze preview stop";
    case "start-camera-feed":
      return "Camera feed";
    case "stop-camera-feed":
      return "Camera feed stop";
    case "start-interactive-mirror":
      return "Interactive mirror";
    case "stop-interactive-mirror":
      return "Interactive mirror stop";
    case "capture-analyze-photo":
      return "Phone capture";
    case "retake-analyze-photo":
      return "Phone retake";
    case "start-analyze-dictation":
      return "Android dictation";
    case "stop-analyze-dictation":
      return "Android dictation stop";
    case "cancel-analyze-dictation":
      return "Android dictation cancel";
    case "start-ambient-listener":
      return "Ambient listener";
    case "stop-ambient-listener":
      return "Ambient listener stop";
    case "set-torch":
      return "Android torch";
    case "start-tts":
      return "Android TTS";
    case "stop-tts":
      return "Android TTS stop";
    default:
      return "Android companion";
  }
}

function renderAndroidOperationState(root: HTMLElement, state: CapturePanelState): void {
  const shell = root.querySelector<HTMLElement>("#capture-android-progress-shell");
  const title = root.querySelector<HTMLElement>("#capture-android-progress-title");
  const percent = root.querySelector<HTMLElement>("#capture-android-progress-percent");
  const bar = root.querySelector<HTMLElement>("#capture-android-progress-bar");
  const message = root.querySelector<HTMLElement>("#capture-android-progress-message");
  const details = root.querySelector<HTMLElement>("#capture-android-progress-details");
  const actions = root.querySelector<HTMLElement>("#capture-android-progress-actions");
  const operation = state.status?.operation ?? null;

  if (
    !(shell instanceof HTMLElement) ||
    !(title instanceof HTMLElement) ||
    !(percent instanceof HTMLElement) ||
    !(bar instanceof HTMLElement) ||
    !(message instanceof HTMLElement) ||
    !(details instanceof HTMLElement) ||
    !(actions instanceof HTMLElement)
  ) {
    return;
  }

  const activeOperation = operation !== null && operation.state !== "idle";

  if (activeOperation !== true) {
    shell.classList.remove("is-hidden");
    shell.dataset["state"] = "idle";
    setSummaryCard(
      root,
      "operation",
      captureT("overview.operationIdle"),
      captureT("overview.operationIdleNote"),
      "idle"
    );
    title.textContent = captureT("overview.operationIdle");
    percent.textContent = "";
    message.textContent = captureT("overview.operationIdleNote");
    details.innerHTML = "";
    actions.classList.add("is-hidden");
    bar.style.width = "0%";
    shell.setAttribute("aria-valuenow", "0");
    return;
  }

  const progressValue = Math.max(0, Math.min(100, Math.round((operation.progress ?? 0) * 100)));
  const operationTitle = describeOperationAction(operation.action);
  const operationState =
    operation.state === "running" || operation.state === "needs-confirmation"
      ? "running"
      : operation.state === "success"
        ? "ready"
        : "blocked";
  setSummaryCard(
    root,
    "operation",
    operation.state === "running" ? `${operationTitle} ${String(progressValue)}%` : operationTitle,
    operation.message ?? "",
    operationState
  );
  title.textContent = operationTitle;
  percent.textContent =
    operation.state === "running"
      ? `${String(progressValue)}%`
      : operation.state === "needs-confirmation"
        ? captureT("android.progress.states.confirmation")
        : operation.state === "success"
          ? captureT("android.progress.states.success")
          : captureT("android.progress.states.error");
  shell.classList.remove("is-hidden");
  shell.dataset["state"] = operationState;
  message.textContent = operation.message ?? "";
  details.innerHTML = "";
  operation.details.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    details.appendChild(item);
  });
  actions.classList.toggle(
    "is-hidden",
    !(operation.state === "needs-confirmation" && operation.action === "install-companion")
  );
  bar.style.width = `${String(progressValue)}%`;
  shell.setAttribute("aria-valuenow", String(progressValue));
}

function setText(root: HTMLElement, selector: string, value: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = value;
  }
}

function setSummaryCard(
  root: HTMLElement,
  key: "host" | "android" | "operation",
  value: string,
  note: string,
  state: "ready" | "running" | "warning" | "blocked" | "idle"
): void {
  const card = root.querySelector<HTMLElement>(`[data-capture-summary="${key}"]`);
  const valueEl = root.querySelector<HTMLElement>(`#capture-summary-${key}`);
  const noteEl = root.querySelector<HTMLElement>(`#capture-summary-${key}-note`);
  if (card) {
    card.dataset["state"] = state;
  }
  if (valueEl) {
    valueEl.textContent = value;
  }
  if (noteEl) {
    noteEl.textContent = note;
  }
}

function getSelectedDevice(state: CapturePanelState): CaptureAndroidDeviceStatus | null {
  const androidStatus = state.status?.android ?? null;
  return (
    androidStatus?.devices.find((device) => device.selected) ??
    androidStatus?.devices.find((device) => device.connectionState === "device") ??
    null
  );
}

function getCaptureSettingsSnapshot(): NonNullable<
  ReturnType<typeof SettingsManager.getSnapshot>["capture"]
> {
  return SettingsManager.getSnapshot().capture ?? {};
}

function formatPermissionPair(
  camera: CaptureAndroidDeviceStatus["permissions"]["camera"],
  microphone: CaptureAndroidDeviceStatus["permissions"]["microphone"],
  root: HTMLElement
): string {
  const joiner = root.getAttribute("data-capture-permission-joiner") ?? " / ";
  return [
    captureT(`android.states.permission.${camera}`),
    captureT(`android.states.permission.${microphone}`),
  ].join(joiner);
}

function formatSelectedPermissions(state: CapturePanelState, root: HTMLElement): string {
  const selectedDevice = getSelectedDevice(state);
  if (selectedDevice === null) {
    return captureT("android.states.permissions.none");
  }

  return formatPermissionPair(
    selectedDevice.permissions.camera,
    selectedDevice.permissions.microphone,
    root
  );
}

function renderScrcpyLogList(root: HTMLElement, logs: string[]): void {
  const list = root.querySelector<HTMLElement>("#capture-scrcpy-log-list");
  const empty = root.querySelector<HTMLElement>("#capture-scrcpy-log-empty");
  const count = root.querySelector<HTMLElement>("#capture-scrcpy-log-count");
  if (!(list instanceof HTMLElement)) {
    return;
  }

  list.innerHTML = "";
  list.classList.toggle("is-hidden", logs.length === 0);
  empty?.classList.toggle("is-hidden", logs.length > 0);
  if (count) {
    count.textContent =
      logs.length > 0 ? captureT("android.scrcpy.logsCount", { count: String(logs.length) }) : "";
  }

  logs.forEach((logLine) => {
    const item = document.createElement("li");
    item.textContent = logLine;
    list.appendChild(item);
  });
}

function renderScrcpyManagementState(root: HTMLElement, state: CapturePanelState): void {
  const scrcpyStatus = state.status?.scrcpy ?? null;
  const activeMode = scrcpyStatus?.mode ?? "idle";
  const activeDevice = scrcpyStatus?.deviceId ?? captureT("android.scrcpy.none");
  const lastLogs = scrcpyStatus?.lastLogs ?? [];
  const setupCommand = scrcpyStatus?.setupHint?.trim() ?? "";
  const setupCommandRow = root.querySelector<HTMLElement>("#capture-scrcpy-setup-command-row");
  const setupCommandEl = root.querySelector<HTMLElement>("#capture-scrcpy-setup-command");

  setupCommandRow?.classList.toggle("is-hidden", setupCommand === "");
  if (setupCommandEl) {
    setupCommandEl.textContent = setupCommand;
  }

  const feedbackText =
    scrcpyStatus?.lastError ??
    (setupCommand !== ""
      ? captureT("android.scrcpy.feedbackNeedsSetup")
      : scrcpyStatus?.available === true
        ? captureT("android.scrcpy.feedbackReady")
        : captureT("android.scrcpy.feedbackMissing"));

  setText(
    root,
    "#capture-scrcpy-available",
    scrcpyStatus?.available === true
      ? captureT("android.scrcpy.availableYes")
      : captureT("android.scrcpy.availableNo")
  );
  setText(
    root,
    "#capture-scrcpy-version",
    scrcpyStatus?.version ?? captureT("android.scrcpy.none")
  );
  setText(root, "#capture-scrcpy-mode", captureT(`android.scrcpy.modes.${activeMode}`));
  setText(root, "#capture-scrcpy-device", activeDevice);
  setText(root, "#capture-scrcpy-feedback", feedbackText);
  renderScrcpyLogList(root, lastLogs);
}

function formatHostDependencyState(value: CaptureHostDependencyState): string {
  return captureT(`dependencies.states.${value}`);
}

function renderDependencyRow(
  list: HTMLElement,
  title: string,
  state: CaptureHostDependencyState,
  message: string | null = null
): void {
  const article = document.createElement("article");
  article.className = "settings-capture-dependency-row";
  article.dataset["state"] = state;

  const titleWrap = document.createElement("div");
  titleWrap.className = "settings-capture-device-title";

  const titleEl = document.createElement("strong");
  titleEl.textContent = title;
  titleWrap.appendChild(titleEl);

  const stateEl = document.createElement("span");
  stateEl.className = "settings-capture-state-pill";
  stateEl.dataset["state"] = state;
  stateEl.textContent = formatHostDependencyState(state);

  article.append(titleWrap, stateEl);

  const visibleMessage = state === "ready" ? "" : (message ?? "").trim();
  if (visibleMessage !== "") {
    const messageEl = document.createElement("p");
    messageEl.className = "settings-capture-note";
    messageEl.textContent = visibleMessage;
    article.appendChild(messageEl);
  }

  list.appendChild(article);
}

function renderHostDependencies(root: HTMLElement, state: CapturePanelState): void {
  const summary = root.querySelector<HTMLElement>("#capture-host-dependencies-summary");
  const list = root.querySelector<HTMLElement>("#capture-host-dependencies-list");
  const dependencies = state.status?.hostDependencies ?? null;
  if (!(summary instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    return;
  }

  list.innerHTML = "";
  if (dependencies === null) {
    summary.textContent = captureT("dependencies.loading");
    setSummaryCard(
      root,
      "host",
      captureT("overview.loading"),
      captureT("dependencies.loading"),
      "running"
    );
    return;
  }

  const entries: Array<{
    title: string;
    state: CaptureHostDependencyState;
    message: string | null;
  }> = [
    {
      title: captureT("dependencies.items.adb"),
      state: dependencies.adb.state,
      message: dependencies.adb.message,
    },
    {
      title: captureT("dependencies.items.scrcpy"),
      state: dependencies.scrcpy.state,
      message: dependencies.scrcpy.message,
    },
    {
      title: captureT("dependencies.items.v4l2Loopback"),
      state: dependencies.v4l2Loopback.state,
      message: dependencies.v4l2Loopback.message,
    },
    {
      title: captureT("dependencies.items.ffmpeg"),
      state: dependencies.ffmpeg.state,
      message: dependencies.ffmpeg.message,
    },
    {
      title: captureT("dependencies.items.androidBuild"),
      state: dependencies.androidBuild.state,
      message: dependencies.androidBuild.message,
    },
  ];
  const readyCount = entries.filter((entry) => entry.state === "ready").length;
  summary.textContent = captureT("dependencies.summary")
    .replace("{ready}", String(readyCount))
    .replace("{total}", String(entries.length));

  const pendingEntries = entries.filter((entry) => entry.state !== "ready");
  setSummaryCard(
    root,
    "host",
    captureT("dependencies.summary")
      .replace("{ready}", String(readyCount))
      .replace("{total}", String(entries.length)),
    pendingEntries.length === 0
      ? captureT("overview.allReady")
      : pendingEntries
          .slice(0, 2)
          .map((entry) => entry.title)
          .join(", "),
    pendingEntries.some((entry) => entry.state === "blocked")
      ? "blocked"
      : pendingEntries.length === 0
        ? "ready"
        : "warning"
  );

  entries.forEach((entry) => {
    renderDependencyRow(list, entry.title, entry.state, entry.message);
  });
}

function formatDeviceConnection(device: CaptureAndroidDeviceStatus): string {
  return captureT(`android.states.connection.${device.connectionState}`);
}

function formatDeviceTransport(device: CaptureAndroidDeviceStatus): string {
  return captureT(`android.states.transport.${device.transport}`);
}

function formatDeviceCompanion(device: CaptureAndroidDeviceStatus): string {
  return captureT(`android.states.companion.${device.companionState}`);
}

function formatDeviceBridge(device: CaptureAndroidDeviceStatus): string {
  return captureT(`android.states.bridge.${device.bridgeState}`);
}

function formatDeviceHint(device: CaptureAndroidDeviceStatus): string {
  switch (device.connectionState) {
    case "unauthorized":
      return captureT("android.deviceHints.unauthorized");
    case "offline":
      return captureT("android.deviceHints.offline");
    case "device":
      return device.selected
        ? captureT("android.deviceHints.active")
        : captureT("android.deviceHints.ready");
    case "unknown":
      return captureT("android.deviceHints.unknown");
    default:
      return captureT("android.deviceHints.unknown");
  }
}

function shouldShowCaptureConfirmation(): boolean {
  return getCaptureSettingsSnapshot().defaults?.commandConfirmation !== "none";
}

function renderAndroidDeviceList(root: HTMLElement, state: CapturePanelState): void {
  const container = root.querySelector<HTMLElement>("#capture-android-device-list");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const devices = state.status?.android.devices ?? [];
  container.innerHTML = "";

  if (devices.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-capture-note";
    empty.textContent = captureT("android.deviceList.empty");
    container.appendChild(empty);
    return;
  }

  devices.forEach((device) => {
    const article = document.createElement("article");
    article.className = "settings-capture-device-card";
    if (device.selected) {
      article.classList.add("is-selected");
    }

    const header = document.createElement("div");
    header.className = "settings-capture-device-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "settings-capture-device-title";

    const title = document.createElement("strong");
    title.textContent = device.label;
    titleWrap.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "settings-capture-note";
    meta.textContent = `${device.deviceId} · ${formatDeviceTransport(device)}`;
    titleWrap.appendChild(meta);

    header.appendChild(titleWrap);

    if (device.transport === "wireless") {
      const actions = document.createElement("div");
      actions.className = "settings-capture-actions";

      const disconnectButton = document.createElement("button");
      disconnectButton.type = "button";
      disconnectButton.className = "btn btn-secondary btn-sm";
      disconnectButton.dataset["deviceId"] = device.deviceId;
      disconnectButton.dataset["deviceAction"] = "disconnect";
      disconnectButton.textContent = captureT("android.actions.disconnect");
      disconnectButton.disabled = state.loading || state.actionLoading;
      actions.appendChild(disconnectButton);
      header.appendChild(actions);
    }

    const stats = document.createElement("div");
    stats.className = "settings-capture-device-stats";
    const fields: Array<[string, string]> = [
      [captureT("android.deviceList.connection"), formatDeviceConnection(device)],
      [captureT("android.deviceList.companion"), formatDeviceCompanion(device)],
      [captureT("android.deviceList.bridge"), formatDeviceBridge(device)],
      [
        captureT("android.deviceList.permissions"),
        formatPermissionPair(device.permissions.camera, device.permissions.microphone, root),
      ],
    ];

    fields.forEach(([label, value]) => {
      const stat = document.createElement("div");
      stat.className = "settings-capture-device-stat";

      const labelEl = document.createElement("span");
      labelEl.className = "settings-capture-stat-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("strong");
      valueEl.textContent = value;

      stat.append(labelEl, valueEl);
      stats.appendChild(stat);
    });

    const hint = document.createElement("p");
    hint.className = "settings-capture-note";
    hint.textContent = formatDeviceHint(device);

    article.append(header, stats, hint);
    container.appendChild(article);
  });
}

function renderAndroidManagementState(root: HTMLElement, state: CapturePanelState): void {
  const androidStatus = state.status?.android ?? null;
  const bridgeStatus = state.status?.bridge ?? null;
  const selectedDevice = getSelectedDevice(state);
  const hostStatus = state.loading ? "checking" : (androidStatus?.hostState ?? "checking");
  const companionState = selectedDevice?.companionState ?? "unknown";
  const actionLabelKey =
    companionState === "outdated"
      ? "android.actions.update"
      : companionState === "installed"
        ? "android.actions.reinstall"
        : "android.actions.install";

  setText(root, "#capture-android-host-status", captureT(`android.states.host.${hostStatus}`));
  setText(root, "#capture-android-device-count", String(androidStatus?.devices.length ?? 0));
  setText(
    root,
    "#capture-android-active-device",
    selectedDevice?.label ?? captureT("android.states.activeDevice.none")
  );
  setText(
    root,
    "#capture-android-companion-status",
    captureT(`android.states.companion.${companionState}`)
  );
  setText(
    root,
    "#capture-android-preview-status",
    captureT(`android.states.preview.${androidStatus?.previewMode ?? "scrcpy-camera"}`)
  );
  setText(root, "#capture-android-preview-note", captureT("android.previewHint"));
  renderScrcpyManagementState(root, state);
  setText(
    root,
    "#capture-android-bridge-status",
    captureT(`android.states.bridge.${selectedDevice?.bridgeState ?? "waiting"}`)
  );
  setText(root, "#capture-android-permissions", formatSelectedPermissions(state, root));
  setText(
    root,
    "#capture-android-reverse-status",
    captureT(`android.states.reverse.${androidStatus?.reverseState ?? "not-configured"}`)
  );
  setText(
    root,
    "#capture-android-expected-version",
    androidStatus?.artifact.versionName ?? captureT("android.states.expectedVersion.none")
  );
  setText(
    root,
    "#capture-android-pairing-hint",
    androidStatus?.pairingHint ?? captureT("android.feedback.ready")
  );
  setText(
    root,
    "#capture-android-feedback",
    state.error ??
      androidStatus?.message ??
      bridgeStatus?.lastError ??
      captureT(`android.feedback.${hostStatus}`)
  );
  setSummaryCard(
    root,
    "android",
    captureT(`android.states.host.${hostStatus}`),
    selectedDevice?.label ?? captureT("android.states.activeDevice.none"),
    hostStatus === "ready" || hostStatus === "multiple-devices"
      ? "ready"
      : hostStatus === "checking"
        ? "running"
        : hostStatus === "error" || hostStatus === "package-query-failed"
          ? "blocked"
          : "warning"
  );

  const installButton = root.querySelector<HTMLButtonElement>("#capture-android-install-btn");
  if (installButton) {
    installButton.textContent = captureT(actionLabelKey);
  }

  renderAndroidDeviceList(root, state);
  renderAndroidOperationState(root, state);
}

function syncActionButtons(root: HTMLElement, state: CapturePanelState): void {
  const androidStatus = state.status?.android ?? null;
  const operationState = state.status?.operation ?? null;
  const selectedDevice = getSelectedDevice(state);
  const providerSettings = getCaptureSettingsSnapshot().providers;
  const androidCompanionEnabled = providerSettings?.androidCompanionEnabled !== false;
  const busy =
    state.loading || state.actionLoading || operationState?.state === "needs-confirmation";
  const installButton = root.querySelector<HTMLButtonElement>("#capture-android-install-btn");
  const openButton = root.querySelector<HTMLButtonElement>("#capture-android-open-btn");
  const refreshButton = root.querySelector<HTMLButtonElement>("#capture-android-refresh-btn");
  const scanButton = root.querySelector<HTMLButtonElement>("#capture-android-scan-btn");
  const connectButton = root.querySelector<HTMLButtonElement>("#capture-android-connect-btn");
  const connectInput = root.querySelector<HTMLInputElement>("#capture-android-connect-address");
  const confirmInstallButton = root.querySelector<HTMLButtonElement>(
    "#capture-android-progress-confirm-btn"
  );
  const cancelInstallButton = root.querySelector<HTMLButtonElement>(
    "#capture-android-progress-cancel-btn"
  );
  const prepareDependenciesButton = root.querySelector<HTMLButtonElement>(
    "#capture-host-dependencies-prepare-btn"
  );
  const refreshDependenciesButton = root.querySelector<HTMLButtonElement>(
    "#capture-host-dependencies-refresh-btn"
  );

  if (prepareDependenciesButton) {
    prepareDependenciesButton.disabled = busy;
  }
  if (refreshDependenciesButton) {
    refreshDependenciesButton.disabled = busy;
  }
  if (scanButton) {
    scanButton.disabled = busy;
  }
  if (refreshButton) {
    refreshButton.disabled = busy;
  }
  if (connectInput) {
    connectInput.disabled =
      busy || androidStatus?.adbPath === null || androidCompanionEnabled !== true;
  }
  if (connectButton) {
    connectButton.disabled =
      busy ||
      androidStatus?.adbPath === null ||
      androidCompanionEnabled !== true ||
      (connectInput?.value.trim() ?? "") === "";
  }
  if (installButton) {
    installButton.disabled =
      busy ||
      selectedDevice === null ||
      androidStatus?.adbPath === null ||
      androidCompanionEnabled !== true;
  }
  if (openButton) {
    openButton.disabled =
      busy ||
      selectedDevice === null ||
      androidStatus?.adbPath === null ||
      androidCompanionEnabled !== true ||
      (selectedDevice.companionState !== "installed" &&
        selectedDevice.companionState !== "outdated");
  }
  if (confirmInstallButton) {
    confirmInstallButton.disabled = state.actionLoading;
  }
  if (cancelInstallButton) {
    cancelInstallButton.disabled = state.actionLoading;
  }

  root
    .querySelectorAll<HTMLButtonElement>("#capture-android-device-list [data-device-id]")
    .forEach((button) => {
      const device =
        androidStatus?.devices.find((entry) => entry.deviceId === button.dataset["deviceId"]) ??
        null;
      button.disabled =
        busy || button.dataset["deviceAction"] !== "disconnect" || device?.transport !== "wireless";
    });
}

async function loadAndroidState(
  state: CapturePanelState,
  root: HTMLElement,
  forceRefresh = false
): Promise<void> {
  state.loading = true;
  state.error = null;
  renderAndroidManagementState(root, state);
  renderHostDependencies(root, state);
  syncActionButtons(root, state);

  try {
    state.status = forceRefresh ? await refreshCaptureStatus() : await getCaptureStatus();
  } catch (error) {
    state.error = getErrorMessage(error);
  } finally {
    state.loading = false;
    renderAndroidManagementState(root, state);
    renderHostDependencies(root, state);
    syncActionButtons(root, state);
  }
}

async function runAndSyncCaptureAction(
  state: CapturePanelState,
  root: HTMLElement,
  action: CaptureActionOutcome["action"],
  options?: {
    execute?: () => Promise<CaptureActionOutcome>;
    progressMessage?: string;
  }
): Promise<void> {
  state.actionLoading = true;
  state.error = null;
  primeActionProgress(state, root, action, options?.progressMessage);
  syncActionButtons(root, state);
  startActionProgressPolling(root, state);

  try {
    const outcome =
      typeof options?.execute === "function"
        ? await options.execute()
        : await runCaptureAction(action);
    state.status = outcome.status;
    const waitingConfirmation = outcome.status.operation.state === "needs-confirmation";
    if (waitingConfirmation !== true && (outcome.ok !== true || shouldShowCaptureConfirmation())) {
      notifyUser({
        kind: outcome.ok ? "success" : "error",
        title: outcome.message,
        dedupeKey: `settings-capture-${action}`,
      });
    }
  } catch (error) {
    state.error = getErrorMessage(error);
    notifyUser({
      kind: "error",
      title: state.error,
      dedupeKey: `settings-capture-${action}-error`,
    });
  } finally {
    state.actionLoading = false;
    stopActionProgressPolling(state);
    renderAndroidManagementState(root, state);
    renderHostDependencies(root, state);
    syncActionButtons(root, state);
  }
}

function bindActions(root: HTMLElement, state: CapturePanelState): void {
  const scanButton = root.querySelector<HTMLButtonElement>("#capture-android-scan-btn");
  const refreshButton = root.querySelector<HTMLButtonElement>("#capture-android-refresh-btn");
  const prepareDependenciesButton = root.querySelector<HTMLButtonElement>(
    "#capture-host-dependencies-prepare-btn"
  );
  const refreshDependenciesButton = root.querySelector<HTMLButtonElement>(
    "#capture-host-dependencies-refresh-btn"
  );
  const installButton = root.querySelector<HTMLButtonElement>("#capture-android-install-btn");
  const openButton = root.querySelector<HTMLButtonElement>("#capture-android-open-btn");
  const connectButton = root.querySelector<HTMLButtonElement>("#capture-android-connect-btn");
  const connectInput = root.querySelector<HTMLInputElement>("#capture-android-connect-address");
  const confirmInstallButton = root.querySelector<HTMLButtonElement>(
    "#capture-android-progress-confirm-btn"
  );
  const cancelInstallButton = root.querySelector<HTMLButtonElement>(
    "#capture-android-progress-cancel-btn"
  );
  const deviceList = root.querySelector<HTMLElement>("#capture-android-device-list");

  if (scanButton) {
    scanButton.onclick = (): void => {
      void loadAndroidState(state, root, true);
    };
  }
  if (refreshButton) {
    refreshButton.onclick = (): void => {
      void loadAndroidState(state, root, true);
    };
  }
  if (prepareDependenciesButton) {
    prepareDependenciesButton.onclick = (): void => {
      void runAndSyncCaptureAction(state, root, "prepare-host-dependencies", {
        progressMessage: captureT("dependencies.progress.starting"),
      });
    };
  }
  if (refreshDependenciesButton) {
    refreshDependenciesButton.onclick = (): void => {
      void loadAndroidState(state, root, true);
    };
  }
  if (installButton) {
    installButton.onclick = (): void => {
      void runAndSyncCaptureAction(state, root, "install-companion");
    };
  }
  if (confirmInstallButton) {
    confirmInstallButton.onclick = (): void => {
      void runAndSyncCaptureAction(state, root, "install-companion", {
        execute: confirmCaptureBootstrapInstall,
        progressMessage: captureT("android.progress.bootstrapStarting"),
      });
    };
  }
  if (cancelInstallButton) {
    cancelInstallButton.onclick = (): void => {
      state.actionLoading = true;
      syncActionButtons(root, state);
      void dismissCaptureOperation()
        .then((status) => {
          state.status = status;
        })
        .catch((error) => {
          state.error = getErrorMessage(error);
          notifyUser({
            kind: "error",
            title: state.error,
            dedupeKey: "settings-capture-dismiss-error",
          });
        })
        .finally(() => {
          state.actionLoading = false;
          renderAndroidManagementState(root, state);
          renderHostDependencies(root, state);
          syncActionButtons(root, state);
        });
    };
  }
  if (openButton) {
    openButton.onclick = (): void => {
      void runAndSyncCaptureAction(state, root, "launch-companion");
    };
  }
  if (connectButton && connectInput) {
    const runConnect = (): void => {
      const address = connectInput.value.trim();
      if (address === "") {
        return;
      }

      state.actionLoading = true;
      primeActionProgress(state, root, "connect-device");
      syncActionButtons(root, state);
      startActionProgressPolling(root, state);
      void connectCaptureDevice(address)
        .then((outcome) => {
          state.status = outcome.status;
          if (outcome.ok !== true || shouldShowCaptureConfirmation()) {
            notifyUser({
              kind: outcome.ok ? "success" : "error",
              title: outcome.message,
              dedupeKey: `settings-capture-connect-${address}`,
            });
          }
        })
        .catch((error) => {
          state.error = getErrorMessage(error);
          notifyUser({
            kind: "error",
            title: state.error,
            dedupeKey: `settings-capture-connect-${address}-error`,
          });
        })
        .finally(() => {
          state.actionLoading = false;
          stopActionProgressPolling(state);
          renderAndroidManagementState(root, state);
          renderHostDependencies(root, state);
          syncActionButtons(root, state);
        });
    };

    connectButton.onclick = runConnect;
    connectInput.oninput = (): void => {
      syncActionButtons(root, state);
    };
  }

  if (deviceList) {
    deviceList.onclick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>("[data-device-id]");
      const deviceId = button?.dataset["deviceId"]?.trim() ?? "";
      if (deviceId === "") {
        return;
      }

      if (button?.dataset["deviceAction"] === "disconnect") {
        state.actionLoading = true;
        primeActionProgress(state, root, "disconnect-device");
        syncActionButtons(root, state);
        startActionProgressPolling(root, state);
        void disconnectCaptureDevice(deviceId)
          .then((outcome) => {
            state.status = outcome.status;
            if (outcome.ok !== true || shouldShowCaptureConfirmation()) {
              notifyUser({
                kind: outcome.ok ? "success" : "error",
                title: outcome.message,
                dedupeKey: `settings-capture-disconnect-${deviceId}`,
              });
            }
          })
          .catch((error) => {
            state.error = getErrorMessage(error);
            notifyUser({
              kind: "error",
              title: state.error,
              dedupeKey: `settings-capture-disconnect-${deviceId}-error`,
            });
          })
          .finally(() => {
            state.actionLoading = false;
            stopActionProgressPolling(state);
            renderAndroidManagementState(root, state);
            renderHostDependencies(root, state);
            syncActionButtons(root, state);
          });
      }
    };
  }
}

export function setupSettingsCapturePanel(): void {
  if (initialized) {
    return;
  }

  const root = document.getElementById("settings-panel-capture");
  if (!(root instanceof HTMLElement)) {
    return;
  }

  root.setAttribute("data-capture-permission-joiner", " / ");

  const transcriptPanel = new CaptureTranscriptRuntimePanel(SettingsManager, root);
  const state = createDefaultState();

  const renderAll = (): void => {
    applySettingsPanelStaticTranslations(root);
    transcriptPanel.render();
    renderAndroidManagementState(root, state);
    renderHostDependencies(root, state);
    syncActionButtons(root, state);
  };

  bindActions(root, state);

  registerSettingsPanelLifecycle("capture", {
    onEnter: () => {
      stopActionProgressPolling(state);
      renderAll();
      void loadAndroidState(state, root);
    },
    onActivate: () => {
      stopActionProgressPolling(state);
      renderAll();
      void transcriptPanel.syncWithSettings({ forceRefresh: true });
      void loadAndroidState(state, root, true);
    },
  });

  transcriptPanel.init();

  SettingsManager.subscribe(() => {
    renderAll();
    void transcriptPanel.syncWithSettings();
  });

  AppI18n.subscribe(() => {
    renderAll();
  });

  renderAll();
  void loadAndroidState(state, root);
  initialized = true;
}
