import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { shellT } from "../../app/shell-i18n.js";
import { navigateMainShellPage } from "../shared/external-page.js";
import { dispatchSceneAction } from "../../scene/action-dispatcher.js";
import {
  applySceneDebugFlag,
  createSceneLayoutEditorAssetBindings,
  createSceneDebugRuntimeSession,
  SceneLayoutEditor,
  type SceneLayoutEditorSelection,
  getSceneDebugRoomOptions,
  isSceneDebugRoomActive,
  isSceneDebugRoomId,
  setActiveSceneDebugRoomId,
  subscribeSceneThemeAssetDraft,
} from "../../scene-editor/index.js";
import {
  buildSceneCharacterRoster,
  resolveSceneAvatarSource,
} from "../../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import type { SceneLayoutConfig } from "../../scene/layout/index.js";
import {
  getSceneBackNodeForView,
  getSceneObjectNodesForView,
  resolveSceneNodeLabelText,
} from "../../scene/layout/index.js";
import {
  applySceneAlphaWindowBoundsToTarget,
  clearSceneAlphaWindowFrameVariables,
} from "../../scene/alpha-window.js";
import { getCoverSceneProjection } from "../../scene/projection.js";
import { renderSceneBackLayer } from "../../scene/renderers/back-layer.js";
import { renderSceneCharacterLayer } from "../../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../../scene/renderers/object-layer.js";
import { syncSceneViewRuntime } from "../../scene/runtime.js";
import {
  getSceneRoomBackgroundSrc,
  getSceneRoomPanelSrc,
  getSceneRoomPanelTransparentWindow,
  SceneUiScaleManager,
  SceneThemeManager,
} from "../../scene-system/index.js";
import {
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  createManagedOverlayController,
  mountElementInOverlayHostLayer,
  OVERLAY_SURFACE_FAMILIES,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import { isSceneUiMode } from "../../ui/ui-mode.js";
import {
  WORKSPACE_TOOL_CLOSE_EVENT,
  WORKSPACE_TOOL_OPEN_EVENT,
  syncWorkspaceToolState,
  type WorkspaceToolCloseDetail,
  type WorkspaceToolOpenDetail,
} from "../../ui/workspace-tool-overlay.js";

const SETTINGS_PANELS = [
  "accounts",
  "capture",
  "theme",
  "backup",
  "rooms",
  "live-log",
  "languages",
] as const;

export type SettingsPanelId = (typeof SETTINGS_PANELS)[number];

interface SettingsPanelLifecycleState {
  open: boolean;
  activePanel: SettingsPanelId | null;
}

interface SettingsSceneState {
  open: boolean;
  activePanel: SettingsPanelId | null;
}

interface SettingsSceneControllerDeps {
  overlay: HTMLElement;
  root: HTMLElement;
  hotspotLayer: HTMLElement;
  editorHost: HTMLElement;
  classicLayout: HTMLElement;
  panelsContainer: HTMLElement;
  roomView: HTMLElement;
  panelView: HTMLElement;
  panelSlot: HTMLElement;
  background: HTMLImageElement;
  panelArt: HTMLImageElement;
  characterLayer: HTMLElement;
  onClose: () => void;
  onOpenPanel: (panelId: SettingsPanelId) => void;
  onReturnToRoom: () => void;
}

export interface SettingsPanelLifecycleHandler {
  onEnter?: () => void | Promise<void>;
  onExit?: () => void;
  onActivate?: () => void | Promise<void>;
  onDeactivate?: () => void;
}

function isSettingsPanelId(value: string): value is SettingsPanelId {
  return SETTINGS_PANELS.includes(value as SettingsPanelId);
}

export function resolveSettingsPanelId(value: string | null | undefined): SettingsPanelId | null {
  return value !== null && value !== undefined && isSettingsPanelId(value) ? value : null;
}

function isHostedInMainShell(): boolean {
  return document.getElementById("pages-container") instanceof HTMLElement;
}

function toHeadLabel(label: string): string {
  const compact = label.replace(/\s+/g, "").trim().toUpperCase();
  const head = compact.slice(0, 2);
  return head === "" ? "?" : head;
}

function applyWorkspaceToolPageVisibility(page: HTMLElement, open: boolean): void {
  page.classList.toggle("is-hidden", !open);
  page.toggleAttribute("hidden", !open);
  page.setAttribute("aria-hidden", String(!open));
  if (open) {
    page.dataset["workspaceToolMode"] = "overlay";
    return;
  }

  delete page.dataset["workspaceToolMode"];
}

const settingsPanelLifecycleHandlers = new Map<
  SettingsPanelId,
  Set<SettingsPanelLifecycleHandler>
>();

function runSettingsPanelLifecycleHook(
  panelId: SettingsPanelId,
  hookName: keyof SettingsPanelLifecycleHandler
): void {
  settingsPanelLifecycleHandlers.get(panelId)?.forEach((handler) => {
    void handler[hookName]?.();
  });
}

function emitSettingsPanelLifecycle(
  previousState: SettingsPanelLifecycleState,
  nextState: SettingsPanelLifecycleState
): void {
  const previousPanel = previousState.open ? previousState.activePanel : null;
  const nextPanel = nextState.open ? nextState.activePanel : null;

  if (previousState.open === false && nextState.open === true && nextPanel !== null) {
    runSettingsPanelLifecycleHook(nextPanel, "onEnter");
    runSettingsPanelLifecycleHook(nextPanel, "onActivate");
    return;
  }

  if (previousState.open === true && nextState.open === false && previousPanel !== null) {
    runSettingsPanelLifecycleHook(previousPanel, "onDeactivate");
    runSettingsPanelLifecycleHook(previousPanel, "onExit");
    return;
  }

  if (previousPanel === nextPanel) {
    return;
  }

  if (previousPanel !== null) {
    runSettingsPanelLifecycleHook(previousPanel, "onDeactivate");
  }

  if (nextPanel !== null) {
    runSettingsPanelLifecycleHook(nextPanel, "onActivate");
  }
}

export function registerSettingsPanelLifecycle(
  panelId: SettingsPanelId,
  handler: SettingsPanelLifecycleHandler
): () => void {
  const handlers =
    settingsPanelLifecycleHandlers.get(panelId) ?? new Set<SettingsPanelLifecycleHandler>();
  handlers.add(handler);
  settingsPanelLifecycleHandlers.set(panelId, handlers);

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      settingsPanelLifecycleHandlers.delete(panelId);
    }
  };
}

class SettingsSceneController {
  private overlay: HTMLElement;
  private root: HTMLElement;
  private hotspotLayer: HTMLElement;
  private editorHost: HTMLElement;
  private classicLayout: HTMLElement;
  private panelsContainer: HTMLElement;
  private roomView: HTMLElement;
  private panelView: HTMLElement;
  private panelSlot: HTMLElement;
  private background: HTMLImageElement;
  private panelArt: HTMLImageElement;
  private characterLayer: HTMLElement;
  private onClose: () => void;
  private onOpenPanel: (panelId: SettingsPanelId) => void;
  private onReturnToRoom: () => void;
  private state: SettingsSceneState = { open: false, activePanel: null };
  private panelsPlaceholder: Comment | null = null;
  private readonly sceneDebugSession = createSceneDebugRuntimeSession("settings");
  private sceneDebugEnabled = false;
  private editorSelection: SceneLayoutEditorSelection = null;
  private editor: SceneLayoutEditor | null = null;
  private characterRenderToken = 0;
  private sceneThemeUnsub: (() => void) | null = null;
  private sceneThemeAssetDraftUnsub: (() => void) | null = null;
  private sceneUiScaleUnsub: (() => void) | null = null;

  private get sceneLayout(): SceneLayoutConfig {
    return this.sceneDebugSession.getSceneLayout();
  }

  private set sceneLayout(sceneLayout: SceneLayoutConfig) {
    this.sceneDebugSession.setSceneLayout(sceneLayout);
  }

  private get sceneClickableTheme(): SceneClickableThemeDefinition {
    return this.sceneDebugSession.getSceneClickableTheme();
  }

  private set sceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition) {
    this.sceneDebugSession.setSceneClickableTheme(sceneClickableTheme);
  }

  constructor(deps: SettingsSceneControllerDeps) {
    this.overlay = deps.overlay;
    this.root = deps.root;
    this.hotspotLayer = deps.hotspotLayer;
    this.editorHost = deps.editorHost;
    this.classicLayout = deps.classicLayout;
    this.panelsContainer = deps.panelsContainer;
    this.roomView = deps.roomView;
    this.panelView = deps.panelView;
    this.panelSlot = deps.panelSlot;
    this.background = deps.background;
    this.panelArt = deps.panelArt;
    this.characterLayer = deps.characterLayer;
    this.onClose = deps.onClose;
    this.onOpenPanel = deps.onOpenPanel;
    this.onReturnToRoom = deps.onReturnToRoom;
  }

  init(): void {
    this.sceneDebugEnabled = applySceneDebugFlag();
    this.sceneDebugSession.load(this.sceneDebugEnabled);
    this.background.src = getSceneRoomBackgroundSrc("settings");
    this.background.alt = "";
    this.bindSceneEvents();
    this.setupEditor();

    AppState.subscribe(() => {
      void this.renderCharacter();
    });
    AppI18n.subscribe(() => {
      this.renderHotspots();
      this.editor?.refresh();
      void this.renderCharacter();
    });

    this.sceneThemeUnsub ??= SceneThemeManager.onChange(() => {
      this.sceneDebugSession.reloadFromActiveTheme(this.sceneDebugEnabled);
      this.editorSelection = null;
      this.sync(this.state);
    });

    this.sceneThemeAssetDraftUnsub ??= subscribeSceneThemeAssetDraft(() => {
      this.sync(this.state);
    });

    this.sceneUiScaleUnsub ??= SceneUiScaleManager.onChange(() => {
      this.sync(this.state);
    });
  }

  sync(nextState: SettingsSceneState): void {
    this.state = nextState;
    this.background.src = getSceneRoomBackgroundSrc("settings");
    this.background.alt = "";

    const sceneActive = nextState.open && isSceneUiMode();
    const panelOpen = sceneActive && nextState.activePanel !== null;

    syncSceneViewRuntime({
      elements: {
        root: this.root,
        roomView: this.roomView,
        view: this.panelView,
        overlay: this.overlay,
        classicLayout: this.classicLayout,
        viewSlot: this.panelSlot,
      },
      state: {
        sceneActive,
        viewOpen: panelOpen,
        viewActiveClass: "is-active",
        overlayActiveClass: "is-scene-mode",
        classicLayoutHiddenClass: "is-hidden",
      },
    });

    if (!sceneActive) {
      this.restorePanelsContainer();
      clearSceneAlphaWindowFrameVariables(this.panelView, "settings-scene");
      this.syncActiveDebugRoom(false);
      return;
    }

    this.movePanelsToSceneSlot();
    this.syncPanelArt(nextState.activePanel);
    renderSceneBackLayer({
      host: this.panelView,
      node: panelOpen ? getSceneBackNodeForView(this.sceneLayout, "panel") : null,
      themeDefaults: this.sceneClickableTheme.back,
      projection: this.getSceneProjection(),
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        if (this.isEditorActive()) {
          this.editorSelection = { kind: "back", id: node.id };
          this.editor?.refresh();
          return;
        }

        dispatchSceneAction(node.action, {
          onNavigate: () => {},
          onSettings: () => {},
          onSettingsSceneClose: () => {},
          onScreen: () => {},
          onWhisper: () => {},
          onBack: () => {
            this.onReturnToRoom();
          },
        });
      },
    });
    this.syncPanelTransparentWindow(panelOpen ? nextState.activePanel : null);
    this.syncActiveDebugRoom(true);
    this.renderHotspots();
    void this.renderCharacter();
    this.editor?.refresh();
  }

  private bindSceneEvents(): void {
    return;
  }

  private setupEditor(): void {
    if (!this.sceneDebugEnabled) {
      this.editorHost.replaceChildren();
      this.editor = null;
      return;
    }

    const assetBindings = createSceneLayoutEditorAssetBindings({
      roomId: "settings",
      getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
      getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
      onAfterChange: (): void => {
        this.background.src = getSceneRoomBackgroundSrc("settings");
        this.background.alt = "";
        this.sync(this.state);
      },
    });

    this.editor = new SceneLayoutEditor(this.editorHost, {
      isActive: (): boolean => this.isEditorActive(),
      getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
      getSceneClickableTheme: (): SceneClickableThemeDefinition => this.sceneClickableTheme,
      getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
      getRoomOptions: (): Array<{ id: string; label: string }> => getSceneDebugRoomOptions(shellT),
      getActiveRoomId: (): string => "settings",
      setSelection: (selection): void => {
        this.editorSelection = selection;
        this.editor?.refresh();
        this.renderHotspots();
        void this.renderCharacter();
      },
      navigateToRoom: (roomId: string): void => {
        if (roomId === "settings") {
          this.onReturnToRoom();
          return;
        }

        this.onClose();
        navigateMainShellPage(roomId);
      },
      updateObject: (id, updater): void => {
        this.sceneDebugSession.updateObject(id, updater);
        this.sync(this.state);
        this.renderHotspots();
        this.editor?.refresh();
      },
      updateBack: (id, updater): void => {
        this.sceneDebugSession.updateBack(id, updater);
        this.sync(this.state);
        this.editor?.refresh();
      },
      updateCharacter: (id, updater): void => {
        this.sceneDebugSession.updateCharacter(id, updater);
        void this.renderCharacter();
        this.editor?.refresh();
      },
      resetDraft: (): void => {
        this.sceneLayout = this.sceneDebugSession.resetSceneLayoutDraft();
        this.editorSelection = null;
        this.renderHotspots();
        void this.renderCharacter();
        this.editor?.refresh();
      },
      copySceneLayout: async (): Promise<void> => {
        try {
          await this.sceneDebugSession.copySceneLayout();
        } catch {
          console.info("Settings scene layout copy failed.");
        }
      },
      saveSceneLayoutToSource: async (): Promise<void> => {
        await this.sceneDebugSession.saveSceneLayoutToSource();
      },
      updateSceneClickableTheme: (updater): void => {
        this.sceneClickableTheme = this.sceneDebugSession.updateSceneClickableTheme(updater);
        this.sync(this.state);
        this.renderHotspots();
        this.editor?.refresh();
      },
      resetSceneClickableThemeDraft: (): void => {
        this.sceneClickableTheme = this.sceneDebugSession.resetSceneClickableThemeDraft();
        this.sync(this.state);
        this.renderHotspots();
        this.editor?.refresh();
      },
      copySceneClickableTheme: async (): Promise<void> => {
        try {
          await this.sceneDebugSession.copySceneClickableTheme();
        } catch {
          console.info("Settings scene clickable theme copy failed.");
        }
      },
      saveSceneClickableThemeToSource: async (): Promise<void> => {
        await this.sceneDebugSession.saveSceneClickableThemeToSource();
      },
      ...assetBindings,
    });
    this.editor.refresh();
  }

  private movePanelsToSceneSlot(): void {
    if (this.panelsContainer.parentElement === this.panelSlot) {
      return;
    }

    if (this.panelsPlaceholder === null && this.panelsContainer.parentNode !== null) {
      this.panelsPlaceholder = document.createComment("settings-hub-panels-placeholder");
      this.panelsContainer.parentNode.insertBefore(this.panelsPlaceholder, this.panelsContainer);
    }

    this.panelSlot.appendChild(this.panelsContainer);
  }

  private restorePanelsContainer(): void {
    if (
      this.panelsPlaceholder?.parentNode === null ||
      this.panelsPlaceholder?.parentNode === undefined
    ) {
      return;
    }

    this.panelsPlaceholder.parentNode.insertBefore(
      this.panelsContainer,
      this.panelsPlaceholder.nextSibling
    );
  }

  private syncPanelArt(panelId: SettingsPanelId | null): void {
    if (panelId === null) {
      this.panelArt.removeAttribute("src");
      this.panelArt.alt = "";
      delete this.panelSlot.dataset["settingsPanel"];
      return;
    }

    this.panelArt.src = getSceneRoomPanelSrc("settings", panelId) ?? "";
    this.panelArt.alt = "";
    this.panelSlot.dataset["settingsPanel"] = panelId;
  }

  private syncPanelTransparentWindow(panelId: SettingsPanelId | null): void {
    if (panelId === null || !this.state.open || !isSceneUiMode()) {
      clearSceneAlphaWindowFrameVariables(this.panelView, "settings-scene");
      return;
    }

    applySceneAlphaWindowBoundsToTarget({
      bounds: getSceneRoomPanelTransparentWindow("settings", panelId),
      container: this.panelView,
      target: this.panelView,
      variablePrefix: "settings-scene",
    });
  }

  private syncActiveDebugRoom(sceneActive: boolean): void {
    if (!this.sceneDebugEnabled) {
      return;
    }

    if (sceneActive) {
      setActiveSceneDebugRoomId("settings");
      return;
    }

    const currentPage = document.documentElement.getAttribute("data-active-page");
    if (currentPage !== "settings" && isSceneDebugRoomId(currentPage)) {
      setActiveSceneDebugRoomId(currentPage);
      return;
    }

    setActiveSceneDebugRoomId(null);
  }

  private isEditorActive(): boolean {
    return (
      this.sceneDebugEnabled &&
      this.state.open &&
      isSceneUiMode() &&
      isSceneDebugRoomActive("settings")
    );
  }

  private getSceneProjection(): {
    offsetX: number;
    offsetY: number;
    scale: number;
  } {
    const surfaceWidth = this.root.clientWidth;
    const surfaceHeight = this.root.clientHeight;
    return getCoverSceneProjection({
      surfaceWidth,
      surfaceHeight,
      referenceWidth: this.sceneLayout.referenceSize.width,
      referenceHeight: this.sceneLayout.referenceSize.height,
    });
  }

  private getDepthScale(depth: number): number {
    const normalizedDepth = Math.max(1, Number.isFinite(depth) ? depth : 1);
    const scaled = 1 - (normalizedDepth - 1) * 0.02;
    return Number(Math.max(0.75, scaled).toFixed(3));
  }

  private renderHotspots(): void {
    renderSceneObjectLayer({
      layer: this.hotspotLayer,
      nodes: getSceneObjectNodesForView(this.sceneLayout),
      themeDefaults: this.sceneClickableTheme.object,
      projection: this.getSceneProjection(),
      cssVarPrefix: "settings-scene-hotspot",
      classNames: {
        item: "settings-scene__hotspot-item",
        button: "settings-scene__hotspot",
        label: "settings-scene__hotspot-label",
      },
      selection: this.editorSelection,
      clickableLabels: true,
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        this.handleObject(node.id);
      },
    });
  }

  private handleObject(id: string): void {
    const sceneObject = this.sceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      return;
    }

    if (this.isEditorActive()) {
      this.editorSelection = { kind: "object", id: sceneObject.id };
      this.editor?.refresh();
      this.renderHotspots();
      return;
    }

    dispatchSceneAction(sceneObject.action, {
      onNavigate: (page) => {
        this.onClose();
        navigateMainShellPage(page);
      },
      onSettings: (action) => {
        if (action.panel === null) {
          this.onReturnToRoom();
          return;
        }

        this.onOpenPanel(action.panel);
      },
      onSettingsSceneClose: () => {
        this.onClose();
      },
      onScreen: () => {},
      onWhisper: () => {},
      onBack: () => {
        this.onReturnToRoom();
      },
    });
  }

  private async renderCharacter(): Promise<void> {
    if (!this.state.open || !isSceneUiMode()) {
      return;
    }

    const characters = buildSceneCharacterRoster(
      this.sceneLayout.characters,
      this.sceneLayout.characterRosterPreset
    );
    if (characters.length === 0) {
      this.characterLayer.replaceChildren();
      return;
    }

    const renderToken = ++this.characterRenderToken;
    await renderSceneCharacterLayer({
      layer: this.characterLayer,
      characters,
      projection: this.getSceneProjection(),
      sceneDebugEnabled: this.sceneDebugEnabled,
      interactive: this.isEditorActive(),
      selectedCharacterId:
        this.editorSelection?.kind === "character" ? this.editorSelection.id : null,
      isStale: () => renderToken !== this.characterRenderToken,
      getDepthScale: (depth) => this.getDepthScale(depth),
      resolveAvatarSource: async (character) => {
        return await resolveSceneAvatarSource(character.avatarSource);
      },
      getNodeClassName: (character) =>
        `settings-scene__character entrance-scene__character is-${character.state}`,
      getFallbackHeadLabel: (character) => character.headLabel ?? toHeadLabel(character.label),
      onActivate: (character) => {
        if (!this.isEditorActive()) {
          return;
        }

        this.editorSelection = { kind: "character", id: character.anchorId };
        this.editor?.refresh();
        void this.renderCharacter();
      },
    });
  }
}

export class SettingsPageController {
  private page: HTMLElement | null = null;
  private closeButton: HTMLButtonElement | null = null;
  private classicLayout: HTMLElement | null = null;
  private panelsContainer: HTMLElement | null = null;
  private overlayController: ManagedOverlayController | null = null;
  private tabButtons: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];
  private sceneController: SettingsSceneController | null = null;
  private isOpen = false;
  private activePanel: SettingsPanelId = "accounts";
  private visiblePanel: SettingsPanelId | null = null;
  private transitionState: SettingsPanelLifecycleState | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.page = document.getElementById("page-settings");
    this.closeButton = document.getElementById("settings-hub-close") as HTMLButtonElement | null;
    if (this.page instanceof HTMLElement && isHostedInMainShell()) {
      mountElementInOverlayHostLayer(this.page, OVERLAY_SURFACE_FAMILIES.workspaceTool);
    }
    this.classicLayout = this.page?.querySelector<HTMLElement>(".settings-hub-layout") ?? null;
    this.panelsContainer = this.page?.querySelector<HTMLElement>(".settings-hub-panels") ?? null;
    this.tabButtons = Array.from(
      this.page?.querySelectorAll<HTMLButtonElement>(".settings-hub-tab") ?? []
    );
    this.panels = Array.from(this.page?.querySelectorAll<HTMLElement>(".settings-hub-panel") ?? []);
    const sceneRoot = document.getElementById("settings-scene-root");
    const sceneHotspots = document.getElementById("settings-scene-hotspots");
    const sceneEditorHost = document.getElementById("settings-scene-editor-host");
    const sceneRoomView = document.getElementById("settings-scene-room-view");
    const scenePanelView = document.getElementById("settings-scene-panel-view");
    const scenePanelSlot = document.getElementById("settings-scene-panel-slot");
    const sceneBackground = document.getElementById(
      "settings-scene-background"
    ) as HTMLImageElement | null;
    const scenePanelArt = document.getElementById(
      "settings-scene-panel-art"
    ) as HTMLImageElement | null;
    const sceneCharacters = document.getElementById("settings-scene-characters");

    if (
      this.page === null ||
      this.closeButton === null ||
      this.classicLayout === null ||
      this.panelsContainer === null ||
      this.tabButtons.length === 0 ||
      this.panels.length === 0 ||
      sceneRoot === null ||
      sceneHotspots === null ||
      sceneEditorHost === null ||
      sceneRoomView === null ||
      scenePanelView === null ||
      scenePanelSlot === null ||
      sceneBackground === null ||
      scenePanelArt === null ||
      sceneCharacters === null
    ) {
      return;
    }

    this.sceneController = new SettingsSceneController({
      overlay: this.page,
      root: sceneRoot,
      hotspotLayer: sceneHotspots,
      editorHost: sceneEditorHost,
      classicLayout: this.classicLayout,
      panelsContainer: this.panelsContainer,
      roomView: sceneRoomView,
      panelView: scenePanelView,
      panelSlot: scenePanelSlot,
      background: sceneBackground,
      panelArt: scenePanelArt,
      characterLayer: sceneCharacters,
      onClose: (): void => {
        this.close();
      },
      onOpenPanel: (panelId: SettingsPanelId): void => {
        this.selectPanel(panelId);
      },
      onReturnToRoom: (): void => {
        this.showRoom();
      },
    });
    this.sceneController.init();

    this.overlayController = createManagedOverlayController({
      id: "workspace-tool-settings",
      element: this.page,
      kind: OVERLAY_KINDS.workspace,
      exclusiveGroup: OVERLAY_GROUPS.workspace,
      isOpen: () => this.isOpen,
      setOpen: (open: boolean) => {
        if (!(this.page instanceof HTMLElement)) {
          return;
        }

        this.isOpen = open;
        applyWorkspaceToolPageVisibility(this.page, open);
      },
      onAfterOpen: () => {
        this.handleOverlayOpened();
      },
      onAfterClose: () => {
        this.handleOverlayClosed();
      },
    });

    this.closeButton.addEventListener("click", () => {
      this.close();
    });

    this.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const panelId = resolveSettingsPanelId(button.dataset["settingsPanel"]);
        if (panelId !== null) {
          this.selectPanel(panelId);
        }
      });
    });

    document.addEventListener(WORKSPACE_TOOL_OPEN_EVENT, ((
      event: CustomEvent<WorkspaceToolOpenDetail>
    ) => {
      if (event.detail.tool !== "settings") {
        return;
      }

      const requestedPanel = resolveSettingsPanelId(event.detail.panel);
      this.show(isSceneUiMode() ? requestedPanel : (requestedPanel ?? this.activePanel));
    }) as EventListener);

    document.addEventListener(WORKSPACE_TOOL_CLOSE_EVENT, ((
      event: CustomEvent<WorkspaceToolCloseDetail>
    ) => {
      if (event.detail.tool !== "settings") {
        return;
      }

      this.overlayController?.close();
    }) as EventListener);

    this.initialized = true;
    if (isHostedInMainShell()) {
      applyWorkspaceToolPageVisibility(this.page, false);
    }
    this.syncViewState({ open: false, activePanel: null });
  }

  show(requestedPanel: SettingsPanelId | null = null): void {
    const previousState = this.getLifecycleState();
    this.visiblePanel = isSceneUiMode() ? requestedPanel : (requestedPanel ?? this.activePanel);
    if (this.visiblePanel !== null) {
      this.activePanel = this.visiblePanel;
    }

    if (this.overlayController !== null) {
      if (this.overlayController.isOpen()) {
        this.syncViewState(previousState);
        syncWorkspaceToolState({
          tool: "settings",
          open: true,
          panel: this.visiblePanel,
        });
        return;
      }

      this.transitionState = previousState;
      this.overlayController.open();
      return;
    }

    this.transitionState = previousState;
    this.isOpen = true;
    this.handleOverlayOpened();
  }

  onShow(): void {
    this.show(this.activePanel);
  }

  hide(): void {
    if (this.overlayController !== null) {
      this.transitionState = this.getLifecycleState();
      this.overlayController.close();
      return;
    }

    this.transitionState = this.getLifecycleState();
    this.isOpen = false;
    this.handleOverlayClosed();
  }

  onHide(): void {
    this.hide();
  }

  private syncActivePanelUi(): void {
    this.tabButtons.forEach((button) => {
      const panelId = resolveSettingsPanelId(button.dataset["settingsPanel"]);
      const isActive = panelId !== null && panelId === this.visiblePanel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });

    this.panels.forEach((panel) => {
      const panelId = resolveSettingsPanelId(panel.dataset["settingsPanel"]);
      const isActive = panelId !== null && panelId === this.visiblePanel;
      panel.classList.toggle("is-active", isActive);
      panel.classList.toggle("is-hidden", !isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
      panel.toggleAttribute("hidden", !isActive);
    });
  }

  private showRoom(): void {
    const previousState = this.getLifecycleState();
    this.visiblePanel = null;
    this.syncViewState(previousState);
  }

  private close(): void {
    this.overlayController?.close();
  }

  private selectPanel(panelId: SettingsPanelId): void {
    const previousState = this.getLifecycleState();
    this.activePanel = panelId;
    this.visiblePanel = panelId;
    this.syncViewState(previousState);
    if (this.isOpen) {
      return;
    }

    this.show(panelId);
  }

  private handleOverlayOpened(): void {
    const previousState = this.consumeTransitionState();
    this.visiblePanel = isSceneUiMode()
      ? this.visiblePanel
      : (this.visiblePanel ?? this.activePanel);
    if (this.visiblePanel !== null) {
      this.activePanel = this.visiblePanel;
    }
    this.syncViewState(previousState);
    syncWorkspaceToolState({
      tool: "settings",
      open: true,
      panel: this.visiblePanel,
    });
  }

  private handleOverlayClosed(): void {
    const previousState = this.consumeTransitionState();
    this.visiblePanel = null;
    this.syncViewState(previousState);
    syncWorkspaceToolState({
      tool: "settings",
      open: false,
      panel: null,
    });
  }

  private getLifecycleState(): SettingsPanelLifecycleState {
    return {
      open: this.isOpen,
      activePanel: this.visiblePanel,
    };
  }

  private consumeTransitionState(): SettingsPanelLifecycleState {
    const previousState = this.transitionState ?? {
      open: false,
      activePanel: null,
    };
    this.transitionState = null;
    return previousState;
  }

  private syncViewState(previousState: SettingsPanelLifecycleState): void {
    this.syncActivePanelUi();
    this.sceneController?.sync({ open: this.isOpen, activePanel: this.visiblePanel });
    emitSettingsPanelLifecycle(previousState, this.getLifecycleState());
  }
}
