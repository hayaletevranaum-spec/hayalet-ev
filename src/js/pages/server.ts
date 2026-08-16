import { Logger } from "../modules/logger/index.js";
import type { LogEntry } from "../modules/logger/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory } from "@shared/logging-core";
import { AppState } from "../modules/app-state.js";
import { SettingsManager } from "../modules/settings-manager.js";
import { ServerCommands } from "../modules/server-commands.js";
import { AppI18n } from "../modules/i18n/index.js";
import {
  applySceneAlphaWindowBoundsToTarget,
  clearSceneAlphaWindowFrameVariables,
} from "../scene/alpha-window.js";
import { dispatchSceneAction } from "../scene/action-dispatcher.js";
import {
  applySceneDebugFlag,
  createSceneLayoutEditorAssetBindings,
  createSceneDebugRuntimeSession,
  SceneLayoutEditor,
  type SceneLayoutEditorSelection,
  getSceneDebugRoomOptions,
  isSceneDebugRoomActive,
  openSceneDebugRoom,
  subscribeSceneThemeAssetDraft,
} from "../scene-editor/index.js";
import { buildSceneCharacterRoster, resolveSceneAvatarSource } from "../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";
import {
  getSceneBackNodeForView,
  getSceneObjectNodesForView,
  resolveSceneNodeLabelText,
} from "../scene/layout/index.js";
import { navigateToScenePage, openSceneSettingsPanel } from "../scene/navigation.js";
import { getCoverSceneProjectionFromElement } from "../scene/projection.js";
import { renderSceneBackLayer } from "../scene/renderers/back-layer.js";
import { renderSceneCharacterLayer } from "../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../scene/renderers/object-layer.js";
import { syncSceneViewRuntime } from "../scene/runtime.js";
import {
  getSceneRoomBackgroundSrc,
  getSceneRoomViewPanelArtSrc,
  getSceneRoomViewPanelTransparentWindow,
  SceneThemeManager,
} from "../scene-system/index.js";
import { isSceneUiMode } from "../ui/ui-mode.js";
import { ButtonStates } from "../ui/button-states.js";
import { shellT } from "../app/shell-i18n.js";
import {
  buildCommandTestMessage,
  buildInlineCommandSnippet,
  extractExampleArgsFromDescription,
  parseCommandExecutionInput,
} from "./server-command-utils.js";
import {
  buildSettingsWithDisabledCommands,
  getCommandCatalog,
  getDisabledCommandsForSlot,
  isCommandEnabled,
  normalizeSlot,
  resolveCategoryForSlot,
  splitCommandCatalogBySource,
} from "./server/command-helpers.js";
import type {
  CommandCatalogItem,
  CommandCategory,
  CommandRunResult,
  CommandSlot,
  ServerCommandsApi,
} from "./server/types.js";
import {
  handleTimelineLogEntry,
  handleTimelineScroll,
  initializeTimeline,
  rebuildTimelineView,
} from "./server/timeline-controller.js";
import { initServerControllerPage } from "./server/init-controller.js";
import type { ServerInitContext } from "./server/init-controller.js";
import type { TimelineEvent } from "./server-timeline.js";

const TIMELINE_SESSION_BATCH = 3;
const TIMELINE_TOP_THRESHOLD = 52;

function toHeadLabel(label: string): string {
  const compact = label.replace(/\s+/g, "").trim().toUpperCase();
  const head = compact.slice(0, 2);
  return head === "" ? "?" : head;
}

function serverCommandPanelT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.commands.panel.${key}`, params);
}

function serverPageT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.server.page.${key}`, params);
}

export class ServerController {
  unsubscribeTraffic: (() => void) | null;
  logUnsubscribe: (() => void) | null;
  _unsubSettings: (() => void) | null;
  _unsubSlotController: (() => void) | null;

  commandSlotSelect: HTMLSelectElement | null;
  commandList: HTMLElement | null;
  commandDetail: HTMLTextAreaElement | null;
  commandTestArgs: HTMLInputElement | null;
  commandRunBtn: HTMLButtonElement | null;
  commandCategoryTabs: HTMLElement | null;
  activeCategory: CommandCategory;
  selectedCommand: string;
  timelineLog: HTMLElement | null;
  timelineMeta: HTMLElement | null;
  timelineEvents: Map<string, TimelineEvent>;
  timelineSessionIds: string[];
  timelineSessionCursor: number;
  timelineLoadedSessionIds: Set<string>;
  timelineLoading: boolean;
  timelineInitialized: boolean;
  _serverSceneDebugEnabled: boolean;
  _serverSceneScreenOpen: boolean;
  _serverSceneBindingsReady: boolean;
  private readonly _serverSceneSession = createSceneDebugRuntimeSession("server");
  _serverSceneEditor: SceneLayoutEditor | null;
  _serverSceneSelection: SceneLayoutEditorSelection;
  _serverSceneResizeObserver: ResizeObserver | null;
  _serverSceneCharacterRenderToken: number;
  _unsubSceneTheme: (() => void) | null;
  _unsubSceneThemeAssets: (() => void) | null;

  get _serverSceneLayout(): SceneLayoutConfig {
    return this._serverSceneSession.getSceneLayout();
  }

  set _serverSceneLayout(sceneLayout: SceneLayoutConfig) {
    this._serverSceneSession.setSceneLayout(sceneLayout);
  }

  get _serverSceneClickableTheme(): SceneClickableThemeDefinition {
    return this._serverSceneSession.getSceneClickableTheme();
  }

  set _serverSceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition) {
    this._serverSceneSession.setSceneClickableTheme(sceneClickableTheme);
  }

  constructor() {
    this.unsubscribeTraffic = null;
    this.logUnsubscribe = null;
    this._unsubSettings = null;
    this._unsubSlotController = null;

    this.commandSlotSelect = null;
    this.commandList = null;
    this.commandDetail = null;
    this.commandTestArgs = null;
    this.commandRunBtn = null;
    this.commandCategoryTabs = null;
    this.activeCategory = "ai1-ai2";
    this.selectedCommand = "";
    this.timelineLog = null;
    this.timelineMeta = null;
    this.timelineEvents = new Map();
    this.timelineSessionIds = [];
    this.timelineSessionCursor = 0;
    this.timelineLoadedSessionIds = new Set();
    this.timelineLoading = false;
    this.timelineInitialized = false;
    this._serverSceneDebugEnabled = false;
    this._serverSceneScreenOpen = false;
    this._serverSceneBindingsReady = false;
    this._serverSceneEditor = null;
    this._serverSceneSelection = null;
    this._serverSceneResizeObserver = null;
    this._serverSceneCharacterRenderToken = 0;
    this._unsubSceneTheme = null;
    this._unsubSceneThemeAssets = null;
  }

  private updateTimelineMeta(text: string): void {
    if (this.timelineMeta === null) return;
    this.timelineMeta.textContent = text;
  }

  private getServerCommandsApi(): ServerCommandsApi {
    return ServerCommands;
  }

  private normalizeSlot(value: string): CommandSlot {
    return normalizeSlot(value);
  }

  private resolveCategoryForSlot(slot: CommandSlot): CommandCategory {
    return resolveCategoryForSlot(slot);
  }

  private getSelectedCommandSlot(): CommandSlot {
    return this.normalizeSlot(this.commandSlotSelect?.value ?? "ai1");
  }

  syncCategoryWithSlot(): void {
    const slot = this.getSelectedCommandSlot();
    this.activeCategory = this.resolveCategoryForSlot(slot);
    this.updateCategoryTabs();
  }

  private updateCategoryTabs(): void {
    const buttons =
      this.commandCategoryTabs?.querySelectorAll<HTMLButtonElement>(".command-category-tab");
    buttons?.forEach((button) => {
      const category = (button.dataset["category"] ?? "") as CommandCategory;
      if (category === this.activeCategory) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  }

  private getCommandCatalog(category: CommandCategory): CommandCatalogItem[] {
    return getCommandCatalog(this.getServerCommandsApi(), category);
  }

  private getDisabledCommandsForSlot(slot: CommandSlot): string[] {
    const settings = SettingsManager.getSnapshot();
    return getDisabledCommandsForSlot(settings, slot);
  }

  private isCommandEnabled(slot: CommandSlot, commandName: string): boolean {
    return isCommandEnabled(this.getDisabledCommandsForSlot(slot), commandName);
  }

  private async saveDisabledCommands(slot: CommandSlot, disabledCommands: string[]): Promise<void> {
    const settings = SettingsManager.getSnapshot();
    const next = buildSettingsWithDisabledCommands(settings, slot, disabledCommands);
    await SettingsManager.save(next);
  }

  private async toggleCommandForSlot(
    slot: CommandSlot,
    commandName: string,
    enabled: boolean
  ): Promise<void> {
    const current = this.getDisabledCommandsForSlot(slot);
    const key = commandName.toLowerCase();
    const next = enabled
      ? current.filter((item) => item.toLowerCase() !== key)
      : [...current, commandName];
    await this.saveDisabledCommands(slot, next);
  }

  private getCommandDetailText(commandName: string): string {
    const detail = this.getServerCommandsApi().getDescriptionText(commandName);
    return detail !== "" ? detail : `${commandName}\n\n${serverCommandPanelT("detailMissing")}`;
  }

  private setCommandDetail(commandName: string): void {
    this.selectedCommand = commandName;
    if (this.commandDetail === null) {
      return;
    }

    this.commandDetail.value = this.getCommandDetailText(commandName);
  }

  private insertExampleArgs(commandName: string): void {
    this.selectedCommand = commandName;
    const detailText = this.getCommandDetailText(commandName);
    const parsedArgs = extractExampleArgsFromDescription(commandName, detailText);

    if (this.commandTestArgs !== null) {
      this.commandTestArgs.value = buildInlineCommandSnippet(commandName, parsedArgs);
    }

    if (this.commandDetail !== null) {
      this.commandDetail.value = detailText;
    }
  }

  private syncServerSceneAssets(): void {
    const background = document.getElementById(
      "server-scene-background"
    ) as HTMLImageElement | null;
    const screenView = document.getElementById("server-scene-screen-view");
    const screenArt = document.getElementById("server-scene-screen-art") as HTMLImageElement | null;
    const panelArtSrc = getSceneRoomViewPanelArtSrc("server", "primary") ?? "";

    if (background !== null) {
      background.src = getSceneRoomBackgroundSrc("server");
      background.alt = "";
    }

    if (screenView !== null) {
      screenView.style.setProperty("--server-scene-screen-art-url", `url("${panelArtSrc}")`);
    }

    if (screenArt !== null) {
      screenArt.src = panelArtSrc;
      screenArt.alt = "";
    }
  }

  private syncServerSceneTransparentWindow(): void {
    const screenView = document.getElementById("server-scene-screen-view");
    const room = document.querySelector(".server-room");
    if (!(screenView instanceof HTMLElement) || !(room instanceof HTMLElement)) {
      return;
    }

    if (!isSceneUiMode() || !this._serverSceneScreenOpen) {
      clearSceneAlphaWindowFrameVariables(room, "server-scene");
      return;
    }

    applySceneAlphaWindowBoundsToTarget({
      bounds: getSceneRoomViewPanelTransparentWindow("server", "primary"),
      container: screenView,
      target: room,
      variablePrefix: "server-scene",
    });
  }

  private setupServerSceneDebug(): void {
    const editorHost = document.getElementById("server-scene-editor-host");
    if (!(editorHost instanceof HTMLElement)) {
      this._serverSceneEditor = null;
      return;
    }

    if (!this._serverSceneDebugEnabled) {
      editorHost.replaceChildren();
      this._serverSceneEditor = null;
      return;
    }

    const assetBindings = createSceneLayoutEditorAssetBindings({
      roomId: "server",
      getSceneLayout: (): SceneLayoutConfig => this._serverSceneLayout,
      getSelection: (): SceneLayoutEditorSelection => this._serverSceneSelection,
      onAfterChange: (): void => {
        this.syncServerSceneAssets();
        this.syncServerSceneVisibility();
      },
    });

    this._serverSceneEditor = new SceneLayoutEditor(editorHost, {
      isActive: (): boolean => this.isServerSceneDebugActive(),
      getSceneLayout: (): SceneLayoutConfig => this._serverSceneLayout,
      getSceneClickableTheme: (): SceneClickableThemeDefinition => this._serverSceneClickableTheme,
      getSelection: (): SceneLayoutEditorSelection => this._serverSceneSelection,
      getRoomOptions: (): Array<{ id: string; label: string }> => getSceneDebugRoomOptions(shellT),
      getActiveRoomId: (): string => "server",
      setSelection: (selection): void => {
        this._serverSceneSelection = selection;
        this._serverSceneEditor?.refresh();
        this.renderServerScene();
      },
      navigateToRoom: (roomId: string): void => {
        this.setServerSceneScreenOpen(false);
        openSceneDebugRoom(roomId);
      },
      updateObject: (id, updater): void => {
        this._serverSceneSession.updateObject(id, updater);
        this.syncServerSceneVisibility();
        this._serverSceneEditor?.refresh();
      },
      updateBack: (id, updater): void => {
        this._serverSceneSession.updateBack(id, updater);
        this.syncServerSceneVisibility();
        this._serverSceneEditor?.refresh();
      },
      updateCharacter: (id, updater): void => {
        this._serverSceneSession.updateCharacter(id, updater);
        void this.renderServerSceneCharacters();
        this._serverSceneEditor?.refresh();
      },
      resetDraft: (): void => {
        this._serverSceneLayout = this._serverSceneSession.resetSceneLayoutDraft();
        this._serverSceneSelection = null;
        this.renderServerScene();
        this._serverSceneEditor?.refresh();
      },
      copySceneLayout: async (): Promise<void> => {
        try {
          await this._serverSceneSession.copySceneLayout();
        } catch {
          console.info("Server scene layout copy failed.");
        }
      },
      saveSceneLayoutToSource: async (): Promise<void> => {
        await this._serverSceneSession.saveSceneLayoutToSource();
      },
      updateSceneClickableTheme: (updater): void => {
        this._serverSceneClickableTheme =
          this._serverSceneSession.updateSceneClickableTheme(updater);
        this.syncServerSceneVisibility();
        this.renderServerScene();
        this._serverSceneEditor?.refresh();
      },
      resetSceneClickableThemeDraft: (): void => {
        this._serverSceneClickableTheme = this._serverSceneSession.resetSceneClickableThemeDraft();
        this.syncServerSceneVisibility();
        this.renderServerScene();
        this._serverSceneEditor?.refresh();
      },
      copySceneClickableTheme: async (): Promise<void> => {
        try {
          await this._serverSceneSession.copySceneClickableTheme();
        } catch {
          console.info("Server scene clickable theme copy failed.");
        }
      },
      saveSceneClickableThemeToSource: async (): Promise<void> => {
        await this._serverSceneSession.saveSceneClickableThemeToSource();
      },
      ...assetBindings,
    });
    this._serverSceneEditor.refresh();
  }

  private observeServerSceneLayout(): void {
    const sceneRoot = document.getElementById("server-scene-root");
    if (!(sceneRoot instanceof HTMLElement) || typeof ResizeObserver === "undefined") {
      return;
    }

    this._serverSceneResizeObserver?.disconnect();
    this._serverSceneResizeObserver = new ResizeObserver(() => {
      if (!isSceneUiMode()) {
        return;
      }
      this.renderServerScene();
      this._serverSceneEditor?.refresh();
    });
    this._serverSceneResizeObserver.observe(sceneRoot);
  }

  private renderServerScene(): void {
    this.renderServerSceneHotspots();
    void this.renderServerSceneCharacters();
  }

  private renderServerSceneHotspots(): void {
    const hotspotLayer = document.getElementById("server-scene-hotspots");
    if (!(hotspotLayer instanceof HTMLElement)) {
      return;
    }

    renderSceneObjectLayer({
      layer: hotspotLayer,
      nodes: getSceneObjectNodesForView(this._serverSceneLayout),
      themeDefaults: this._serverSceneClickableTheme.object,
      projection: this.getServerSceneProjection(),
      cssVarPrefix: "server-scene-hotspot",
      classNames: {
        item: "server-scene__hotspot-item",
        button: "server-scene__hotspot",
        label: "server-scene__hotspot-label",
      },
      selection: this._serverSceneSelection,
      clickableLabels: true,
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        this.handleServerSceneObject(node.id);
      },
    });
  }

  private getServerSceneProjection(): { offsetX: number; offsetY: number; scale: number } {
    const sceneRoot = document.getElementById("server-scene-root");
    return getCoverSceneProjectionFromElement(
      sceneRoot instanceof HTMLElement ? sceneRoot : null,
      this._serverSceneLayout.referenceSize
    );
  }

  private isServerSceneDebugActive(): boolean {
    return isSceneDebugRoomActive("server");
  }

  private bindServerSceneInteractions(): void {
    this._serverSceneBindingsReady = true;
  }

  private handleServerSceneObject(id: string): void {
    const sceneObject = this._serverSceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      return;
    }

    if (this._serverSceneEditor !== null) {
      this._serverSceneSelection = { kind: "object", id: sceneObject.id };
      this._serverSceneEditor.refresh();
      this.renderServerScene();
      return;
    }

    dispatchSceneAction(sceneObject.action, {
      onNavigate: (page) => {
        this.setServerSceneScreenOpen(false);
        this._navigateToPage(page);
      },
      onSettings: (action) => {
        this.setServerSceneScreenOpen(false);
        openSceneSettingsPanel(action.panel);
      },
      onSettingsSceneClose: () => {},
      onScreen: (action) => {
        this.setServerSceneScreenOpen(action.screen === "primary");
      },
      onWhisper: () => {},
      onBack: () => {
        this.setServerSceneScreenOpen(false);
      },
    });
  }

  private setServerSceneScreenOpen(open: boolean): void {
    this._serverSceneScreenOpen = open;
    this.syncServerSceneVisibility();
  }

  syncServerSceneVisibility(): void {
    const sceneRoot = document.getElementById("server-scene-root");
    const screenView = document.getElementById("server-scene-screen-view");
    const room = document.querySelector(".server-room");
    const sceneActive = isSceneUiMode();

    syncSceneViewRuntime({
      elements: {
        root: sceneRoot instanceof HTMLElement ? sceneRoot : null,
        view: screenView instanceof HTMLElement ? screenView : null,
        room: room instanceof HTMLElement ? room : null,
      },
      state: {
        sceneActive,
        viewOpen: this._serverSceneScreenOpen,
        roomOpenClass: "is-scene-screen-open",
      },
    });

    if (screenView instanceof HTMLElement) {
      renderSceneBackLayer({
        host: screenView,
        node:
          sceneActive && this._serverSceneScreenOpen
            ? getSceneBackNodeForView(this._serverSceneLayout, "primary")
            : null,
        themeDefaults: this._serverSceneClickableTheme.back,
        projection: this.getServerSceneProjection(),
        resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
        onActivate: (node) => {
          if (this._serverSceneEditor !== null) {
            this._serverSceneSelection = { kind: "back", id: node.id };
            this._serverSceneEditor.refresh();
            return;
          }

          dispatchSceneAction(node.action, {
            onNavigate: () => {},
            onSettings: () => {},
            onSettingsSceneClose: () => {},
            onScreen: () => {},
            onWhisper: () => {},
            onBack: () => {
              this.setServerSceneScreenOpen(false);
            },
          });
        },
      });
    }

    if (!sceneActive) {
      if (room instanceof HTMLElement) {
        clearSceneAlphaWindowFrameVariables(room, "server-scene");
      }
      return;
    }

    this.syncServerSceneAssets();
    this.syncServerSceneTransparentWindow();
    this.renderServerScene();
    this._serverSceneEditor?.refresh();
  }

  private _navigateToPage(page: string): void {
    navigateToScenePage(page);
  }

  async renderServerSceneCharacters(): Promise<void> {
    const layer = document.getElementById("server-scene-characters");
    if (!(layer instanceof HTMLElement) || !isSceneUiMode()) {
      return;
    }

    const characters = buildSceneCharacterRoster(
      this._serverSceneLayout.characters,
      this._serverSceneLayout.characterRosterPreset
    );
    if (characters.length === 0) {
      layer.replaceChildren();
      return;
    }

    const renderToken = ++this._serverSceneCharacterRenderToken;
    await renderSceneCharacterLayer({
      layer,
      characters,
      projection: this.getServerSceneProjection(),
      sceneDebugEnabled: this._serverSceneDebugEnabled,
      interactive: this._serverSceneEditor !== null,
      selectedCharacterId:
        this._serverSceneSelection?.kind === "character" ? this._serverSceneSelection.id : null,
      isStale: () => renderToken !== this._serverSceneCharacterRenderToken,
      getDepthScale: () => 1,
      resolveAvatarSource: async (character) => {
        return await resolveSceneAvatarSource(character.avatarSource);
      },
      getNodeClassName: (character) =>
        `entrance-scene__character server-scene__character is-${character.state}`,
      getFallbackHeadLabel: (character) => character.headLabel ?? toHeadLabel(character.label),
      onActivate: (character) => {
        if (this._serverSceneEditor === null) {
          return;
        }
        this._serverSceneSelection = { kind: "character", id: character.anchorId };
        this._serverSceneEditor.refresh();
        this.renderServerScene();
      },
    });
  }

  async runSelectedCommand(): Promise<void> {
    const runButton = this.commandRunBtn;
    if (runButton === null) {
      return;
    }

    const commandName = this.selectedCommand.trim();
    if (commandName === "") {
      ButtonStates.setError(runButton, serverCommandPanelT("buttons.selectCommand"), 1200);
      return;
    }

    const slot = this.getSelectedCommandSlot();
    ButtonStates.setLoading(runButton, serverCommandPanelT("buttons.runLoading"));

    const rawInput = (this.commandTestArgs?.value ?? "").trim();
    const commandKey = commandName.toLowerCase();
    const inputWithDefault = rawInput === "" && commandKey === "assistantaisend" ? "ai1" : rawInput;
    const parsed = parseCommandExecutionInput(inputWithDefault, commandName);
    const resolvedCommandName = parsed.commandName;
    const resolvedArgs = parsed.args;

    const payload: Record<string, unknown> = {
      provider: slot,
      source: "manual",
      sender: AppState.getNickname("user"),
      args: resolvedArgs,
      text: buildCommandTestMessage(resolvedCommandName, resolvedArgs),
      testMode: true,
    };

    try {
      const result = (await this.getServerCommandsApi().run(
        resolvedCommandName,
        payload
      )) as CommandRunResult;
      const success = result.success === true;

      if (success) {
        ButtonStates.setSuccess(runButton, serverCommandPanelT("buttons.success"), 1200);
      } else {
        ButtonStates.setError(runButton, serverCommandPanelT("buttons.error"), 1200);
      }

      const detailFromResult =
        typeof result.message === "string" && result.message !== ""
          ? result.message
          : typeof result.detail === "string" && result.detail !== ""
            ? result.detail
            : success
              ? serverCommandPanelT("results.completed")
              : serverCommandPanelT("results.failed");

      this.selectedCommand = resolvedCommandName;

      if (this.commandDetail !== null) {
        this.commandDetail.value = `${resolvedCommandName}\n\n${detailFromResult}`;
      }

      Logger.info(
        LogCategory.SERVER_COMMANDS,
        serverCommandPanelT("logs.runResult", { command: resolvedCommandName }),
        {
          command: resolvedCommandName,
          slot,
          success,
          detail: detailFromResult,
        }
      );
    } catch (error) {
      ButtonStates.setError(runButton, serverCommandPanelT("buttons.error"), 1200);
      const message = error instanceof Error ? error.message : String(error);
      if (this.commandDetail !== null) {
        this.commandDetail.value = `${resolvedCommandName}\n\n${message}`;
      }
      Logger.error(LogCategory.SERVER_COMMANDS, serverCommandPanelT("logs.runError", { message }));
    }
  }

  renderCommandPanel(): void {
    if (this.commandList === null) {
      return;
    }

    const slot = this.getSelectedCommandSlot();
    this.activeCategory = this.resolveCategoryForSlot(slot);
    this.updateCategoryTabs();

    const list = this.getCommandCatalog(this.activeCategory)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, AppI18n.getLocale()));
    const groupedCatalog = splitCommandCatalogBySource(list);

    this.commandList.innerHTML = "";

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ds-log-empty";
      empty.textContent = serverCommandPanelT("status.emptyCategory");
      this.commandList.appendChild(empty);
      if (this.commandDetail !== null) {
        this.commandDetail.value = "";
      }
      return;
    }

    const hasSelected = list.some((item) => item.name === this.selectedCommand);
    if (!hasSelected) {
      this.selectedCommand = list[0]?.name ?? "";
    }

    [
      {
        id: "system",
        title: serverPageT("systemCommandsGroupTitle"),
        items: groupedCatalog.systemCommands,
      },
      {
        id: "room",
        title: serverPageT("roomCommandsGroupTitle"),
        items: groupedCatalog.roomCommands,
      },
    ].forEach((section) => {
      const sectionElement = document.createElement("section");
      sectionElement.className = "command-section";
      sectionElement.dataset["commandGroup"] = section.id;

      const header = document.createElement("div");
      header.className = "command-section-header";
      header.textContent = section.title;

      const body = document.createElement("div");
      body.className = "command-section-list";

      if (section.items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ds-log-empty";
        empty.textContent = serverCommandPanelT("status.emptyGroup");
        body.appendChild(empty);
      } else {
        section.items.forEach((item) => {
          const enabled = this.isCommandEnabled(slot, item.name);

          const row = document.createElement("div");
          row.className = "command-item";

          const left = document.createElement("div");
          left.className = "command-item-left";

          const toggle = document.createElement("input");
          toggle.type = "checkbox";
          toggle.className = "command-toggle";
          toggle.checked = enabled;
          toggle.title = enabled
            ? serverCommandPanelT("status.enabledTitle")
            : serverCommandPanelT("status.disabledTitle");

          const name = document.createElement("span");
          name.className = "command-item-name";
          name.textContent = item.name;

          const status = document.createElement("span");
          status.className = "command-item-status";
          status.textContent = enabled
            ? serverCommandPanelT("status.enabled")
            : serverCommandPanelT("status.disabled");

          left.appendChild(toggle);
          left.appendChild(name);
          left.appendChild(status);

          const actions = document.createElement("div");
          actions.className = "command-item-actions";

          const detailButton = document.createElement("button");
          detailButton.className = "btn btn-secondary btn-sm";
          detailButton.type = "button";
          detailButton.textContent = serverCommandPanelT("buttons.detail");

          const exampleButton = document.createElement("button");
          exampleButton.className = "btn btn-primary btn-sm";
          exampleButton.type = "button";
          exampleButton.textContent = serverCommandPanelT("buttons.example");

          actions.appendChild(detailButton);
          actions.appendChild(exampleButton);

          row.appendChild(left);
          row.appendChild(actions);

          toggle.addEventListener("change", () => {
            const requestedState = toggle.checked;
            toggle.disabled = true;

            void this.toggleCommandForSlot(slot, item.name, requestedState)
              .then(() => {
                status.textContent = requestedState
                  ? serverCommandPanelT("status.enabled")
                  : serverCommandPanelT("status.disabled");
                toggle.title = requestedState
                  ? serverCommandPanelT("status.enabledTitle")
                  : serverCommandPanelT("status.disabledTitle");
                Logger.info(
                  LogCategory.SERVER_COMMANDS,
                  serverCommandPanelT("logs.statusUpdated", { command: item.name }),
                  {
                    command: item.name,
                    slot,
                    enabled: requestedState,
                  }
                );
              })
              .catch((error) => {
                toggle.checked = !requestedState;
                Logger.error(
                  LogCategory.SERVER_COMMANDS,
                  serverCommandPanelT("logs.statusUpdateError", {
                    message: error instanceof Error ? error.message : String(error),
                  })
                );
              })
              .finally(() => {
                toggle.disabled = false;
              });
          });

          detailButton.addEventListener("click", () => {
            this.setCommandDetail(item.name);
          });

          exampleButton.addEventListener("click", () => {
            this.insertExampleArgs(item.name);
          });

          body.appendChild(row);
        });
      }

      sectionElement.appendChild(header);
      sectionElement.appendChild(body);
      this.commandList?.appendChild(sectionElement);
    });

    if (this.selectedCommand !== "") {
      this.setCommandDetail(this.selectedCommand);
    }
  }

  getProviderLabel(provider: string | null): string {
    if (provider == null || provider === "") return "AI";
    if (provider === "ai1" || provider === "ai2" || provider === "us1" || provider === "user") {
      return String(AppState.getNickname(provider));
    }
    return provider;
  }

  async init(): Promise<void> {
    await initServerControllerPage(this as unknown as ServerInitContext);
    this._serverSceneDebugEnabled = applySceneDebugFlag();
    this._serverSceneSession.load(this._serverSceneDebugEnabled);

    this.setupServerSceneDebug();
    this.observeServerSceneLayout();
    this.bindServerSceneInteractions();
    this.syncServerSceneVisibility();
    this._unsubSceneTheme ??= SceneThemeManager.onChange(() => {
      this._serverSceneSession.reloadFromActiveTheme(this._serverSceneDebugEnabled);
      this._serverSceneSelection = null;
      this.syncServerSceneVisibility();
    });
    this._unsubSceneThemeAssets ??= subscribeSceneThemeAssetDraft(() => {
      this.syncServerSceneVisibility();
    });
  }

  onShow(): void {
    this.syncServerSceneVisibility();
    this.renderCommandPanel();
    if (this.timelineInitialized) {
      this.rebuildTimeline(false);
    } else {
      void this.initializeTimeline();
    }
  }

  onHide(): void {
    this.setServerSceneScreenOpen(false);
  }

  private async initializeTimeline(): Promise<void> {
    await initializeTimeline({
      state: this,
      batchSize: TIMELINE_SESSION_BATCH,
      updateTimelineMeta: (text) => {
        this.updateTimelineMeta(text);
      },
      getProviderLabel: (provider) => this.getProviderLabel(provider),
    });
  }

  async handleTimelineScroll(): Promise<void> {
    await handleTimelineScroll({
      state: this,
      topThreshold: TIMELINE_TOP_THRESHOLD,
      batchSize: TIMELINE_SESSION_BATCH,
      updateTimelineMeta: (text) => {
        this.updateTimelineMeta(text);
      },
      getProviderLabel: (provider) => this.getProviderLabel(provider),
    });
  }

  handleLogEntry(entry: LogEntry): void {
    handleTimelineLogEntry({
      state: this,
      entry,
      getProviderLabel: (provider) => this.getProviderLabel(provider),
    });
  }

  private rebuildTimeline(stickToBottom = false): void {
    rebuildTimelineView({
      state: this,
      getProviderLabel: (provider) => this.getProviderLabel(provider),
      stickToBottom,
    });
  }
}
