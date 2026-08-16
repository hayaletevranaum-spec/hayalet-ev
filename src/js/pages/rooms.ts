import type { InstalledRoomRecord } from "@shared/index.js";
import type { PageController } from "../app/types.js";
import { shellT } from "../app/shell-i18n.js";
import { AppI18n } from "../modules/i18n/index.js";
import { getRoomPageName } from "../modules/rooms/room-markup.js";
import { RoomRegistry } from "../modules/rooms/room-registry.js";
import { resolveRoomShellName } from "../modules/rooms/room-shell-presentation.js";
import { createRoomsCorridorSceneDebugStore } from "../modules/rooms/room-scene-debug.js";
import { dispatchSceneAction } from "../scene/action-dispatcher.js";
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
} from "../scene-editor/index.js";
import { buildSceneCharacterRoster, resolveSceneAvatarSource } from "../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";
import { getSceneObjectNodesForView, resolveSceneNodeLabelText } from "../scene/layout/index.js";
import { navigateToScenePage, openSceneSettingsPanel } from "../scene/navigation.js";
import { getCoverSceneProjectionFromElement, type SceneProjection } from "../scene/projection.js";
import { renderSceneCharacterLayer } from "../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../scene/renderers/object-layer.js";
import { syncSceneViewRuntime } from "../scene/runtime.js";
import { getSceneRoomBackgroundSrc, SceneThemeManager } from "../scene-system/index.js";
import { isSceneUiMode } from "../ui/ui-mode.js";

const ELEMENT_IDS = {
  root: "rooms-scene-root",
  background: "rooms-scene-background",
  hotspotLayer: "rooms-scene-hotspots",
  characterLayer: "rooms-scene-characters",
  editorHost: "rooms-scene-editor-host",
  classicShell: "rooms-classic-shell",
} as const;

export class RoomsController implements PageController {
  private installedRooms: InstalledRoomRecord[] = [];
  private readonly sceneDebugSession = createSceneDebugRuntimeSession("rooms", {
    createLayoutStore: () =>
      createRoomsCorridorSceneDebugStore({
        getRooms: () => this.installedRooms,
      }),
  });
  private sceneDebugEnabled = false;
  private editor: SceneLayoutEditor | null = null;
  private editorSelection: SceneLayoutEditorSelection = null;
  private resizeObserver: ResizeObserver | null = null;
  private characterRenderToken = 0;
  private localeUnsub: (() => void) | null = null;
  private sceneThemeUnsub: (() => void) | null = null;
  private sceneThemeAssetDraftUnsub: (() => void) | null = null;
  private roomRegistryUnsub: (() => void) | null = null;

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

  init(): void {
    this.sceneDebugEnabled = applySceneDebugFlag();
    this.installedRooms = RoomRegistry.getInstalledRooms();
    this.sceneDebugSession.load(this.sceneDebugEnabled);
    this.setupSceneDebug();
    this.renderBackground();
    this.renderClassicRooms();
    this.observeLayout();
    this.localeUnsub ??= AppI18n.subscribe(() => {
      this.renderClassicRooms();
      this.renderHotspots();
      void this.renderCharacters();
      this.editor?.refresh();
    });
    this.roomRegistryUnsub ??= RoomRegistry.subscribe((rooms) => {
      this.installedRooms = rooms;
      this.sceneDebugSession.reloadFromActiveTheme(this.sceneDebugEnabled);
      this.renderClassicRooms();
      this.renderHotspots();
    });
    this.sceneThemeUnsub ??= SceneThemeManager.onChange(() => {
      this.sceneDebugSession.reloadFromActiveTheme(this.sceneDebugEnabled);
      this.editorSelection = null;
      this.syncScene();
    });
    this.sceneThemeAssetDraftUnsub ??= subscribeSceneThemeAssetDraft(() => {
      this.syncScene();
    });
    this.syncScene();
  }

  onShow(): void {
    this.syncScene();
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.localeUnsub?.();
    this.localeUnsub = null;
    this.sceneThemeUnsub?.();
    this.sceneThemeUnsub = null;
    this.sceneThemeAssetDraftUnsub?.();
    this.sceneThemeAssetDraftUnsub = null;
    this.roomRegistryUnsub?.();
    this.roomRegistryUnsub = null;
  }

  private setupSceneDebug(): void {
    const editorHost = this.getEditorHost();
    if (editorHost === null) {
      this.editor = null;
      return;
    }

    if (!this.sceneDebugEnabled) {
      editorHost.replaceChildren();
      this.editor = null;
      return;
    }

    const assetBindings = createSceneLayoutEditorAssetBindings({
      roomId: "rooms",
      getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
      getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
      onAfterChange: (): void => {
        this.renderBackground();
        this.renderHotspots();
        void this.renderCharacters();
        this.editor?.refresh();
      },
    });

    this.editor = new SceneLayoutEditor(editorHost, {
      isActive: (): boolean => this.isSceneDebugActive(),
      getSceneLayout: (): SceneLayoutConfig => this.sceneLayout,
      getSceneClickableTheme: (): SceneClickableThemeDefinition => this.sceneClickableTheme,
      getSelection: (): SceneLayoutEditorSelection => this.editorSelection,
      getRoomOptions: (): Array<{ id: string; label: string }> => getSceneDebugRoomOptions(shellT),
      getActiveRoomId: (): string => "rooms",
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
      updateBack: (): void => {
        return;
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
          console.info("Rooms scene layout copy failed.");
        }
      },
      saveSceneLayoutToSource: async (): Promise<void> => {
        await this.sceneDebugSession.saveSceneLayoutToSource();
      },
      updateSceneClickableTheme: (updater): void => {
        this.sceneClickableTheme = this.sceneDebugSession.updateSceneClickableTheme(updater);
        this.renderHotspots();
        this.editor?.refresh();
      },
      resetSceneClickableThemeDraft: (): void => {
        this.sceneClickableTheme = this.sceneDebugSession.resetSceneClickableThemeDraft();
        this.renderHotspots();
        this.editor?.refresh();
      },
      copySceneClickableTheme: async (): Promise<void> => {
        try {
          await this.sceneDebugSession.copySceneClickableTheme();
        } catch {
          console.info("Rooms scene clickable theme copy failed.");
        }
      },
      saveSceneClickableThemeToSource: async (): Promise<void> => {
        await this.sceneDebugSession.saveSceneClickableThemeToSource();
      },
      ...assetBindings,
    });
    this.editor.refresh();
  }

  private syncScene(): void {
    const sceneActive = isSceneUiMode();
    syncSceneViewRuntime({
      elements: {
        root: this.getRoot(),
        view: null,
        classicLayout: this.getClassicShell(),
      },
      state: {
        sceneActive,
        viewOpen: false,
      },
    });

    if (!sceneActive) {
      return;
    }

    this.renderBackground();
    this.renderClassicRooms();
    this.renderHotspots();
    void this.renderCharacters();
    this.editor?.refresh();
  }

  private renderBackground(): void {
    const background = this.getBackground();
    if (background === null) {
      return;
    }

    background.src = getSceneRoomBackgroundSrc("rooms");
    background.alt = "";
  }

  private renderHotspots(): void {
    const hotspotLayer = this.getHotspotLayer();
    if (hotspotLayer === null) {
      return;
    }

    renderSceneObjectLayer({
      layer: hotspotLayer,
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

  private async renderCharacters(): Promise<void> {
    const characterLayer = this.getCharacterLayer();
    if (characterLayer === null || !isSceneUiMode()) {
      return;
    }

    const characters = buildSceneCharacterRoster(
      this.sceneLayout.characters,
      this.sceneLayout.characterRosterPreset
    );
    if (characters.length === 0) {
      characterLayer.replaceChildren();
      return;
    }

    const renderToken = ++this.characterRenderToken;
    await renderSceneCharacterLayer({
      layer: characterLayer,
      characters,
      projection: this.getSceneProjection(),
      sceneDebugEnabled: isSceneDebugEnabled(),
      interactive: this.editor !== null,
      selectedCharacterId:
        this.editorSelection?.kind === "character" ? this.editorSelection.id : null,
      isStale: () => renderToken !== this.characterRenderToken,
      getDepthScale: (depth) => this.getDepthScale(depth),
      resolveAvatarSource: async (character) => {
        return await resolveSceneAvatarSource(character.avatarSource);
      },
      getNodeClassName: (character) => `entrance-scene__character is-${character.state}`,
      getFallbackHeadLabel: (character) => character.headLabel ?? "?",
      onActivate: (character) => {
        if (this.editor === null) {
          return;
        }
        this.editorSelection = { kind: "character", id: character.anchorId };
        this.editor.refresh();
        void this.renderCharacters();
      },
    });
  }

  private handleObject(id: string): void {
    const installedRoom =
      this.installedRooms.find((entry) => entry.scene?.roomsHotspot.id === id) ?? null;
    const sceneObject = this.sceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      if (installedRoom !== null) {
        navigateToScenePage(getRoomPageName(installedRoom.id));
      }
      return;
    }

    if (installedRoom !== null && this.editor === null) {
      navigateToScenePage(getRoomPageName(installedRoom.id));
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
      onWhisper: () => {},
      onBack: () => {},
    });
  }

  private observeLayout(): void {
    const root = this.getRoot();
    if (root === null || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (!isSceneUiMode()) {
        return;
      }
      this.renderHotspots();
      void this.renderCharacters();
      this.editor?.refresh();
    });
    this.resizeObserver.observe(root);
  }

  private isSceneDebugActive(): boolean {
    return isSceneDebugRoomActive("rooms");
  }

  private getDepthScale(depth: number): number {
    const normalizedDepth = Math.max(1, Number.isFinite(depth) ? depth : 1);
    const scaled = 1 - (normalizedDepth - 1) * 0.02;
    return Number(Math.max(0.75, scaled).toFixed(3));
  }

  private getSceneProjection(): SceneProjection {
    return getCoverSceneProjectionFromElement(this.getRoot(), this.sceneLayout.referenceSize);
  }

  private renderClassicRooms(): void {
    const host = document.getElementById("rooms-classic-list");
    if (host === null) {
      return;
    }

    if (host.dataset["bound"] !== "true") {
      host.dataset["bound"] = "true";
      host.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
          "[data-room-open]"
        );
        const roomId = button?.dataset["roomOpen"] ?? "";
        if (roomId !== "") {
          navigateToScenePage(getRoomPageName(roomId));
        }
      });
    }

    if (this.installedRooms.length === 0) {
      host.innerHTML = `<div class="room-manager-empty">${escapeHtml(
        shellT("rooms.emptyInstalled")
      )}</div>`;
      return;
    }

    host.innerHTML = this.installedRooms
      .map((room) => {
        const roomName = resolveRoomShellName(room.id, room.name);
        const trimmedDescription = room.description?.trim();
        const summary =
          trimmedDescription !== undefined && trimmedDescription !== ""
            ? trimmedDescription
            : room.id;
        const featureMarkup =
          room.features.length === 0
            ? ""
            : `<div class="rooms-classic-card__features">${room.features
                .map(
                  (feature) =>
                    `<span class="rooms-classic-card__feature">${escapeHtml(feature.name)}</span>`
                )
                .join("")}</div>`;

        return [
          '<article class="rooms-classic-card">',
          '  <div class="rooms-classic-card__head">',
          `    <div><div class="rooms-classic-card__title">${escapeHtml(roomName)}</div><div class="rooms-classic-card__subtitle">${escapeHtml(summary)}</div></div>`,
          `    <button class="btn btn-primary btn-sm" type="button" data-room-open="${escapeHtml(
            room.id
          )}">${escapeHtml(shellT("rooms.actions.open"))}</button>`,
          "  </div>",
          featureMarkup,
          "</article>",
        ].join("");
      })
      .join("");
  }

  private getRoot(): HTMLElement | null {
    return document.getElementById(ELEMENT_IDS.root);
  }

  private getBackground(): HTMLImageElement | null {
    return document.getElementById(ELEMENT_IDS.background) as HTMLImageElement | null;
  }

  private getHotspotLayer(): HTMLElement | null {
    return document.getElementById(ELEMENT_IDS.hotspotLayer);
  }

  private getCharacterLayer(): HTMLElement | null {
    return document.getElementById(ELEMENT_IDS.characterLayer);
  }

  private getEditorHost(): HTMLElement | null {
    return document.getElementById(ELEMENT_IDS.editorHost);
  }

  private getClassicShell(): HTMLElement | null {
    return document.getElementById(ELEMENT_IDS.classicShell);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
