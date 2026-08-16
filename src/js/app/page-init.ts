import type { WebviewTag } from "electron";
import { SlotController } from "../modules/slot-controller.js";
import { ConversationListManager } from "../modules/conversation-list-manager.js";

import { EntranceHallController } from "../pages/entrance.js";
import { AnalyzeController } from "../pages/analyze.js";
import { ServerController } from "../pages/server.js";
import { RoomsController } from "../pages/rooms.js";
import { AssistantController } from "../pages/assistant/assistant.js";
import { SettingsPageController } from "../pages/settings/controller.js";
import { setupSettingsPanels } from "../pages/settings/panels/init.js";
import { ArchivesPageController } from "../pages/archives/controller.js";
import { WhisperPageController } from "../pages/whisper/page-controller.js";

import entranceTemplate from "../../pages/entrance.html?raw";
import analyzeTemplate from "../../pages/analyze.html?raw";
import serverTemplate from "../../pages/server.html?raw";
import roomsTemplate from "../../pages/rooms.html?raw";
import assistantTemplate from "../../pages/assistant.html?raw";
import settingsDocumentTemplate from "../../pages/settings.html?raw";
import archivesDocumentTemplate from "../../pages/archives.html?raw";
import whisperDocumentTemplate from "../../pages/whisper.html?raw";
import { mountSceneWindowControls } from "../scene/window-controls.js";
import { hydrateStaticSideNavIcons } from "./side-nav-icons.js";

import type { PageController } from "./types.js";
import { SLOTS, ASSISTANT_SLOT } from "@slots";
import { syncInstalledRoomChrome } from "./room-ui.js";

function extractPageTemplate(documentTemplate: string, pageId: string): string {
  const parsed = new DOMParser().parseFromString(documentTemplate, "text/html");
  const page = parsed.getElementById(pageId);
  return page?.outerHTML ?? "";
}

function hideInjectedPages(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".page").forEach((page) => {
    page.classList.add("is-hidden");
  });
}

export function injectPageTemplates(): void {
  const container = document.getElementById("pages-container");
  if (container) {
    container.innerHTML = `${entranceTemplate}${analyzeTemplate}${serverTemplate}${roomsTemplate}${assistantTemplate}${extractPageTemplate(
      settingsDocumentTemplate,
      "page-settings"
    )}${extractPageTemplate(archivesDocumentTemplate, "page-archives")}${extractPageTemplate(
      whisperDocumentTemplate,
      "page-whisper"
    )}`;
    hydrateStaticSideNavIcons();
    syncInstalledRoomChrome();
    hideInjectedPages(container);
    mountSceneWindowControls();
  }
}

export function setupUILogListener(): void {
  if (!window.electronAPI?.ipcRenderer) {
    return;
  }

  window.electronAPI.ipcRenderer.on("log:ui-notify-batch", () => {});
}

export async function initControllers(controllers: Record<string, PageController>): Promise<void> {
  controllers["entrance"] = new EntranceHallController();
  controllers["analyze"] = new AnalyzeController();
  controllers["server"] = new ServerController();
  controllers["rooms"] = new RoomsController();
  controllers["assistant"] = new AssistantController();
  setupSettingsPanels();
  controllers["settings"] = new SettingsPageController();
  controllers["archives"] = new ArchivesPageController();
  controllers["whisper"] = new WhisperPageController();
  syncInstalledRoomChrome(controllers);
  await controllers["entrance"].init?.();
  await controllers["analyze"].init?.();
  await controllers["server"].init?.();
  await controllers["rooms"].init?.();
  await controllers["assistant"].init?.();
  await controllers["settings"].init?.();
  await controllers["archives"].init?.();
  await controllers["whisper"].init?.();
  const roomPageNames = Object.keys(controllers).filter((pageName) => pageName.startsWith("room-"));
  await roomPageNames.reduce<Promise<void>>(async (previous, pageName) => {
    await previous;
    await controllers[pageName]?.init?.();
  }, Promise.resolve());
  await ConversationListManager.init();
}

export function registerWebviews(): void {
  const ai0Webview = document.getElementById("ai0-webview") as WebviewTag | null;
  const ai1Webview = document.getElementById("ai1-webview") as WebviewTag | null;
  const ai2Webview = document.getElementById("ai2-webview") as WebviewTag | null;
  if (ai0Webview) {
    SlotController.registerWebview(ASSISTANT_SLOT, ai0Webview);
  }
  if (ai1Webview) {
    SlotController.registerWebview(SLOTS.AI1, ai1Webview);
  }
  if (ai2Webview) {
    SlotController.registerWebview(SLOTS.AI2, ai2Webview);
  }
}
