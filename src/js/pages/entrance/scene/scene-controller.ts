import { AppState } from "../../../modules/app-state.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import { TrafficManager } from "../../../modules/traffic-manager.js";
import { shellT } from "../../../app/shell-i18n.js";
import { dispatchSceneAction } from "../../../scene/action-dispatcher.js";
import {
  applySceneDebugFlag,
  createSceneLayoutEditorAssetBindings,
  createSceneDebugRuntimeSession,
  SceneLayoutEditor,
  type SceneLayoutEditorSelection,
  getSceneDebugRoomOptions,
  isSceneDebugRoomActive,
  isSceneDebugEnabled,
  openSceneDebugRoom,
  subscribeSceneThemeAssetDraft,
} from "../../../scene-editor/index.js";
import {
  buildSceneCharacterRoster,
  resolveSceneAvatarSource,
  type SceneCharacterDescriptor,
} from "../../../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../../../scene/schema.js";
import type { SceneLayoutConfig } from "../../../scene/layout/index.js";
import {
  getSceneObjectNodesForView,
  resolveSceneNodeLabelText,
} from "../../../scene/layout/index.js";
import {
  navigateToScenePage,
  openSceneSettingsPanel,
  openSceneWorkspaceTool,
} from "../../../scene/navigation.js";
import { getCoverSceneProjection } from "../../../scene/projection.js";
import { renderSceneBackLayer } from "../../../scene/renderers/back-layer.js";
import { renderSceneCharacterLayer } from "../../../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../../../scene/renderers/object-layer.js";
import {
  getSceneRoomBackgroundSrc,
  getSceneRoomViewBackgroundSrc,
  SceneThemeManager,
} from "../../../scene-system/index.js";
import { syncSceneViewRuntime } from "../../../scene/runtime.js";
import { isSceneUiMode } from "../../../ui/ui-mode.js";

import { SceneCharacterMenu } from "./scene-character-menu.js";
import type { SceneEntranceBridge } from "./scene-entrance-bridge.js";

const ELEMENT_IDS = {
  root: "entrance-scene-root",
  background: "entrance-scene-background",
  hotspotLayer: "entrance-scene-hotspots",
  characterLayer: "entrance-scene-characters",
  editorHost: "entrance-scene-editor-host",
  menuHost: "entrance-scene-menu-host",
  viewRoot: "entrance-scene-view",
  viewBackground: "entrance-scene-view-background",
  viewSlot: "entrance-scene-view-slot",
} as const;

export class EntranceSceneController {
  bridge: SceneEntranceBridge;
  root: HTMLElement | null = null;
  background: HTMLImageElement | null = null;
  hotspotLayer: HTMLElement | null = null;
  characterLayer: HTMLElement | null = null;
  editorHost: HTMLElement | null = null;
  menuHost: HTMLElement | null = null;
  viewRoot: HTMLElement | null = null;
  viewBackground: HTMLImageElement | null = null;
  viewSlot: HTMLElement | null = null;
  menu: SceneCharacterMenu | null = null;
  editor: SceneLayoutEditor | null = null;
  resizeObserver: ResizeObserver | null = null;
  trafficUnsub: (() => void) | null = null;
  appStateUnsub: (() => void) | null = null;
  localeUnsub: (() => void) | null = null;
  sceneThemeUnsub: (() => void) | null = null;
  sceneThemeAssetDraftUnsub: (() => void) | null = null;
  characterRenderToken = 0;
  openCharacterId: string | null = null;
  characters = new Map<string, SceneCharacterDescriptor>();
  private readonly sceneDebugSession = createSceneDebugRuntimeSession("entrance");
  sceneDebugEnabled = false;
  editorSelection: SceneLayoutEditorSelection = null;

  get sceneLayout(): SceneLayoutConfig {
    return this.sceneDebugSession.getSceneLayout();
  }

  set sceneLayout(sceneLayout: SceneLayoutConfig) {
    this.sceneDebugSession.setSceneLayout(sceneLayout);
  }

  get sceneClickableTheme(): SceneClickableThemeDefinition {
    return this.sceneDebugSession.getSceneClickableTheme();
  }

  set sceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition) {
    this.sceneDebugSession.setSceneClickableTheme(sceneClickableTheme);
  }

  constructor(bridge: SceneEntranceBridge) {
    this.bridge = bridge;
  }

  init(): void {
    this.sceneDebugEnabled = applySceneDebugFlag();
    this.root = document.getElementById(ELEMENT_IDS.root);
    this.background = document.getElementById(ELEMENT_IDS.background) as HTMLImageElement | null;
    this.hotspotLayer = document.getElementById(ELEMENT_IDS.hotspotLayer);
    this.characterLayer = document.getElementById(ELEMENT_IDS.characterLayer);
    this.editorHost = document.getElementById(ELEMENT_IDS.editorHost);
    this.menuHost = document.getElementById(ELEMENT_IDS.menuHost);
    this.viewRoot = document.getElementById(ELEMENT_IDS.viewRoot);
    this.viewBackground = document.getElementById(
      ELEMENT_IDS.viewBackground
    ) as HTMLImageElement | null;
    this.viewSlot = document.getElementById(ELEMENT_IDS.viewSlot);
    this.sceneDebugSession.load(this.sceneDebugEnabled);
    if (this.menuHost !== null) {
      this.menu = new SceneCharacterMenu(this.menuHost, this.bridge, {
        onClose: (): void => {
          this.openCharacterId = null;
          this.syncOpenMenuAnchor();
        },
      });
    }
    if (this.sceneDebugEnabled && this.editorHost !== null) {
      const assetBindings = createSceneLayoutEditorAssetBindings({
        roomId: "entrance",
        getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
        getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
        onAfterChange: (): void => {
          this.renderBackground();
          this.renderHotspots();
          this.syncViewState();
          void this.renderCharacters();
          this.editor?.refresh();
        },
      });

      this.editor = new SceneLayoutEditor(this.editorHost, {
        isActive: (): boolean => isSceneDebugRoomActive("entrance"),
        getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
        getSceneClickableTheme: (): SceneClickableThemeDefinition => this.sceneClickableTheme,
        getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
        getRoomOptions: (): Array<{ id: string; label: string }> =>
          getSceneDebugRoomOptions(shellT),
        getActiveRoomId: (): string => "entrance",
        setSelection: (selection): void => {
          this.editorSelection = selection;
          this.editor?.refresh();
          this.renderHotspots();
          void this.renderCharacters();
        },
        navigateToRoom: (roomId: string): void => {
          openSceneDebugRoom(roomId);
        },
        updateObject: (id, updater): void => {
          this.sceneDebugSession.updateObject(id, updater);
          this.renderHotspots();
          this.editor?.refresh();
        },
        updateBack: (id, updater): void => {
          this.sceneDebugSession.updateBack(id, updater);
          this.syncViewState();
          this.renderHotspots();
          this.editor?.refresh();
        },
        updateCharacter: (id, updater): void => {
          this.sceneDebugSession.updateCharacter(id, updater);
          void this.renderCharacters();
          this.editor?.refresh();
        },
        resetDraft: (): void => {
          this.sceneLayout = this.sceneDebugSession.resetSceneLayoutDraft();
          this.editorSelection = null;
          this.renderHotspots();
          void this.renderCharacters();
          this.editor?.refresh();
        },
        copySceneLayout: async (): Promise<void> => {
          try {
            await this.sceneDebugSession.copySceneLayout();
          } catch {
            console.info("Scene layout copy failed.");
          }
        },
        saveSceneLayoutToSource: async (): Promise<void> => {
          await this.sceneDebugSession.saveSceneLayoutToSource();
        },
        updateSceneClickableTheme: (updater): void => {
          this.sceneClickableTheme = this.sceneDebugSession.updateSceneClickableTheme(updater);
          this.renderHotspots();
          this.syncViewState();
          this.editor?.refresh();
        },
        resetSceneClickableThemeDraft: (): void => {
          this.sceneClickableTheme = this.sceneDebugSession.resetSceneClickableThemeDraft();
          this.renderHotspots();
          this.syncViewState();
          this.editor?.refresh();
        },
        copySceneClickableTheme: async (): Promise<void> => {
          try {
            await this.sceneDebugSession.copySceneClickableTheme();
          } catch {
            console.info("Scene clickable theme copy failed.");
          }
        },
        saveSceneClickableThemeToSource: async (): Promise<void> => {
          await this.sceneDebugSession.saveSceneClickableThemeToSource();
        },
        ...assetBindings,
      });
      this.editor.refresh();
    }

    this.renderStatic();
    this.subscribeRuntimeSignals();
    this.observeLayout();
    this.syncScene();
  }

  onShow(): void {
    this.syncScene();
  }

  onHide(): void {
    this.menu?.close(false);
    this.openCharacterId = null;
  }

  syncScene(): void {
    if (this.root === null) {
      return;
    }

    const sceneActive = isSceneUiMode();
    syncSceneViewRuntime({
      elements: {
        root: this.root,
        view: this.viewRoot,
        viewSlot: this.viewSlot,
      },
      state: {
        sceneActive,
        viewOpen: false,
      },
    });

    if (!sceneActive) {
      this.menu?.close(false);
      this.openCharacterId = null;
      return;
    }

    this.renderBackground();
    this.renderHotspots();
    this.syncViewState();
    void this.renderCharacters();
    this.editor?.refresh();
  }

  private renderStatic(): void {
    this.renderBackground();
    this.renderHotspots();
    this.syncViewState();
    void this.renderCharacters();
    this.editor?.refresh();
  }

  private subscribeRuntimeSignals(): void {
    this.trafficUnsub ??= TrafficManager.onUpdate(() => {
      void this.renderCharacters();
    });

    this.appStateUnsub ??= AppState.subscribe(() => {
      void this.renderCharacters();
    });

    this.localeUnsub ??= AppI18n.subscribe(() => {
      this.renderHotspots();
      this.syncViewState();
      this.syncOpenMenuAnchor();
      this.editor?.refresh();
    });

    this.sceneThemeUnsub ??= SceneThemeManager.onChange(() => {
      this.sceneDebugSession.reloadFromActiveTheme(this.sceneDebugEnabled);
      this.editorSelection = null;
      this.menu?.close(false);
      this.openCharacterId = null;
      this.syncScene();
    });

    this.sceneThemeAssetDraftUnsub ??= subscribeSceneThemeAssetDraft(() => {
      this.syncScene();
      this.syncOpenMenuAnchor();
    });
  }

  private renderBackground(): void {
    if (this.background !== null) {
      this.background.src = getSceneRoomBackgroundSrc("entrance");
      this.background.alt = "";
    }

    if (this.viewBackground !== null) {
      this.viewBackground.src = getSceneRoomViewBackgroundSrc("entrance", "whisper") ?? "";
      this.viewBackground.alt = "";
    }
  }

  private renderHotspots(): void {
    if (this.hotspotLayer === null) {
      return;
    }

    renderSceneObjectLayer({
      layer: this.hotspotLayer,
      nodes: getSceneObjectNodesForView(this.sceneLayout),
      themeDefaults: this.sceneClickableTheme.object,
      projection: this.getSceneProjection(),
      cssVarPrefix: "scene-hotspot",
      classNames: {
        item: "entrance-scene__hotspot-item",
        button: "entrance-scene__hotspot",
        label: "entrance-scene__hotspot-label",
      },
      selection: this.editorSelection,
      clickableLabels: true,
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        this.handleObject(node.id);
      },
    });
  }

  private observeLayout(): void {
    if (this.root === null || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (!isSceneUiMode()) {
        return;
      }
      this.renderHotspots();
      void this.renderCharacters();
      this.syncViewState();
      this.syncOpenMenuAnchor();
      this.editor?.refresh();
    });
    this.resizeObserver.observe(this.root);
  }

  private getSceneProjection(): {
    offsetX: number;
    offsetY: number;
    scale: number;
  } {
    return getCoverSceneProjection({
      surfaceWidth: this.root?.clientWidth ?? 0,
      surfaceHeight: this.root?.clientHeight ?? 0,
      referenceWidth: this.sceneLayout.referenceSize.width,
      referenceHeight: this.sceneLayout.referenceSize.height,
    });
  }

  private getDepthScale(depth: number): number {
    const safeDepth = Number.isFinite(depth) ? depth : 1;
    const normalizedDepth = Math.max(1, safeDepth);
    const scaled = 1 - (normalizedDepth - 1) * 0.02;
    return Number(Math.max(0.75, scaled).toFixed(3));
  }

  private handleObject(id: string): void {
    const sceneObject = this.sceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      return;
    }

    if (this.editor !== null) {
      this.editorSelection = { kind: "object", id: sceneObject.id };
      this.editor.refresh();
      this.renderHotspots();
      return;
    }

    dispatchSceneAction(sceneObject.action, {
      onNavigate: (page) => {
        navigateToScenePage(page);
      },
      onSettings: (action) => {
        openSceneSettingsPanel(action.panel);
      },
      onSettingsSceneClose: () => {},
      onScreen: () => {},
      onWhisper: () => {
        this.menu?.close(false);
        this.openCharacterId = null;
        openSceneWorkspaceTool("whisper");
      },
      onBack: () => {},
    });
  }

  private async renderCharacters(): Promise<void> {
    if (this.characterLayer === null || !isSceneUiMode()) {
      return;
    }

    const renderToken = ++this.characterRenderToken;
    const characters = buildSceneCharacterRoster(
      this.sceneLayout.characters,
      this.sceneLayout.characterRosterPreset
    );
    this.characters = new Map(characters.map((character) => [character.id, character]));
    await renderSceneCharacterLayer({
      layer: this.characterLayer,
      characters,
      projection: this.getSceneProjection(),
      sceneDebugEnabled: isSceneDebugEnabled(),
      interactive: true,
      selectedCharacterId:
        this.editorSelection?.kind === "character" ? this.editorSelection.id : null,
      menuOpenCharacterId: this.openCharacterId,
      isStale: () => renderToken !== this.characterRenderToken,
      getDepthScale: (depth) => this.getDepthScale(depth),
      resolveAvatarSource: async (character) => {
        return await resolveSceneAvatarSource(character.avatarSource);
      },
      getNodeClassName: (character) => `entrance-scene__character is-${character.state}`,
      getFallbackHeadLabel: (character) => character.headLabel ?? "?",
      onActivate: (character, anchorElement) => {
        if (this.editor !== null) {
          this.editorSelection = { kind: "character", id: character.anchorId };
          this.editor.refresh();
          void this.renderCharacters();
          return;
        }
        this.toggleCharacterMenu(character, anchorElement);
      },
    });
    this.syncOpenMenuAnchor();
  }

  private syncViewState(): void {
    if (!(this.viewRoot instanceof HTMLElement)) {
      return;
    }

    renderSceneBackLayer({
      host: this.viewRoot,
      node: null,
      themeDefaults: this.sceneClickableTheme.back,
      projection: this.getSceneProjection(),
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        if (this.editor !== null) {
          this.editorSelection = { kind: "back", id: node.id };
          this.editor.refresh();
          return;
        }

        dispatchSceneAction(node.action, {
          onNavigate: () => {},
          onSettings: () => {},
          onSettingsSceneClose: () => {},
          onScreen: () => {},
          onWhisper: () => {},
          onBack: () => {},
        });
      },
    });
  }

  private toggleCharacterMenu(
    character: SceneCharacterDescriptor,
    anchorElement: HTMLElement
  ): void {
    if (this.menu === null) {
      return;
    }

    if (this.openCharacterId === character.id) {
      this.menu.close();
      return;
    }

    this.openCharacterId = character.id;
    this.menu.open(character, anchorElement);
    this.syncOpenMenuAnchor();
  }

  private syncOpenMenuAnchor(): void {
    if (this.characterLayer === null) {
      return;
    }

    this.characterLayer
      .querySelectorAll<HTMLElement>(".entrance-scene__character")
      .forEach((node) => {
        node.classList.toggle("is-menu-open", node.dataset["characterId"] === this.openCharacterId);
        node.setAttribute(
          "aria-expanded",
          String(node.dataset["characterId"] === this.openCharacterId)
        );
      });

    if (this.menu === null || this.openCharacterId === null) {
      return;
    }

    const character = this.characters.get(this.openCharacterId) ?? null;
    const selector = `[data-character-id="${this.escapeForAttribute(this.openCharacterId)}"]`;
    const anchorElement = this.characterLayer.querySelector<HTMLElement>(selector);

    if (character === null || anchorElement === null) {
      this.menu.close();
      return;
    }

    this.menu.refresh(character, anchorElement);
  }

  private escapeForAttribute(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
}
