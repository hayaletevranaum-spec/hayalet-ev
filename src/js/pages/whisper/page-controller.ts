import { LogCategory } from "@shared/logging-core";
import { AppI18n } from "../../modules/i18n/index.js";
import { Logger } from "../../modules/logger/index.js";
import {
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  createManagedOverlayController,
  mountElementInOverlayHostLayer,
  OVERLAY_SURFACE_FAMILIES,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import {
  WORKSPACE_TOOL_CLOSE_EVENT,
  WORKSPACE_TOOL_OPEN_EVENT,
  syncWorkspaceToolState,
  type WorkspaceToolCloseDetail,
  type WorkspaceToolOpenDetail,
} from "../../ui/workspace-tool-overlay.js";
import { ensureRuntimePageStyles } from "../../app/runtime-page-styles.js";
import { mountWorkspaceToolSceneChrome } from "../../scene/workspace-tool-scene-chrome.js";
import { WhisperDockController } from "./controller.js";
import { applyWhisperStaticTranslations } from "./i18n.js";

function isHostedInMainShell(): boolean {
  return document.getElementById("pages-container") instanceof HTMLElement;
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

export class WhisperPageController {
  private dockController = new WhisperDockController();
  private closeButton: HTMLButtonElement | null = null;
  private pageRoot: HTMLElement | null = null;
  private overlayController: ManagedOverlayController | null = null;
  private initialized = false;
  private isOverlayOpen = false;
  private unsubscribeI18n: (() => void) | null = null;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.pageRoot = document.getElementById("page-whisper");
    this.closeButton = document.getElementById("whisper-page-close") as HTMLButtonElement | null;
    if (!(this.pageRoot instanceof HTMLElement)) {
      return;
    }

    if (isHostedInMainShell()) {
      mountElementInOverlayHostLayer(this.pageRoot, OVERLAY_SURFACE_FAMILIES.workspaceTool);
    }

    this.overlayController = createManagedOverlayController({
      id: "workspace-tool-whisper",
      element: this.pageRoot,
      kind: OVERLAY_KINDS.workspace,
      exclusiveGroup: OVERLAY_GROUPS.workspace,
      isOpen: () => this.isOverlayOpen,
      setOpen: (open: boolean) => {
        this.isOverlayOpen = open;
        applyWorkspaceToolPageVisibility(this.pageRoot as HTMLElement, open);
      },
      onAfterOpen: () => {
        this.handleWorkspaceOpen();
      },
      onAfterClose: () => {
        this.handleWorkspaceClose();
      },
    });

    this.closeButton?.addEventListener("click", () => {
      this.overlayController?.close();
    });

    mountWorkspaceToolSceneChrome({
      root: this.pageRoot,
      onBack: () => {
        this.overlayController?.close();
      },
    });

    document.addEventListener(WORKSPACE_TOOL_OPEN_EVENT, ((
      event: CustomEvent<WorkspaceToolOpenDetail>
    ) => {
      if (event.detail.tool !== "whisper") {
        return;
      }

      void this.handleWorkspaceToolOpenRequest();
    }) as EventListener);

    document.addEventListener(WORKSPACE_TOOL_CLOSE_EVENT, ((
      event: CustomEvent<WorkspaceToolCloseDetail>
    ) => {
      if (event.detail.tool !== "whisper") {
        return;
      }

      this.overlayController?.close();
    }) as EventListener);

    this.dockController.init();
    this.applyStaticTranslations();
    this.unsubscribeI18n = AppI18n.subscribe(() => {
      this.applyStaticTranslations();
    });
    if (isHostedInMainShell()) {
      applyWorkspaceToolPageVisibility(this.pageRoot, false);
    }
    this.initialized = true;
  }

  onShow(): void {
    this.dockController.setExpanded(true);
    void this.dockController.render();
    this.focusComposer();
  }

  onHide(): void {
    this.dockController.setExpanded(false);
  }

  dispose(): void {
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
  }

  private async handleWorkspaceToolOpenRequest(): Promise<void> {
    try {
      await this.ensureHostedStyles();
      this.overlayController?.open();
    } catch (error) {
      this.handleHostedStylesLoadFailure(error);
    }
  }

  private handleWorkspaceOpen(): void {
    this.onShow();
    syncWorkspaceToolState({
      tool: "whisper",
      open: true,
      panel: null,
    });
  }

  private handleWorkspaceClose(): void {
    this.onHide();
    syncWorkspaceToolState({
      tool: "whisper",
      open: false,
      panel: null,
    });
  }

  private focusComposer(): void {
    window.requestAnimationFrame(() => {
      const addTextInput = document.getElementById("whisper-add-text");
      if (addTextInput instanceof HTMLTextAreaElement) {
        addTextInput.focus();
      }
    });
  }

  private applyStaticTranslations(): void {
    applyWhisperStaticTranslations(this.pageRoot ?? document);
  }

  private async ensureHostedStyles(): Promise<void> {
    if (!isHostedInMainShell()) {
      return;
    }

    await ensureRuntimePageStyles("whisper");
  }

  private handleHostedStylesLoadFailure(error: unknown): void {
    const resolvedError = error instanceof Error ? error : new Error(String(error));
    Logger.error(
      LogCategory.WHISPER,
      `Whisper page styles failed to load: ${resolvedError.message}`,
      {
        source: "runtime-page-styles",
        styleKey: "whisper",
        error: {
          name: resolvedError.name,
          message: resolvedError.message,
          stack: resolvedError.stack,
        },
      }
    );
  }
}
