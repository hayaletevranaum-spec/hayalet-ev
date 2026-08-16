import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import type { PageController } from "../app/types.js";
import { AppI18n } from "../modules/i18n/index.js";
import { RoomHostRuntime } from "../modules/rooms/room-host-runtime.js";
import {
  createInstalledRoomSceneDebugStore,
  createRoomScopedSceneThemeStore,
} from "../modules/rooms/room-scene-debug.js";
import {
  applySceneDebugFlag,
  createSceneDebugRuntimeSession,
  type SceneDebugRuntimeSession,
  type SceneLayoutEditor,
  type SceneLayoutEditorSelection,
} from "../scene-editor/index.js";
import type { SceneEditorAssetTargetDescriptor } from "../scene-editor/scene-theme-asset-state.js";
import { type SceneAlphaWindowBounds } from "../scene/alpha-window.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";
import { navigateToScenePage } from "../scene/navigation.js";
import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import { SceneUiScaleManager } from "../scene-system/index.js";
import { isSceneUiMode } from "../ui/ui-mode.js";
import { ThemeManager } from "../ui/theme/index.js";
import { createRoomPageSceneAssetRuntime } from "./room-page/scene-asset-runtime.js";
import { createRoomPageRuntimeHostRuntime } from "./room-page/runtime-host-runtime.js";
import {
  getRoomPageElement,
  getRoomPageRuntimeMount,
  getRoomPageSceneEditorHost,
  getRoomPageSceneRuntimeSlot,
} from "./room-page/page-dom.js";
import {
  getRoomActiveFeature,
  getRoomSceneFeature,
  getRoomSceneReferenceSize,
  isRoomSceneFeatureOpen,
  resolveRoomInitialFeatureId,
  usesImmersiveRoomPageShell,
} from "./room-page/page-state.js";
import { updateRoomPageStatusPanel } from "./room-page/page-shell-runtime.js";
import { roomPageT } from "./room-page/page-text-runtime.js";
import { syncRoomPageSceneChrome } from "./room-page/scene-chrome-runtime.js";
import { renderRoomPageSceneCharacters } from "./room-page/scene-character-runtime.js";
import {
  bindRoomContextSubscriptions as bindRoomPageContextSubscriptions,
  clearRoomContextSubscriptions as clearRoomPageContextSubscriptions,
} from "./room-page/runtime-subscriptions.js";
import { type RoomHostMessage } from "./room-page/runtime-context.js";
import { createRoomPageRuntimeContextRuntime } from "./room-page/runtime-context-runtime.js";
import { resolveRoomPreloadUrl } from "./room-page/runtime-host.js";
import { type RoomWebviewElement } from "./room-page/runtime-messaging.js";
import { type RoomRuntimeState } from "./room-page/runtime-events.js";
import { createRoomPageSceneRuntime } from "./room-page/page-scene-runtime.js";

export class RoomPageController implements PageController {
  private room: InstalledRoomRecord;
  private readonly pageName: string;
  private readonly sceneDebugSession: SceneDebugRuntimeSession;
  private runtimeState: RoomRuntimeState = "idle";
  private lastRuntimeEvent = roomPageT("status.handshakeWaiting");
  private runtimeClosed = false;
  private preloadUrlPromise: Promise<string> | null = null;
  private unsubscribeI18n: (() => void) | null = null;
  private readonly slotSubscriptions: Array<() => void> = [];
  private readonly pendingHostMessages = new WeakMap<RoomWebviewElement, RoomHostMessage[]>();
  private activeFeatureId: string;
  private sceneFeatureId: string | null = null;
  private sceneDebugEnabled = false;
  private editor: SceneLayoutEditor | null = null;
  private editorSelection: SceneLayoutEditorSelection = null;
  private sceneCharacterRenderToken = 0;
  private readonly sceneAssetRuntime: ReturnType<typeof createRoomPageSceneAssetRuntime>;
  private readonly runtimeContextRuntime: ReturnType<typeof createRoomPageRuntimeContextRuntime>;
  private readonly runtimeHostRuntime: ReturnType<typeof createRoomPageRuntimeHostRuntime>;
  private readonly sceneRuntime: ReturnType<typeof createRoomPageSceneRuntime>;
  private unsubscribeThemeChange: (() => void) | null = null;
  private unsubscribeSceneUiScaleChange: (() => void) | null = null;

  constructor(room: InstalledRoomRecord, pageName: string) {
    this.room = { ...room };
    this.pageName = pageName;
    this.activeFeatureId = this.resolveInitialFeatureId(room, null);
    this.sceneDebugSession = createSceneDebugRuntimeSession(pageName, {
      createLayoutStore: () =>
        createInstalledRoomSceneDebugStore({
          roomId: room.id,
          getRoom: () => this.room,
        }),
      createThemeStore: () => createRoomScopedSceneThemeStore(room.id),
    });
    this.sceneAssetRuntime = createRoomPageSceneAssetRuntime({
      getPageName: () => this.pageName,
      getPage: () => this.getPage(),
      getRoom: () => this.room,
      setRoom: (nextRoom) => {
        this.room = nextRoom;
      },
      getActiveFeature: () => this.getActiveFeature(),
      refreshSceneShell: () => {
        this.refreshSceneShell();
      },
      refreshEditor: () => {
        this.editor?.refresh();
      },
      renderSceneRoomCharacters: async (page) => {
        await this.renderSceneRoomCharacters(page);
      },
    });
    this.runtimeContextRuntime = createRoomPageRuntimeContextRuntime({
      getActiveFeature: () => this.getActiveFeature(),
      getPage: () => this.getPage(),
      getRoom: () => this.room,
      getSceneFeature: () => this.getSceneFeature(),
      isSceneFeatureOpen: () => this.isSceneFeatureOpen(),
      pendingHostMessages: this.pendingHostMessages,
    });
    this.runtimeHostRuntime = createRoomPageRuntimeHostRuntime({
      closeRoom: () => {
        this.closeRoomRuntime();
      },
      getPage: () => this.getPage(),
      getRoomPreloadUrl: this.getRoomPreloadUrl.bind(this),
      getRoom: () => this.room,
      getRuntimeMountHost: (page) => {
        if (this.isSceneFeatureOpen()) {
          return this.getSceneRuntimeSlot(page);
        }
        return getRoomPageRuntimeMount(page);
      },
      pendingHostMessages: this.pendingHostMessages,
      runtimeSceneAriaLabel: roomPageT("page.runtimeSceneAriaLabel"),
      sendHostContext: (target, reason): void => {
        this.runtimeContextRuntime.sendHostContext(target, reason);
      },
      setRuntimeState: (runtimeState, lastRuntimeEvent) => {
        this.runtimeState = runtimeState;
        this.lastRuntimeEvent = lastRuntimeEvent;
      },
      translate: roomPageT,
      updateRuntimeStatus: (page) => {
        updateRoomPageStatusPanel({
          lastRuntimeEvent: this.lastRuntimeEvent,
          page,
          runtimeState: this.runtimeState,
          translate: roomPageT,
        });
      },
    });
    this.sceneRuntime = createRoomPageSceneRuntime({
      buildSceneAssetTargets: () => this.buildSceneAssetTargets(),
      clearSceneAssetTransparentWindow: (targetId) => {
        this.clearSceneAssetTransparentWindow(targetId);
      },
      closeSceneFeatureView: () => {
        this.closeSceneFeatureView();
      },
      detectSceneAssetTransparentWindow: async (targetId) => {
        await this.detectSceneAssetTransparentWindow(targetId);
      },
      getActiveFeature: () => this.getActiveFeature(),
      getEditor: () => this.editor,
      getEditorSelection: () => this.editorSelection,
      getRoom: () => this.room,
      getSceneClickableTheme: () => this.sceneClickableTheme,
      getSceneFeature: () => this.getSceneFeature(),
      getSceneReferenceSize: () => this.getSceneReferenceSize(),
      getSuggestedSceneAssetTargetId: () => this.getSuggestedSceneAssetTargetId(),
      isSceneDebugActive: () => this.isSceneDebugActive(),
      isSceneFeatureOpen: () => this.isSceneFeatureOpen(),
      refreshEditor: () => {
        this.editor?.refresh();
      },
      refreshSceneCharacters: () => {
        this.refreshSceneCharacters();
      },
      refreshSceneShell: () => {
        this.refreshSceneShell();
      },
      renderSceneRoomCharacters: async (page) => {
        await this.renderSceneRoomCharacters(page);
      },
      sceneDebugEnabled: this.sceneDebugEnabled,
      sceneDebugSession: this.sceneDebugSession,
      sceneLayout: this.sceneLayout,
      setActiveFeature: (featureId, reason) => {
        this.setActiveFeature(featureId, reason);
      },
      setEditor: (editor) => {
        this.editor = editor;
      },
      setEditorSelection: (selection) => {
        this.editorSelection = selection;
      },
      setSceneClickableTheme: (sceneClickableTheme) => {
        this.sceneClickableTheme = sceneClickableTheme;
      },
      setSceneLayout: (sceneLayout) => {
        this.sceneLayout = sceneLayout;
      },
      updateSceneAssetTransparentWindow: (targetId, nextBounds) => {
        this.updateSceneAssetTransparentWindow(targetId, nextBounds);
      },
      usesImmersivePageShell: () => this.usesImmersivePageShell(),
    });
  }

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

  updateRoom(room: InstalledRoomRecord): void {
    this.activeFeatureId = this.resolveInitialFeatureId(room, this.activeFeatureId);
    this.sceneFeatureId =
      this.sceneFeatureId !== null &&
      room.features.some(
        (feature) => feature.id === this.sceneFeatureId && feature.scene !== undefined
      )
        ? this.sceneFeatureId
        : null;
    this.room = { ...room };
    this.render();
  }

  init(): void {
    this.sceneDebugEnabled = applySceneDebugFlag();
    this.sceneDebugSession.load(this.sceneDebugEnabled);
    this.unsubscribeI18n ??= AppI18n.subscribe(() => {
      this.render();
      void this.runtimeContextRuntime.sync("locale-change");
    });
    this.unsubscribeThemeChange ??= ThemeManager.onChange(() => {
      void this.runtimeContextRuntime.sync("theme-appearance");
    });
    this.unsubscribeSceneUiScaleChange ??= SceneUiScaleManager.onChange(() => {
      void this.runtimeContextRuntime.sync("scene-scale");
    });
    this.bindRoomContextSubscriptions();
    this.render();
  }

  onShow(): void {
    this.runtimeClosed = false;
    this.render();
    this.editor?.refresh();
    void this.runtimeHostRuntime.ensure();
  }

  render(): void {
    const page = this.getPage();
    if (page === null) {
      return;
    }

    syncRoomPageSceneChrome(page, this.room);
    this.sceneRuntime.setupSceneDebug(page);
    this.sceneRuntime.syncPageView(page);
    if (this.shouldEnsureRuntimeHost(page)) {
      void this.runtimeHostRuntime.ensure(page);
    }
  }

  dispose(): void {
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.unsubscribeThemeChange?.();
    this.unsubscribeThemeChange = null;
    this.unsubscribeSceneUiScaleChange?.();
    this.unsubscribeSceneUiScaleChange = null;
    this.clearRoomContextSubscriptions();
    void RoomHostRuntime.disposeRoom(this.room.id);
    const classicMount = getRoomPageRuntimeMount(this.getPage());
    const sceneMount = getRoomPageSceneRuntimeSlot(this.getPage());
    getRoomPageSceneEditorHost(this.getPage())?.replaceChildren();
    this.editor = null;
    classicMount?.replaceChildren();
    sceneMount?.replaceChildren();
  }

  private resolveInitialFeatureId(room: InstalledRoomRecord, preferredId: string | null): string {
    return resolveRoomInitialFeatureId(room, preferredId);
  }

  private getActiveFeature(): InstalledRoomFeatureRecord | null {
    return getRoomActiveFeature(this.room, this.activeFeatureId);
  }

  private getSceneFeature(): InstalledRoomFeatureRecord | null {
    return getRoomSceneFeature(this.room, this.sceneFeatureId);
  }

  private isSceneFeatureOpen(): boolean {
    return isRoomSceneFeatureOpen(this.room, this.sceneFeatureId);
  }

  private getSceneReferenceSize(): { width: number; height: number } {
    return getRoomSceneReferenceSize(this.room);
  }

  private usesImmersivePageShell(): boolean {
    return usesImmersiveRoomPageShell(this.room);
  }

  private getPage(): HTMLElement | null {
    return getRoomPageElement(this.pageName);
  }

  private shouldEnsureRuntimeHost(page: HTMLElement): boolean {
    return this.runtimeClosed === false && page.classList.contains("is-hidden") === false;
  }

  private closeRoomRuntime(): void {
    this.runtimeClosed = true;
    this.runtimeState = "idle";
    this.lastRuntimeEvent = roomPageT("status.closed");
    void RoomHostRuntime.disposeRoom(this.room.id);

    getRoomPageRuntimeMount(this.getPage())?.replaceChildren();
    getRoomPageSceneRuntimeSlot(this.getPage())?.replaceChildren();
    navigateToScenePage("entrance");
  }

  private bindRoomContextSubscriptions(): void {
    bindRoomPageContextSubscriptions({
      slotSubscriptions: this.slotSubscriptions,
      syncContext: () => {
        void this.runtimeContextRuntime.sync("slot-state");
      },
      syncSceneCharacters: () => {
        this.refreshSceneCharacters();
      },
    });
  }

  private clearRoomContextSubscriptions(): void {
    clearRoomPageContextSubscriptions(this.slotSubscriptions);
  }

  private getSceneRuntimeSlot(page: HTMLElement | null = this.getPage()): HTMLElement | null {
    return getRoomPageSceneRuntimeSlot(page);
  }

  private isSceneDebugActive(): boolean {
    return isSceneUiMode();
  }

  private buildSceneAssetTargets(): SceneEditorAssetTargetDescriptor[] {
    return this.sceneAssetRuntime.buildSceneAssetTargets();
  }

  private getSuggestedSceneAssetTargetId(): string | null {
    return this.sceneAssetRuntime.getSuggestedSceneAssetTargetId();
  }

  private async detectSceneAssetTransparentWindow(targetId: string): Promise<void> {
    await this.sceneAssetRuntime.detectSceneAssetTransparentWindow(targetId);
  }

  private clearSceneAssetTransparentWindow(targetId: string): void {
    this.sceneAssetRuntime.clearSceneAssetTransparentWindow(targetId);
  }

  private updateSceneAssetTransparentWindow(
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ): void {
    this.sceneAssetRuntime.updateSceneAssetTransparentWindow(targetId, nextBounds);
  }

  private refreshSceneShell(): void {
    const page = this.getPage();
    if (page === null) {
      return;
    }

    this.sceneRuntime.syncPageView(page);
  }

  private refreshSceneCharacters(): void {
    this.sceneAssetRuntime.refreshSceneCharacters();
  }

  private async renderSceneRoomCharacters(page: HTMLElement): Promise<void> {
    const renderToken = ++this.sceneCharacterRenderToken;
    await renderRoomPageSceneCharacters({
      isStale: () => renderToken !== this.sceneCharacterRenderToken,
      page,
      referenceSize: this.getSceneReferenceSize(),
      sceneDebugEnabled: this.sceneDebugEnabled,
      sceneLayout: this.sceneLayout,
    });
  }

  private closeSceneFeatureView(): void {
    if (!isSceneUiMode()) {
      return;
    }
    this.sceneFeatureId = null;
    this.render();
    void this.runtimeContextRuntime.sync("scene-close");
  }

  private setActiveFeature(featureId: string, reason: string): void {
    const feature =
      featureId === ""
        ? null
        : (this.room.features.find((candidate) => candidate.id === featureId) ?? null);

    if (feature === null) {
      return;
    }
    this.activeFeatureId = feature.id;
    this.sceneFeatureId = feature.scene !== undefined ? feature.id : null;
    this.render();
    void this.runtimeContextRuntime.sync(reason);
  }

  private async getRoomPreloadUrl(): Promise<string> {
    this.preloadUrlPromise = resolveRoomPreloadUrl({
      electronApi: window.electronAPI,
      existingPromise: this.preloadUrlPromise,
    });
    return await this.preloadUrlPromise;
  }
}
