import { getErrorMessage } from "@shared/index.js";
import { Logger, LogCategory } from "../modules/logger/index.js";
import { WindowManager } from "../modules/window-manager.js";
import { Modal } from "../ui/modal-manager.js";
import { createGhostHandoffRuntimePatch } from "../pages/assistant/ghost-handoff.js";
import {
  generateWorkflowSessionId,
  updateAssistantRuntimeState,
} from "../pages/assistant/assistant-runtime.js";
import { isSceneDebugRoomId, setActiveSceneDebugRoomId } from "../scene-editor/index.js";
import {
  getUiModeLabelKey,
  getUiModeRestartOptions,
  getUiModeToggleState,
  isUiModeOptionState,
  renderUiModeDropdowns,
  syncUiModeDropdownOptions,
  UI_MODE_DROPDOWN_SELECTOR,
  UI_MODE_OPTION_SELECTOR,
  UI_MODE_TRIGGER_SELECTOR,
  type UiModeToggleState,
} from "./ui-mode/index.js";
import { closeWorkspaceToolPage, getActiveWorkspaceTool } from "../ui/workspace-tool-overlay.js";

import type { PageController } from "./types.js";
import { shellT } from "./shell-i18n.js";

const SPECIAL_PAGES = ["webview"];

function getUiModeLabel(state: UiModeToggleState): string {
  return shellT(getUiModeLabelKey(state));
}

async function triggerGhostAgentHandoff(): Promise<void> {
  await updateAssistantRuntimeState(createGhostHandoffRuntimePatch(generateWorkflowSessionId()));

  const electronApi = window.electronAPI;
  const windowClose = electronApi?.["windowClose"];
  if (typeof windowClose !== "function") {
    return;
  }

  windowClose();
}

function setUiModeDropdownExpanded(dropdown: HTMLElement, expanded: boolean): void {
  dropdown.classList.toggle("is-expanded", expanded);
  const trigger = dropdown.querySelector<HTMLButtonElement>(UI_MODE_TRIGGER_SELECTOR);
  if (trigger !== null) {
    trigger.setAttribute("aria-expanded", String(expanded));
  }
  syncTopBarUiModeLayer();
}

function syncTopBarUiModeLayer(): void {
  const topBar = document.querySelector<HTMLElement>(".top-bar");
  if (topBar === null) {
    return;
  }

  const hasExpandedDropdown =
    topBar.querySelector<HTMLElement>(".ui-mode-dropdown.is-expanded") !== null;
  topBar.classList.toggle("is-ui-mode-expanded", hasExpandedDropdown);
}

let currentPage: string | null = null;
let lastPrimaryPage = "entrance";
const specialPageReturnTargets: Record<string, string> = {};
let controllers: Record<string, PageController> = {};
let windowControlsBound = false;
let uiModeDropdownsBound = false;

function getUiModeDropdowns(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(UI_MODE_DROPDOWN_SELECTOR));
}

function closeAllUiModeDropdowns(except: HTMLElement | null = null): void {
  getUiModeDropdowns().forEach((dropdown) => {
    if (dropdown === except) {
      return;
    }
    setUiModeDropdownExpanded(dropdown, false);
  });
}

async function handleUiModeOptionSelection(option: HTMLButtonElement): Promise<void> {
  closeAllUiModeDropdowns();

  const optionState = option.dataset["uiModeOption"] ?? "";
  if (optionState === "ghost-agent") {
    await triggerGhostAgentHandoff();
    return;
  }

  if (!isUiModeOptionState(optionState) || optionState === "ghost-agent") {
    return;
  }

  if (optionState === getUiModeToggleState()) {
    return;
  }

  const confirmed = await Modal.confirm({
    title: shellT("uiMode.confirmTitle"),
    message: shellT("uiMode.confirmMessage", { mode: getUiModeLabel(optionState) }),
  });

  if (!confirmed) {
    return;
  }

  const electronApi = window.electronAPI;
  const appRestart = electronApi?.["appRestart"];
  if (typeof appRestart !== "function") {
    return;
  }

  const restartOptions = getUiModeRestartOptions(optionState);

  try {
    await appRestart({
      forceFullRestart: true,
      uiMode: restartOptions.uiMode,
      sceneEditor: restartOptions.sceneEditor,
      sceneDebug: restartOptions.sceneDebug,
    });
  } catch {
    void 0;
  }
}

function isSpecialPage(pageName: string): boolean {
  return SPECIAL_PAGES.includes(pageName);
}

function resolvePageDomNames(pageName: string): string[] {
  return [pageName];
}

function findPageElement(pageName: string): HTMLElement | null {
  for (const domPageName of resolvePageDomNames(pageName)) {
    const element = document.getElementById(`page-${domPageName}`);
    if (element instanceof HTMLElement) {
      return element;
    }
  }
  return null;
}

function matchesPageDataset(candidate: string | undefined, pageName: string): boolean {
  if (candidate === undefined || candidate === "") {
    return false;
  }
  return candidate === pageName;
}

function syncShellLayoutState(pageName: string): void {
  document.documentElement.setAttribute("data-active-page", pageName);
}

function syncActiveSceneDebugRoom(pageName: string): void {
  if (getUiModeToggleState() !== "scene-editor") {
    setActiveSceneDebugRoomId(null);
    return;
  }

  if (isSceneDebugRoomId(pageName)) {
    setActiveSceneDebugRoomId(pageName);
    return;
  }

  setActiveSceneDebugRoomId(null);
}

export function setControllers(c: Record<string, PageController>): void {
  controllers = c;
}

export function getCurrentPage(): string | null {
  return currentPage;
}

export function setupNavigation(): void {
  try {
    document.addEventListener("navigate-page", ((e: CustomEvent<{ page: string }>) => {
      const page = e.detail.page;
      if (page !== "") {
        showPage(page);
      }
    }) as EventListener);

    document.addEventListener("close-special-page", ((e: CustomEvent<{ page: string }>) => {
      const page = typeof e.detail.page === "string" ? e.detail.page.trim() : "";
      if (page !== "") {
        closeSpecialPage(page);
      }
    }) as EventListener);
  } catch (error) {
    Logger.debug(
      LogCategory.SYSTEM,
      shellT("logs.navigationSetupError", { message: getErrorMessage(error) }),
      {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }
}

export function showPage(pageName: string, rememberSpecialReturn = true): void {
  const normalizedPageName = pageName;
  const previousPage = currentPage;

  if (previousPage !== null && previousPage !== normalizedPageName) {
    const activeWorkspaceTool = getActiveWorkspaceTool();
    if (activeWorkspaceTool !== null) {
      closeWorkspaceToolPage(activeWorkspaceTool);
    }
  }

  if (
    rememberSpecialReturn &&
    isSpecialPage(normalizedPageName) &&
    previousPage !== null &&
    previousPage !== normalizedPageName
  ) {
    specialPageReturnTargets[normalizedPageName] = previousPage;
  }
  if (
    previousPage !== null &&
    previousPage !== normalizedPageName &&
    controllers[previousPage] !== undefined
  ) {
    const controller = controllers[previousPage];
    if (controller.onHide !== undefined) {
      controller.onHide();
    }
  }
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("is-hidden");
  });

  const pageElement = findPageElement(normalizedPageName);
  if (pageElement !== null) {
    pageElement.classList.remove("is-hidden");
    currentPage = normalizedPageName;
    if (!isSpecialPage(normalizedPageName)) {
      lastPrimaryPage = normalizedPageName;
    }
    syncShellLayoutState(normalizedPageName);
    syncActiveSceneDebugRoom(normalizedPageName);

    const controller = controllers[normalizedPageName];
    if (controller?.onShow !== undefined) {
      controller.onShow();
    }

    setActiveNavigation(normalizedPageName);
  }
}

export function setupWindowControls(): void {
  if (windowControlsBound) {
    return;
  }

  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>("[data-window-action]");
    const action = button?.dataset["windowAction"];
    if (action === undefined || action === "") {
      return;
    }

    if (action === "minimize-to-tray") {
      WindowManager.minimizeToTray();
      return;
    }

    if (action === "close") {
      WindowManager.closeApp();
      return;
    }

    WindowManager.apply(action);
  });

  windowControlsBound = true;
}

export function setupTopBarButtons(): void {
  try {
    renderUiModeDropdowns();
    getUiModeDropdowns().forEach((dropdown) => {
      syncUiModeDropdownOptions(dropdown);
    });

    if (!uiModeDropdownsBound) {
      document.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        const option = target?.closest<HTMLButtonElement>(UI_MODE_OPTION_SELECTOR);
        if (option !== null && option !== undefined) {
          event.stopPropagation();
          void handleUiModeOptionSelection(option);
          return;
        }

        const trigger = target?.closest<HTMLButtonElement>(UI_MODE_TRIGGER_SELECTOR);
        if (trigger !== null && trigger !== undefined) {
          event.stopPropagation();
          const dropdown = trigger.closest<HTMLElement>(UI_MODE_DROPDOWN_SELECTOR);
          if (dropdown === null) {
            return;
          }

          syncUiModeDropdownOptions(dropdown);
          const isExpanded = dropdown.classList.contains("is-expanded");
          closeAllUiModeDropdowns(dropdown);
          setUiModeDropdownExpanded(dropdown, !isExpanded);
          return;
        }

        if (target?.closest(UI_MODE_DROPDOWN_SELECTOR) === null) {
          closeAllUiModeDropdowns();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAllUiModeDropdowns();
        }
      });

      uiModeDropdownsBound = true;
    }

    const sideNavOverlay = document.getElementById("side-nav-overlay");
    const sideNavTrigger = document.querySelector(".side-nav-trigger");
    const sideNavMenu = document.querySelector(".side-nav-menu");

    if (sideNavOverlay !== null && sideNavTrigger !== null && sideNavMenu !== null) {
      sideNavTrigger.addEventListener("mouseenter", () => {
        sideNavOverlay.classList.add("is-expanded");
      });

      sideNavMenu.addEventListener("mouseleave", () => {
        sideNavOverlay.classList.remove("is-expanded");
      });

      sideNavTrigger.addEventListener("mouseleave", (e) => {
        const relatedTarget = (e as MouseEvent).relatedTarget as Element | null;
        if (relatedTarget === null || sideNavMenu.contains(relatedTarget) === false) {
          setTimeout(() => {
            if (sideNavOverlay.matches(":hover") === false) {
              sideNavOverlay.classList.remove("is-expanded");
            }
          }, 100);
        }
      });
    }

    if (sideNavMenu !== null) {
      sideNavMenu.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest(".side-nav-btn");
        if (!(button instanceof HTMLElement)) {
          return;
        }
        const page = button.dataset["page"];
        if (page !== undefined && page !== "") {
          showPage(page);
        }
      });
    }
  } catch (error) {
    Logger.debug(
      LogCategory.SYSTEM,
      shellT("logs.topBarSetupError", { message: getErrorMessage(error) }),
      {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }
}

export function setActiveNavigation(pageName: string): void {
  const normalizedPageName = pageName;
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach((mi) => {
    mi.classList.remove("is-active");
  });
  if (!isSpecialPage(normalizedPageName)) {
    menuItems.forEach((mi) => {
      if (matchesPageDataset((mi as HTMLElement).dataset["page"], normalizedPageName)) {
        mi.classList.add("is-active");
      }
    });
  }

  const sideNavBtns = document.querySelectorAll(".side-nav-btn");
  sideNavBtns.forEach((btn) => {
    btn.classList.remove("is-active");
  });
  if (!isSpecialPage(normalizedPageName)) {
    sideNavBtns.forEach((btn) => {
      if (matchesPageDataset((btn as HTMLElement).dataset["page"], normalizedPageName)) {
        btn.classList.add("is-active");
      }
    });
  }
}

export function setupReportPanel(): void {
  // NOTE: Kept for backward compatibility.
}

export function closeSpecialPage(pageName: string): void {
  const fallbackPage = specialPageReturnTargets[pageName] ?? lastPrimaryPage;
  showPage(fallbackPage === pageName ? lastPrimaryPage : fallbackPage, false);
}
