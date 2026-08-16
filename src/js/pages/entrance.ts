import { Logger } from "../modules/logger/index.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import { SettingsManager } from "../modules/settings-manager.js";

import type { AppSettings } from "@shared/settings.js";
import { isAssistantAccountsSettingsPath, isAssistantSlotSettingsPath } from "@shared/settings.js";
import { AppState } from "../modules/app-state.js";
import { CoreEngine } from "../modules/core-engine.js";
import { SlotController, SlotEvent } from "../modules/slot-controller.js";
import { TrafficManager } from "../modules/traffic-manager.js";
import { getMimeTypeFromPath } from "../constants/index.js";
import { ButtonStates } from "../ui/button-states.js";
import { notifyUser } from "../ui/user-notification.js";

import { UserPanel } from "./settings/accounts/user-panel.js";
import { SlotPanel } from "./entrance/slot-panel.js";
import { Us1Panel } from "./settings/accounts/us1-panel.js";
import { AccountPanel } from "./settings/accounts/account-panel.js";
import { WebviewPanel } from "./entrance/webview-panel.js";
import { setupLiveLogOverlay as setupSettingsLiveLogOverlay } from "./settings/live-log/overlay.js";
import { EntranceSceneController } from "./entrance/scene/scene-controller.js";
import { createSceneEntranceBridge } from "./entrance/scene/scene-entrance-bridge.js";
import { AppI18n } from "../modules/i18n/index.js";
import { applyEntranceStaticTranslations, t as entranceT } from "./entrance/i18n.js";

export class EntranceHallController {
  defaultsApplied: boolean;
  us1ConnectionPreferenceApplied: boolean;
  userPanel: UserPanel;
  slotPanelAi1: SlotPanel;
  slotPanelAi2: SlotPanel;
  us1Panel: Us1Panel;
  accountPanel: AccountPanel;
  webviewPanel: WebviewPanel;
  sceneController: EntranceSceneController;
  _unsubSettings: (() => void) | null = null;
  _unsubSlotController: (() => void) | null = null;
  _unsubI18n: (() => void) | null = null;

  constructor() {
    this.defaultsApplied = false;
    this.us1ConnectionPreferenceApplied = false;

    this.userPanel = new UserPanel(SettingsManager);
    this.slotPanelAi1 = new SlotPanel("ai1", SettingsManager);
    this.slotPanelAi2 = new SlotPanel("ai2", SettingsManager);
    this.us1Panel = new Us1Panel(SettingsManager);
    this.accountPanel = new AccountPanel(SettingsManager);
    this.webviewPanel = new WebviewPanel();
    this.sceneController = new EntranceSceneController(
      createSceneEntranceBridge({
        slotPanels: {
          ai1: this.slotPanelAi1,
          ai2: this.slotPanelAi2,
        },
        us1Panel: this.us1Panel,
        webviewPanel: this.webviewPanel,
        connectUser: async (slot) => {
          await this.connectUser(slot);
        },
        disconnectUser: async (slot) => {
          await this.disconnectUser(slot);
        },
      })
    );
  }

  async init(): Promise<void> {
    applyEntranceStaticTranslations();

    this.userPanel.init();
    this.slotPanelAi1.init();
    this.slotPanelAi2.init();
    this.us1Panel.init();
    this.accountPanel.init();
    this.webviewPanel.init();
    this.sceneController.init();

    this.setupEventListeners();
    this.setupLiveLogOverlay();
    await this.loadUserSettings();
    await this.applyUs1RememberedConnectionPreference();
    this.setupI18nBindings();

    await this.webviewPanel.setupWebviews();
    this.webviewPanel.applyGating(SettingsManager.getSnapshot(), ["*"]);
    this.webviewPanel.updateUrlDisplay("ai1", TrafficManager.state["ai1"]);
    this.webviewPanel.updateUrlDisplay("ai2", TrafficManager.state["ai2"]);
    this.webviewPanel.subscribeToTraffic();

    this._unsubSettings ??= SettingsManager.subscribe(
      ({ settings, changedPaths }: { settings: unknown; changedPaths: string[] }) => {
        const typedSettings = settings as AppSettings;
        const shouldApplyIdentityUi =
          changedPaths.includes("*") ||
          changedPaths.some(
            (path) =>
              path.startsWith("user") ||
              path.startsWith("accounts") ||
              path.startsWith("integrations.mailTransport") ||
              path.startsWith("remoteUsers") ||
              isAssistantAccountsSettingsPath(path) ||
              path.startsWith("slots") ||
              path.startsWith("us1Slot") ||
              isAssistantSlotSettingsPath(path)
          );

        if (shouldApplyIdentityUi) {
          this.applySettingsToUI(typedSettings, changedPaths);
          this.sceneController.syncScene();
        }

        const shouldApplyWebviewGating =
          changedPaths.includes("*") ||
          changedPaths.some(
            (path) =>
              path.startsWith("slots") || path.startsWith("accounts") || path.startsWith("general")
          );

        if (shouldApplyWebviewGating) {
          this.webviewPanel.applyGating(typedSettings, changedPaths);
        }

        if (
          changedPaths.includes("*") ||
          changedPaths.some(
            (p) =>
              p.startsWith("accounts") ||
              p.startsWith("remoteUsers") ||
              p.startsWith("us1Slot") ||
              p.startsWith("integrations.mailTransport")
          )
        ) {
          this.accountPanel.render();
          this.slotPanelAi1.render();
          this.slotPanelAi2.render();
        }
        if (
          changedPaths.includes("*") ||
          changedPaths.some((p) => p.startsWith("user") || p.startsWith("general"))
        ) {
          this.userPanel.render();
        }
      }
    );

    this._unsubSlotController ??= SlotController.on(SlotEvent.STATE_CHANGED, () => {
      this.webviewPanel.applyGating(SettingsManager.getSnapshot(), ["*"]);
      this.sceneController.syncScene();
    });
  }

  setupEventListeners(): void {
    try {
      ["ai1", "ai2"].forEach((u) => {
        const btn = document.getElementById(`${u}-toggle-btn`);
        if (btn) {
          btn.addEventListener("click", () => {
            void (async (): Promise<void> => {
              if (AppState.isConnected(u) === true) await this.disconnectUser(u);
              else await this.connectUser(u);
            })();
          });
        }
      });
    } catch (error) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.eventListenerSetupError", { message: getErrorMessage(error) })
      );
    }
  }

  setupI18nBindings(): void {
    this._unsubI18n ??= AppI18n.subscribe(() => {
      this.applyTranslatedUi();
    });

    this.applyTranslatedUi();
  }

  applyTranslatedUi(): void {
    applyEntranceStaticTranslations();
    this.userPanel.render();
    this.accountPanel.render();
    this.slotPanelAi1.render();
    this.slotPanelAi2.render();
    this.webviewPanel.onLocaleChanged();
    this.sceneController.syncScene();
    this.updateUI();
  }

  async loadUserSettings(): Promise<void> {
    try {
      const settings = await SettingsManager.load();
      this.applySettingsToUI(settings, ["*"] as string[]);
    } catch (error) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.settingsLoadError", { message: getErrorMessage(error) })
      );
    }
  }

  shouldAutoConnectUs1(settings: AppSettings): boolean {
    const us1Slot = settings.us1Slot;
    return (
      AppState.hasUs1Identity() === true &&
      us1Slot?.rememberConnectionStatus === true &&
      us1Slot.lastConnectionState === "connected"
    );
  }

  async applyUs1RememberedConnectionPreference(): Promise<void> {
    if (this.us1ConnectionPreferenceApplied) {
      return;
    }
    this.us1ConnectionPreferenceApplied = true;

    const settings = SettingsManager.getSnapshot();
    const shouldAutoConnect = this.shouldAutoConnectUs1(settings);
    const hasStaleConnectedState = settings.us1Slot?.connectionState === "connected";

    if (hasStaleConnectedState) {
      await SettingsManager.save({
        ...settings,
        us1Slot: {
          ...settings.us1Slot,
          connectionState: "disconnected",
        },
      });
    }

    if (!shouldAutoConnect) {
      return;
    }

    const toggleBtn = document.getElementById("us1-toggle-btn") as HTMLButtonElement | null;
    if (!toggleBtn || toggleBtn.disabled || AppState.isUs1Connected() === true) {
      return;
    }

    queueMicrotask(() => {
      toggleBtn.click();
    });
  }

  applySettingsToUI(_settings: AppSettings, _changedPaths: string[] = []): void {
    const ai1Nickname = AppState.getNickname("ai1");
    const ai2Nickname = AppState.getNickname("ai2");
    const us1Nickname = AppState.getNickname("us1");

    const ai1NickEl = document.getElementById("ai1-nickname");
    const ai2NickEl = document.getElementById("ai2-nickname");
    const us1NickEl = document.getElementById("us1-nickname");

    if (ai1NickEl) ai1NickEl.textContent = ai1Nickname;
    if (ai2NickEl) ai2NickEl.textContent = ai2Nickname;
    if (us1NickEl) us1NickEl.textContent = us1Nickname;

    const getAvatar = (provider: string): string => AppState.getAvatar(provider);
    void this.updateAvatar("user", getAvatar("user"));
    void this.updateAvatar("ai1", getAvatar("ai1"));
    void this.updateAvatar("ai2", getAvatar("ai2"));
    void this.updateAvatar("us1", getAvatar("us1"));

    this.updateUI();
  }

  async updateAvatar(userType: string, avatarPath: string | null): Promise<void> {
    const avatarElement = document.getElementById(`${userType}-avatar`);
    if (!avatarElement) return;

    const clearAvatar = (): void => {
      avatarElement.replaceChildren();
      avatarElement.style.removeProperty("--avatar-image");
    };

    const renderAvatarImage = (src: string, alt: string): void => {
      const image = document.createElement("img");
      image.className = "img-cover";
      image.alt = alt;
      image.src = src;
      image.style.borderRadius = "inherit";
      avatarElement.replaceChildren(image);
      avatarElement.style.removeProperty("--avatar-image");
    };

    const electronApi = window.electronAPI;
    const readFile = electronApi?.["readFile"] as
      ((path: string) => Promise<string | null>) | undefined;
    if (typeof readFile !== "function") {
      clearAvatar();
      return;
    }

    const isUser = userType === "user";
    const isUs1 = userType === "us1";
    const isSlotEmpty =
      !isUser &&
      (isUs1 ? AppState.hasUs1Identity() === false : AppState.getAccountForSlot(userType) === null);

    if (isSlotEmpty) {
      clearAvatar();
      return;
    }

    const normalizedPath = (avatarPath ?? "").trim();
    const fallbackCandidates: string[] = [];
    if (!isUser) {
      const providerId = isUs1 ? "" : (AppState.getProviderIdForSlot(userType) ?? "");
      if (providerId !== "") {
        fallbackCandidates.push(`src/assets/${providerId}.png`);
      }
      fallbackCandidates.push("src/assets/default.png");
    }

    const candidates = isUser
      ? [normalizedPath, "src/assets/user.png", "src/assets/default.png"]
      : [normalizedPath, ...fallbackCandidates];

    const uniqueCandidates = candidates.filter(
      (candidate, index, arr) => candidate !== "" && arr.indexOf(candidate) === index
    );

    try {
      const tryLoadCandidate = async (index: number): Promise<boolean> => {
        const candidate = uniqueCandidates[index];
        if (candidate === undefined) {
          return false;
        }

        const imageData = await readFile(candidate);
        if (typeof imageData !== "string" || imageData === "") {
          return await tryLoadCandidate(index + 1);
        }

        const mimeType = getMimeTypeFromPath(candidate);
        renderAvatarImage(`data:${mimeType};base64,${imageData}`, `${userType} avatar`);
        return true;
      };

      const loaded = await tryLoadCandidate(0);
      if (!loaded) {
        clearAvatar();
      }
    } catch (error) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.avatarLoadError", {
          message: getErrorMessage(error),
        }),
        {
          context: { userType },
        }
      );

      clearAvatar();
    }
  }

  async connectUser(userType: string): Promise<void> {
    const settings = await SettingsManager.load();
    const currentlyConnected = AppState.isConnected(userType) === true;

    if (currentlyConnected) return;
    if (userType === "user") return;

    const toggleBtn = document.getElementById(`${userType}-toggle-btn`) as HTMLButtonElement | null;
    const nickname = AppState.getNickname(userType);
    const slotLabel = userType.toUpperCase();

    if (toggleBtn) {
      ButtonStates.setLoading(toggleBtn, entranceT("slot.connecting"));
    }

    Logger.info(LogCategory.ENTRANCE, entranceT("logs.slotConnecting", { name: nickname }));

    const accountId = settings.slots[userType]?.accountId;
    const hasAccount = accountId !== undefined && accountId !== null && accountId !== "";
    if (!hasAccount) {
      if (toggleBtn) {
        ButtonStates.setError(toggleBtn, entranceT("slot.missingAccount"), 1500);
      }
      this.updateUserStatus(userType);
      Logger.warn(LogCategory.ENTRANCE, entranceT("logs.slotConnectBlocked", { slot: slotLabel }));
      notifyUser({
        kind: "warning",
        title: entranceT("logs.slotConnectBlocked", { slot: slotLabel }),
        dedupeKey: `slot:${userType}:connection`,
      });
      return;
    }

    const resumeUrl = this.getResumeUrlForSlot(userType, settings);
    const result = await CoreEngine.setConnection(userType, true, {
      ...(resumeUrl !== "" ? { url: resumeUrl } : {}),
    });

    if (result.success) {
      if (toggleBtn) {
        ButtonStates.setSuccess(toggleBtn, entranceT("slot.connected"), 1500);
      }
      Logger.info(LogCategory.ENTRANCE, entranceT("logs.slotConnected", { name: nickname }));
      notifyUser({
        kind: "success",
        title: entranceT("logs.slotConnected", { name: nickname }),
        dedupeKey: `slot:${userType}:connection`,
      });
      await this.updateRememberedConnectionState(userType as "ai1" | "ai2", "connected");
    } else {
      const errorMessage = result.message ?? entranceT("logs.unknownMessage");
      if (toggleBtn) {
        ButtonStates.setError(toggleBtn, entranceT("slot.connectError"), 1500);
      }
      Logger.panel(
        LogCategory.ENTRANCE,
        LogLevel.ERROR,
        entranceT("logs.slotConnectError", {
          name: nickname,
          message: errorMessage,
        })
      );
      notifyUser({
        kind: "error",
        title: entranceT("logs.slotConnectError", {
          name: nickname,
          message: errorMessage,
        }),
        dedupeKey: `slot:${userType}:connection`,
      });
    }

    setTimeout(() => {
      this.updateUserStatus(userType);
    }, 1600);
  }

  getResumeUrlForSlot(userType: string, settings: AppSettings): string {
    if (userType !== "ai1" && userType !== "ai2") {
      return "";
    }

    const slotSettings = settings.slots[userType];
    if (slotSettings.resumeLastSession !== true) {
      return "";
    }

    const accountId = slotSettings.accountId;
    if (accountId === null || accountId === "") {
      return "";
    }

    const account = settings.accounts.find((item) => item.id === accountId);
    const lastSessionUrl = account?.lastSessionUrl;
    if (typeof lastSessionUrl !== "string" || lastSessionUrl === "") {
      return "";
    }

    return lastSessionUrl;
  }

  async disconnectUser(userType: string): Promise<void> {
    if (userType === "user") return;
    const currentlyConnected = AppState.isConnected(userType) === true;
    if (!currentlyConnected) return;

    const toggleBtn = document.getElementById(`${userType}-toggle-btn`) as HTMLButtonElement | null;
    const nickname = AppState.getNickname(userType);

    if (toggleBtn) {
      ButtonStates.setLoading(toggleBtn, entranceT("slot.disconnecting"));
    }

    Logger.debug(LogCategory.ENTRANCE, entranceT("logs.slotDisconnecting", { name: nickname }));

    const result = await CoreEngine.setConnection(userType, false, {});

    if (result.success) {
      if (toggleBtn) {
        ButtonStates.setSuccess(toggleBtn, entranceT("slot.disconnected"), 1500);
      }
      Logger.panel(
        LogCategory.ENTRANCE,
        LogLevel.INFO,
        entranceT("logs.slotDisconnected", { name: nickname })
      );
      notifyUser({
        kind: "info",
        title: entranceT("logs.slotDisconnected", { name: nickname }),
        dedupeKey: `slot:${userType}:connection`,
      });
      await this.updateRememberedConnectionState(userType as "ai1" | "ai2", "disconnected");
    } else {
      const errorMessage = result.message ?? entranceT("logs.unknownMessage");
      if (toggleBtn) {
        ButtonStates.setError(toggleBtn, entranceT("slot.connectError"), 1500);
      }
      Logger.panel(
        LogCategory.ENTRANCE,
        LogLevel.ERROR,
        entranceT("logs.slotDisconnectError", {
          name: nickname,
          message: errorMessage,
        })
      );
      notifyUser({
        kind: "error",
        title: entranceT("logs.slotDisconnectError", {
          name: nickname,
          message: errorMessage,
        }),
        dedupeKey: `slot:${userType}:connection`,
      });
    }

    setTimeout(() => {
      this.updateUserStatus(userType);
    }, 1600);
  }

  updateUserStatus(userType: string): void {
    const statusDot = document.getElementById(`${userType}-status-dot`);
    const statusText = document.getElementById(`${userType}-status-text`);
    const toggleBtn = document.getElementById(`${userType}-toggle-btn`);
    const avatarEl = document.getElementById(`${userType}-avatar`);

    if (userType === "user") {
      avatarEl?.classList.remove("is-dimmed");
      return;
    }

    const hasAccount = !!AppState.getAccountForSlot(userType);
    const connected = AppState.isConnected(userType) === true;

    avatarEl?.classList.toggle("is-dimmed", hasAccount && !connected);

    if (statusDot instanceof HTMLElement) {
      statusDot.classList.remove("is-connected", "is-warning");
      if (hasAccount && connected) {
        statusDot.classList.add("is-connected");
      } else if (hasAccount) {
        statusDot.classList.add("is-warning");
      }
    }

    if (statusText) {
      statusText.textContent = !hasAccount
        ? entranceT("slot.status.noAccount")
        : connected
          ? entranceT("slot.status.connected")
          : entranceT("slot.status.disconnected");
    }

    if (toggleBtn) {
      const btn = toggleBtn as HTMLButtonElement;
      if (!hasAccount) {
        btn.textContent = entranceT("slot.selectAccount");
        btn.disabled = true;
      } else if (connected) {
        btn.textContent = entranceT("slot.disconnect");
        btn.disabled = false;
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
      } else {
        btn.textContent = entranceT("slot.connect");
        btn.disabled = false;
        btn.classList.remove("btn-secondary");
        btn.classList.add("btn-primary");
      }
    }
  }

  updateUI(): void {
    ["user", "ai1", "ai2"].forEach((userType) => {
      this.updateUserStatus(userType);
    });
    this.us1Panel.render();
  }

  async onShow(): Promise<void> {
    await this.loadUserSettings();
    this.sceneController.onShow();
    this.updateUI();
  }

  onHide(): void {
    this.sceneController.onHide();
    CoreEngine.resumeWhispers(true);
  }

  async updateRememberedConnectionState(
    slotId: "ai1" | "ai2",
    state: "connected" | "disconnected"
  ): Promise<void> {
    const settings = SettingsManager.getSnapshot();
    const slotSettings = settings.slots[slotId];

    if (slotSettings.rememberConnectionStatus !== true) {
      return;
    }
    if (slotSettings.lastConnectionState === state) {
      return;
    }

    await SettingsManager.save({
      ...settings,
      slots: {
        ...settings.slots,
        [slotId]: {
          ...slotSettings,
          lastConnectionState: state,
        },
      },
    });
  }

  shouldAutoConnectSlot(slotId: "ai1" | "ai2", settings: AppSettings): boolean {
    const slotSettings = settings.slots[slotId];
    const accountId = slotSettings.accountId;
    const hasAssignedAccount = typeof accountId === "string" && accountId !== "";

    return (
      hasAssignedAccount &&
      slotSettings.rememberConnectionStatus === true &&
      slotSettings.lastConnectionState === "connected"
    );
  }

  applyDefaultConnections(): void {
    this.defaultsApplied = true;
    const settings = SettingsManager.getSnapshot();

    (["ai1", "ai2"] as const).forEach((slotId) => {
      if (!this.shouldAutoConnectSlot(slotId, settings)) {
        return;
      }
      if (AppState.isConnected(slotId) === true) {
        return;
      }

      const hasRegisteredWebview = SlotController.getWebview(slotId) !== null;
      if (!hasRegisteredWebview) {
        return;
      }

      const toggleBtn = document.getElementById(`${slotId}-toggle-btn`) as HTMLButtonElement | null;
      if (!toggleBtn || toggleBtn.disabled) {
        return;
      }

      queueMicrotask(() => {
        toggleBtn.click();
      });
    });
  }

  formatLogCategory(category: string): string {
    if (category === "") return entranceT("logs.systemCategory");

    const cleaned = category
      .replace(/^(WEBVIEW|SLOT|TRAFFIC|ASISTAN|OPENCODE|DATABASE)_/, "$1: ")
      .replace(/_/g, " ")
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return cleaned;
  }

  // NOTE: Escape HTML to prevent XSS.
  escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  setupLiveLogOverlay(): void {
    setupSettingsLiveLogOverlay({
      formatLogCategory: this.formatLogCategory.bind(this),
      escapeHtml: this.escapeHtml.bind(this),
    });
  }
}
