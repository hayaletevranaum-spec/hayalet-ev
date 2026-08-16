import { AppI18n } from "../../../modules/i18n/index.js";
import { AppState } from "../../../modules/app-state.js";
import { SlotController } from "../../../modules/slot-controller.js";
import { WebviewManager } from "../../../modules/webview-manager.js";
import { ConversationListManager } from "../../../modules/conversation-list-manager.js";
import { SettingsManager } from "../../../modules/settings-manager.js";
import { t as entranceT } from "../i18n.js";

import type { SlotPanel } from "../slot-panel.js";
import type { Us1Panel } from "../../settings/accounts/us1-panel.js";
import type { WebviewPanel } from "../webview-panel.js";
import type { SceneCharacterDescriptor } from "../../../scene/characters/index.js";

import { resolveSceneAiConnectSlot } from "./scene-connect-actions.js";

type AiSlotId = "ai1" | "ai2";
type ScenePreferenceKey = "catchCommands" | "resumeLastSession" | "rememberConnectionStatus";

type SceneMenuTone = "primary" | "secondary" | "ghost";

export type SceneMenuActionId =
  "connect" | "manualRefresh" | "providerTest" | "providerSync" | "devtools";
export type SceneMenuSelectId =
  | "session"
  | "binding"
  | "communicationSystem"
  | "assistantProvider"
  | "messageMethod"
  | "fileMethod";
export type SceneMenuToggleId = ScenePreferenceKey;

export interface SceneCharacterMenuOption {
  value: string;
  label: string;
  disabled: boolean;
}

export interface SceneCharacterMenuActionState {
  id: SceneMenuActionId;
  label: string;
  disabled: boolean;
  reason: string | null;
  tone: SceneMenuTone;
}

export interface SceneCharacterMenuToggleState {
  id: SceneMenuToggleId;
  label: string;
  checked: boolean;
  disabled: boolean;
  reason: string | null;
}

export interface SceneCharacterMenuSelectState {
  id: SceneMenuSelectId;
  label: string;
  value: string;
  options: SceneCharacterMenuOption[];
  disabled: boolean;
  reason: string | null;
}

export interface SceneCharacterMenuAdvancedState {
  summary: string;
  selects: SceneCharacterMenuSelectState[];
  actions: SceneCharacterMenuActionState[];
}

export interface SceneCharacterMenuState {
  label: string;
  subtitle: string;
  quickActions: SceneCharacterMenuActionState[];
  controls: SceneCharacterMenuSelectState[];
  preferences: SceneCharacterMenuToggleState[];
  advanced: SceneCharacterMenuAdvancedState | null;
}

interface SceneEntranceBridgeDeps {
  slotPanels: Record<AiSlotId, SlotPanel>;
  us1Panel: Us1Panel;
  webviewPanel: WebviewPanel;
  connectUser: (slot: AiSlotId) => Promise<void>;
  disconnectUser: (slot: AiSlotId) => Promise<void>;
}

interface NativeSelectSnapshot {
  value: string;
  disabled: boolean;
  options: SceneCharacterMenuOption[];
}

function isTurkishLocale(): boolean {
  return AppI18n.getLocale().startsWith("tr");
}

function formatSlotLabel(slot: string): string {
  return slot.toUpperCase();
}

function isAiSlotId(value: string | null): value is AiSlotId {
  return value === "ai1" || value === "ai2";
}

function normalizeSlotValue(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveUs1SlotAssignment(character: SceneCharacterDescriptor): {
  assigned: boolean;
  matchesCharacter: boolean;
} {
  const us1Presence = AppState.getEntityPresence("us1");
  const selectedAccountId = normalizeSlotValue(us1Presence.accountId);
  const selectedRemoteUserId = normalizeSlotValue(us1Presence.remoteUserId);
  const characterAccountId = normalizeSlotValue(character.accountId);
  const characterRemoteUserId = normalizeSlotValue(character.remoteUserId);
  const assigned = selectedAccountId !== "" || selectedRemoteUserId !== "";
  const matchesCharacter =
    (selectedAccountId !== "" &&
      characterAccountId !== "" &&
      selectedAccountId === characterAccountId) ||
    (selectedRemoteUserId !== "" &&
      characterRemoteUserId !== "" &&
      selectedRemoteUserId === characterRemoteUserId);
  return { assigned, matchesCharacter };
}

function getManualRefreshLabel(): string {
  return isTurkishLocale() ? "Manuel refresh" : "Manual refresh";
}

function getSessionLabel(): string {
  return isTurkishLocale() ? "Session seçimi" : "Session";
}

function getAssignedSlotSubtitle(slot: string): string {
  return isTurkishLocale() ? `${formatSlotLabel(slot)} slotu` : `${formatSlotLabel(slot)} slot`;
}

function getPendingSlotSubtitle(slot: string): string {
  return isTurkishLocale()
    ? `Bağlanınca ${formatSlotLabel(slot)} slotu kullanılacak.`
    : `${formatSlotLabel(slot)} will be used after connect.`;
}

function getNoAvailableSlotReason(): string {
  return isTurkishLocale() ? "Uygun boş AI slotu yok." : "No available AI slot.";
}

function getUs1SlotOccupiedReason(): string {
  return isTurkishLocale() ? "US1 slotu dolu." : "US1 slot is already occupied.";
}

function getConnectFirstReason(): string {
  return isTurkishLocale() ? "Bu işlem için önce bağlan." : "Connect first to use this action.";
}

function getRefreshUnavailableReason(): string {
  return isTurkishLocale()
    ? "Manuel refresh için önce bağlantı gerekli."
    : "Connection is required before manual refresh.";
}

function getUnavailableReason(): string {
  return isTurkishLocale()
    ? "Bu aksiyon şu an kullanılamıyor."
    : "This action is unavailable right now.";
}

function getAssistantSubtitle(selectedProviderLabel: string | null): string {
  if (selectedProviderLabel !== null && selectedProviderLabel.trim() !== "") {
    return selectedProviderLabel;
  }

  return isTurkishLocale() ? "AI0 assistant slotu" : "AI0 assistant slot";
}

function getUserSubtitle(): string {
  return isTurkishLocale() ? "Yerel kullanıcı karakteri" : "Local user character";
}

function getAdvancedSummary(): string {
  return isTurkishLocale() ? "Provider ve slot araçları" : "Provider and slot tools";
}

function readSelectSnapshot(selectId: string): NativeSelectSnapshot | null {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (select === null) {
    return null;
  }

  return {
    value: select.value,
    disabled: select.disabled,
    options: Array.from(select.options).map((option) => {
      const text = option.textContent.trim();
      return {
        value: option.value,
        label: text !== "" ? text : option.label,
        disabled: option.disabled,
      };
    }),
  };
}

function readCheckboxState(inputId: string): boolean | null {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  return input?.checked ?? null;
}

function readButtonDisabled(buttonId: string): boolean | null {
  const button = document.getElementById(buttonId) as HTMLButtonElement | null;
  return button?.disabled ?? null;
}

function readButtonLabel(buttonId: string, fallback: string): string {
  const button = document.getElementById(buttonId) as HTMLButtonElement | null;
  const title = button?.title.trim() ?? "";
  if (title !== "") {
    return title;
  }

  const text = button?.textContent.trim() ?? "";
  return text !== "" ? text : fallback;
}

function clickButton(buttonId: string): boolean {
  const button = document.getElementById(buttonId) as HTMLButtonElement | null;
  if (button === null || button.disabled) {
    return false;
  }

  button.click();
  return true;
}

function dispatchNativeChange(selectId: string, value: string): boolean {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (select === null) {
    return false;
  }

  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function dispatchCheckboxChange(inputId: string, checked: boolean): boolean {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (input === null || input.disabled) {
    return false;
  }

  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function buildSelectState(
  id: SceneMenuSelectId,
  label: string,
  snapshot: NativeSelectSnapshot | null,
  options: { disabled: boolean; reason: string | null }
): SceneCharacterMenuSelectState {
  return {
    id,
    label,
    value: snapshot?.value ?? "",
    options: snapshot?.options ?? [],
    disabled: options.disabled || snapshot?.disabled === true,
    reason: options.disabled || snapshot?.disabled === true ? options.reason : null,
  };
}

function buildToggleState(
  id: SceneMenuToggleId,
  label: string,
  checked: boolean,
  disabled = false,
  reason: string | null = null
): SceneCharacterMenuToggleState {
  return {
    id,
    label,
    checked,
    disabled,
    reason,
  };
}

function buildActionState(
  id: SceneMenuActionId,
  label: string,
  tone: SceneMenuTone,
  disabled = false,
  reason: string | null = null
): SceneCharacterMenuActionState {
  return {
    id,
    label,
    tone,
    disabled,
    reason,
  };
}

export class SceneEntranceBridge {
  slotPanels: Record<AiSlotId, SlotPanel>;
  us1Panel: Us1Panel;
  webviewPanel: WebviewPanel;
  connectUser: (slot: AiSlotId) => Promise<void>;
  disconnectUser: (slot: AiSlotId) => Promise<void>;

  constructor(deps: SceneEntranceBridgeDeps) {
    this.slotPanels = deps.slotPanels;
    this.us1Panel = deps.us1Panel;
    this.webviewPanel = deps.webviewPanel;
    this.connectUser = deps.connectUser;
    this.disconnectUser = deps.disconnectUser;
  }

  getMenuState(character: SceneCharacterDescriptor): SceneCharacterMenuState {
    if (character.kind === "us1") {
      return this.getUs1MenuState(character);
    }
    if (character.kind === "assistant") {
      return this.getAssistantMenuState(character);
    }
    if (character.kind === "user") {
      return this.getUserMenuState(character);
    }
    return this.getAiMenuState(character);
  }

  async triggerAction(
    character: SceneCharacterDescriptor,
    actionId: SceneMenuActionId
  ): Promise<void> {
    if (character.kind === "user") {
      return;
    }

    if (character.kind === "assistant") {
      this.triggerAssistantAction(actionId);
      return;
    }

    if (character.kind === "us1") {
      if (actionId === "connect") {
        const assignment = resolveUs1SlotAssignment(character);
        const connected = this.us1Panel.getSceneState().connected;

        if (connected === false) {
          if (assignment.assigned && assignment.matchesCharacter === false) {
            return;
          }

          const candidateAccountId = normalizeSlotValue(character.accountId);
          if (assignment.assigned === false && candidateAccountId !== "") {
            await this.us1Panel.selectSceneBinding(candidateAccountId);
          }
        }

        await this.us1Panel.toggleSceneConnection();
      } else if (actionId === "manualRefresh") {
        await ConversationListManager.handleUs1Refresh();
      }
      return;
    }

    await this.triggerAiAction(character, actionId);
  }

  async updateSelect(
    character: SceneCharacterDescriptor,
    selectId: SceneMenuSelectId,
    value: string
  ): Promise<void> {
    if (character.kind === "assistant") {
      if (selectId === "assistantProvider") {
        dispatchNativeChange("assistant-provider-select", value);
      }
      return;
    }

    if (character.kind === "us1") {
      if (selectId === "binding") {
        await this.us1Panel.selectSceneBinding(value !== "" ? value : null);
      } else if (selectId === "communicationSystem") {
        await this.us1Panel.updateCommunicationSystem(
          value === "relay-e2ee" ? "relay-e2ee" : "mail"
        );
      } else if (selectId === "session") {
        dispatchNativeChange("conversation-us1", value);
      }
      return;
    }

    if (character.kind !== "ai") {
      return;
    }

    const slot = this.getAssignedAiSlot(character);
    if (selectId === "session") {
      if (slot !== null) {
        dispatchNativeChange(`conversation-${slot}`, value);
      }
      return;
    }

    if (slot === null) {
      return;
    }

    if (selectId === "messageMethod") {
      await this.slotPanels[slot].updateSetting("messageMethod", value);
    } else if (selectId === "fileMethod") {
      await this.slotPanels[slot].updateSetting("fileMethod", value);
    }
  }

  async updateToggle(
    character: SceneCharacterDescriptor,
    toggleId: SceneMenuToggleId,
    checked: boolean
  ): Promise<void> {
    if (character.kind === "assistant") {
      if (toggleId === "catchCommands") {
        dispatchCheckboxChange("assistant-catch-commands-check", checked);
      } else if (toggleId === "resumeLastSession") {
        dispatchCheckboxChange("assistant-resume-last-session", checked);
      }
      return;
    }

    if (character.kind === "us1") {
      await this.us1Panel.updateScenePreferences({ [toggleId]: checked });
      return;
    }

    if (character.kind !== "ai") {
      return;
    }

    const slot = this.getAssignedAiSlot(character);
    if (slot === null) {
      return;
    }

    await this.slotPanels[slot].updateSetting(toggleId, checked);
  }

  private async triggerAiAction(
    character: SceneCharacterDescriptor,
    actionId: SceneMenuActionId
  ): Promise<void> {
    if (actionId === "connect") {
      const resolution = resolveSceneAiConnectSlot(character.accountId);
      const slot = resolution.slot;
      if (slot === null) {
        return;
      }

      if (resolution.mode === "assigned" && AppState.isConnected(slot) === true) {
        await this.disconnectUser(slot);
        return;
      }

      if (
        character.accountId !== null &&
        AppState.getEntityPresence(slot).accountId !== character.accountId
      ) {
        await this.slotPanels[slot].updateSetting("accountId", character.accountId);
      }

      await this.connectUser(slot);
      return;
    }

    const slot = this.getAssignedAiSlot(character);
    if (!isAiSlotId(slot)) {
      return;
    }

    if (actionId === "manualRefresh") {
      await WebviewManager.syncProvider(slot, { from: "manual" });
      return;
    }

    if (actionId === "providerTest") {
      this.webviewPanel.handleTestClick(slot);
    } else if (actionId === "providerSync") {
      this.webviewPanel.handleSyncClick(slot);
    } else {
      this.webviewPanel.openDevTools(slot);
    }
  }

  private triggerAssistantAction(actionId: SceneMenuActionId): void {
    if (actionId === "connect") {
      clickButton("assistant-connect-btn");
      return;
    }

    if (actionId === "providerTest") {
      clickButton("ai0-test-btn");
      return;
    }

    if (actionId === "devtools") {
      clickButton("assistant-devtools-btn");
    }
  }

  private getAiMenuState(character: SceneCharacterDescriptor): SceneCharacterMenuState {
    const settings = SettingsManager.getSnapshot();
    const resolution = resolveSceneAiConnectSlot(character.accountId);
    const assignedSlot = resolution.mode === "assigned" ? resolution.slot : null;
    const slot = resolution.slot;
    const connected = assignedSlot !== null ? AppState.isConnected(assignedSlot) === true : false;
    const controlsReason =
      assignedSlot !== null
        ? null
        : slot !== null
          ? getPendingSlotSubtitle(slot)
          : getNoAvailableSlotReason();
    const sessionSnapshot =
      assignedSlot !== null ? readSelectSnapshot(`conversation-${assignedSlot}`) : null;
    const messageMethodSnapshot =
      assignedSlot !== null ? readSelectSnapshot(`${assignedSlot}-msg-method`) : null;
    const fileMethodSnapshot =
      assignedSlot !== null ? readSelectSnapshot(`${assignedSlot}-file-method`) : null;
    const refreshButtonDisabled =
      assignedSlot !== null ? readButtonDisabled(`conversation-refresh-${assignedSlot}`) : null;
    const providerTestButtonDisabled =
      assignedSlot !== null ? readButtonDisabled(`${assignedSlot}-test-btn`) : null;
    const providerSyncButtonDisabled =
      assignedSlot !== null ? readButtonDisabled(`${assignedSlot}-sync-btn`) : null;
    const devtoolsButtonDisabled =
      assignedSlot !== null ? SlotController.getWebview(assignedSlot) === null : true;

    const controls: SceneCharacterMenuSelectState[] = [
      buildSelectState("session", getSessionLabel(), sessionSnapshot, {
        disabled: assignedSlot === null || connected === false,
        reason: assignedSlot === null ? controlsReason : getConnectFirstReason(),
      }),
    ];

    const preferences: SceneCharacterMenuToggleState[] = [
      buildToggleState(
        "catchCommands",
        entranceT("slot.catchLabel"),
        assignedSlot !== null ? settings.slots[assignedSlot].catchCommands === true : false,
        assignedSlot === null,
        controlsReason
      ),
      buildToggleState(
        "resumeLastSession",
        entranceT("slot.resumeLabel"),
        assignedSlot !== null ? settings.slots[assignedSlot].resumeLastSession !== false : false,
        assignedSlot === null,
        controlsReason
      ),
      buildToggleState(
        "rememberConnectionStatus",
        entranceT("slot.rememberLabel"),
        assignedSlot !== null
          ? settings.slots[assignedSlot].rememberConnectionStatus === true
          : false,
        assignedSlot === null,
        controlsReason
      ),
    ];

    const advanced: SceneCharacterMenuAdvancedState = {
      summary: getAdvancedSummary(),
      selects: [
        buildSelectState("messageMethod", entranceT("slot.messageLabel"), messageMethodSnapshot, {
          disabled: assignedSlot === null || messageMethodSnapshot === null,
          reason: assignedSlot === null ? controlsReason : getUnavailableReason(),
        }),
        buildSelectState("fileMethod", entranceT("slot.fileLabel"), fileMethodSnapshot, {
          disabled: assignedSlot === null || fileMethodSnapshot === null,
          reason: assignedSlot === null ? controlsReason : getUnavailableReason(),
        }),
      ],
      actions: [
        buildActionState(
          "providerTest",
          readButtonLabel(
            assignedSlot !== null ? `${assignedSlot}-test-btn` : "ai1-test-btn",
            entranceT("slot.providerTestTitle")
          ),
          "ghost",
          assignedSlot === null || providerTestButtonDisabled !== false,
          assignedSlot === null ? controlsReason : getConnectFirstReason()
        ),
        buildActionState(
          "providerSync",
          readButtonLabel(
            assignedSlot !== null ? `${assignedSlot}-sync-btn` : "ai1-sync-btn",
            entranceT("slot.providerSyncTitle")
          ),
          "ghost",
          assignedSlot === null || providerSyncButtonDisabled !== false,
          assignedSlot === null ? controlsReason : getConnectFirstReason()
        ),
        buildActionState(
          "devtools",
          readButtonLabel(
            assignedSlot !== null ? `${assignedSlot}-devtools-btn` : "ai1-devtools-btn",
            entranceT("slot.devtoolsTitle")
          ),
          "ghost",
          assignedSlot === null || devtoolsButtonDisabled !== false,
          assignedSlot === null ? controlsReason : getUnavailableReason()
        ),
      ],
    };

    return {
      label: character.label,
      subtitle:
        assignedSlot !== null
          ? getAssignedSlotSubtitle(assignedSlot)
          : slot !== null
            ? getPendingSlotSubtitle(slot)
            : getNoAvailableSlotReason(),
      quickActions: [
        buildActionState(
          "connect",
          connected ? entranceT("slot.disconnect") : entranceT("slot.connect"),
          connected ? "secondary" : "primary",
          connected === false && slot === null,
          connected === false && slot === null ? getNoAvailableSlotReason() : null
        ),
        buildActionState(
          "manualRefresh",
          getManualRefreshLabel(),
          "ghost",
          assignedSlot === null || connected === false || refreshButtonDisabled === true,
          assignedSlot === null
            ? controlsReason
            : connected === false || refreshButtonDisabled === true
              ? getRefreshUnavailableReason()
              : null
        ),
      ],
      controls,
      preferences,
      advanced,
    };
  }

  private getUs1MenuState(character: SceneCharacterDescriptor): SceneCharacterMenuState {
    const sceneState = this.us1Panel.getSceneState();
    const assignment = resolveUs1SlotAssignment(character);
    const slotOccupiedByOther = assignment.assigned && assignment.matchesCharacter === false;
    const canAutoAssign =
      assignment.assigned === false && normalizeSlotValue(character.accountId) !== "";
    const canConnect = sceneState.connected || sceneState.canConnect || canAutoAssign;
    const connectDisabled =
      sceneState.connected === false && (slotOccupiedByOther || canConnect === false);
    const connectDisabledReason =
      sceneState.connected === false && connectDisabled
        ? slotOccupiedByOther
          ? getUs1SlotOccupiedReason()
          : sceneState.connectDisabledReason
        : null;
    const sessionSnapshot = readSelectSnapshot("conversation-us1");
    const bindingSnapshot = readSelectSnapshot("us1-identity-select");
    const communicationSystemSnapshot = readSelectSnapshot("us1-communication-system-select");
    const refreshButtonDisabled = readButtonDisabled("conversation-refresh-us1");
    const selectedBindingLabel =
      bindingSnapshot?.options.find((option) => option.value === bindingSnapshot.value)?.label ??
      character.label;

    return {
      label: character.label,
      subtitle: selectedBindingLabel,
      quickActions: [
        buildActionState(
          "connect",
          sceneState.connected ? entranceT("slot.disconnect") : entranceT("slot.connect"),
          sceneState.connected ? "secondary" : "primary",
          connectDisabled,
          connectDisabledReason
        ),
        buildActionState(
          "manualRefresh",
          getManualRefreshLabel(),
          "ghost",
          sceneState.connected === false || refreshButtonDisabled === true,
          sceneState.connected === false || refreshButtonDisabled === true
            ? getRefreshUnavailableReason()
            : null
        ),
      ],
      controls: [
        buildSelectState("binding", entranceT("us1.selectLabel"), bindingSnapshot, {
          disabled: false,
          reason: sceneState.connectDisabledReason,
        }),
        buildSelectState(
          "communicationSystem",
          entranceT("us1.communicationSystem.label"),
          communicationSystemSnapshot,
          {
            disabled: false,
            reason: null,
          }
        ),
        buildSelectState("session", getSessionLabel(), sessionSnapshot, {
          disabled: sceneState.connected === false,
          reason: getConnectFirstReason(),
        }),
      ],
      preferences: [
        buildToggleState("catchCommands", entranceT("us1.catchLabel"), sceneState.catchCommands),
        buildToggleState(
          "resumeLastSession",
          entranceT("slot.resumeLabel"),
          sceneState.resumeLastSession
        ),
        buildToggleState(
          "rememberConnectionStatus",
          entranceT("slot.rememberLabel"),
          sceneState.rememberConnectionStatus
        ),
      ],
      advanced: null,
    };
  }

  private getAssistantMenuState(character: SceneCharacterDescriptor): SceneCharacterMenuState {
    const providerSnapshot = readSelectSnapshot("assistant-provider-select");
    const selectedProviderLabel =
      providerSnapshot?.options.find((option) => option.value === providerSnapshot.value)?.label ??
      null;
    const connectButtonDisabled = readButtonDisabled("assistant-connect-btn");
    const connectButtonLabel = readButtonLabel(
      "assistant-connect-btn",
      isTurkishLocale() ? "Bağlan" : "Connect"
    );
    const assistantConnected = AppState.isConnected("ai0") === true;
    const testButtonDisabled = readButtonDisabled("ai0-test-btn");
    const devtoolsButtonDisabled = readButtonDisabled("assistant-devtools-btn");

    return {
      label: character.label,
      subtitle: getAssistantSubtitle(selectedProviderLabel),
      quickActions: [
        buildActionState(
          "connect",
          connectButtonLabel,
          assistantConnected ? "secondary" : "primary",
          connectButtonDisabled === true,
          connectButtonDisabled === true ? getUnavailableReason() : null
        ),
      ],
      controls: [
        buildSelectState(
          "assistantProvider",
          isTurkishLocale() ? "Provider" : "Provider",
          providerSnapshot,
          {
            disabled: providerSnapshot?.disabled === true,
            reason: providerSnapshot?.disabled === true ? getUnavailableReason() : null,
          }
        ),
      ],
      preferences: [
        buildToggleState(
          "resumeLastSession",
          entranceT("slot.resumeLabel"),
          readCheckboxState("assistant-resume-last-session") === true
        ),
        buildToggleState(
          "catchCommands",
          entranceT("slot.catchLabel"),
          readCheckboxState("assistant-catch-commands-check") === true
        ),
      ],
      advanced: {
        summary: getAdvancedSummary(),
        selects: [],
        actions: [
          buildActionState(
            "providerTest",
            readButtonLabel("ai0-test-btn", entranceT("slot.providerTestTitle")),
            "ghost",
            testButtonDisabled !== false,
            testButtonDisabled !== false ? getUnavailableReason() : null
          ),
          buildActionState(
            "devtools",
            readButtonLabel("assistant-devtools-btn", entranceT("slot.devtoolsTitle")),
            "ghost",
            devtoolsButtonDisabled === true,
            devtoolsButtonDisabled === true ? getUnavailableReason() : null
          ),
        ],
      },
    };
  }

  private getUserMenuState(character: SceneCharacterDescriptor): SceneCharacterMenuState {
    return {
      label: character.label,
      subtitle: getUserSubtitle(),
      quickActions: [],
      controls: [],
      preferences: [],
      advanced: null,
    };
  }

  private getAssignedAiSlot(character: SceneCharacterDescriptor): AiSlotId | null {
    if (character.kind !== "ai") {
      return null;
    }

    const resolution = resolveSceneAiConnectSlot(character.accountId);
    return resolution.mode === "assigned" ? resolution.slot : null;
  }
}

export function createSceneEntranceBridge(deps: SceneEntranceBridgeDeps): SceneEntranceBridge {
  return new SceneEntranceBridge(deps);
}
