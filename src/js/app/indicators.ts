import { AppState } from "../modules/app-state.js";
import { getMimeTypeFromPath } from "../constants/index.js";
import { getErrorMessage } from "@shared/index.js";
import { Logger, LogCategory } from "../modules/logger/index.js";
import { dispatchInternalSlotBridge } from "../modules/commands/slot-bridge-runtime.js";
import { ConversationListManager } from "../modules/conversation-list-manager.js";
import { WebviewManager } from "../modules/webview-manager.js";
import { shellT } from "./shell-i18n.js";

export function updateIndicatorAvatars(): void {
  const getAvatar = (provider: string): string | undefined => AppState.getAvatar(provider);

  const ai0Assigned = AppState.isAssigned("ai0");
  const ai0Connected = AppState.isConnected("ai0");
  // NOTE: Keep AI0 identity visible while disconnected so the topbar mirrors other assigned slots.
  const ai0AvatarPath = ai0Assigned === true ? getAvatar("ai0") : undefined;

  const map: Array<{
    provider: "ai0" | "ai1" | "ai2" | "us1";
    el: HTMLElement | null;
    path: string | undefined;
    slotState: "empty" | "disconnected" | "connected";
    manageConversationSelect: boolean;
    fallbackText?: string;
  }> = [
    {
      provider: "ai0",
      el: document.getElementById("indicator-avatar-ai0"),
      path: ai0AvatarPath,
      slotState:
        ai0Assigned !== true ? "empty" : ai0Connected === true ? "connected" : "disconnected",
      manageConversationSelect: true,
    },
    {
      provider: "ai1",
      el: document.getElementById("indicator-avatar-ai1"),
      path: getAvatar("ai1"),
      slotState:
        AppState.getAccountForSlot("ai1") === null
          ? "empty"
          : AppState.isConnected("ai1") === true
            ? "connected"
            : "disconnected",
      manageConversationSelect: true,
    },
    {
      provider: "ai2",
      el: document.getElementById("indicator-avatar-ai2"),
      path: getAvatar("ai2"),
      slotState:
        AppState.getAccountForSlot("ai2") === null
          ? "empty"
          : AppState.isConnected("ai2") === true
            ? "connected"
            : "disconnected",
      manageConversationSelect: true,
    },
    {
      provider: "us1",
      el: document.getElementById("indicator-avatar-us1"),
      path: getAvatar("us1"),
      slotState:
        AppState.hasUs1Identity() === false
          ? "empty"
          : AppState.isUs1Connected() === true
            ? "connected"
            : "disconnected",
      manageConversationSelect: false,
      fallbackText: "US",
    },
  ];

  const buildDataUrl = async (filePath: string | undefined): Promise<string | null> => {
    if (filePath === undefined || filePath === "" || window.electronAPI?.readFile === undefined)
      return null;
    try {
      const data = await window.electronAPI.readFile(filePath);
      if (data === null || data === "") return null;
      const mime = getMimeTypeFromPath(filePath);
      return `data:${mime};base64,${data}`;
    } catch (err) {
      return null;
    }
  };

  const getFallbackPath = (
    provider: "ai0" | "ai1" | "ai2" | "us1",
    slotState: "empty" | "disconnected" | "connected"
  ): string => {
    if (slotState === "empty") return "";

    if (provider === "ai1" || provider === "ai2") {
      const providerId = AppState.getProviderIdForSlot(provider) ?? "";
      if (providerId !== "") return `src/assets/${providerId}.png`;
      return "src/assets/default.png";
    }

    if (provider === "us1") {
      return "src/assets/default.png";
    }

    return "";
  };

  const applyAvatar = (
    el: HTMLElement | null,
    src: string | null,
    slotState: "empty" | "disconnected" | "connected",
    fallbackText = ""
  ): void => {
    if (el === null) return;
    if (src !== null && src !== "") {
      const image = document.createElement("img");
      image.className = "img-cover";
      image.alt = "";
      image.src = src;
      image.style.borderRadius = "inherit";
      el.replaceChildren(image);
      el.style.removeProperty("--avatar-image");
      el.classList.remove("avatar-placeholder");
    } else {
      el.replaceChildren();
      el.style.removeProperty("--avatar-image");
      el.classList.add("avatar-placeholder");
      el.textContent = fallbackText;
    }

    const cluster = el.closest(".indicator-cluster");
    if (!(cluster instanceof HTMLElement)) return;

    cluster.classList.remove("is-empty", "is-disconnected", "is-connected");
    if (slotState === "empty") {
      cluster.classList.add("is-empty");
    } else if (slotState === "disconnected") {
      cluster.classList.add("is-disconnected");
    } else {
      cluster.classList.add("is-connected");
    }
  };

  map.forEach(({ provider, el, path, slotState, manageConversationSelect, fallbackText }) => {
    if (!el) return;
    const fallbackPath = getFallbackPath(provider, slotState);
    const fallbackLabel = slotState === "empty" ? "" : (fallbackText ?? "");
    const candidates = [path ?? "", fallbackPath].filter(
      (candidate, index, arr) => candidate !== "" && arr.indexOf(candidate) === index
    );

    applyAvatar(el, null, slotState, fallbackLabel);
    const tryLoad = (index: number): void => {
      const candidate = candidates[index];
      if (candidate === undefined) {
        return;
      }
      void buildDataUrl(candidate).then((uri) => {
        if (uri !== null && uri !== "") {
          applyAvatar(el, uri, slotState, fallbackLabel);
        } else {
          tryLoad(index + 1);
        }
      });
    };

    if (candidates.length > 0) {
      tryLoad(0);
    }

    if (!manageConversationSelect) return;

    try {
      const hasAccount =
        provider === "us1" ? AppState.hasUs1Identity() === true : AppState.isAssigned(provider);
      const conv = document.getElementById(`conversation-${provider}`) as HTMLSelectElement | null;
      if (conv) {
        conv.disabled = !hasAccount;
        try {
          const btn = document.getElementById(`conversation-refresh-${provider}`) as
            (HTMLButtonElement & { __convRefreshHandler?: EventListener }) | null;
          if (btn) {
            btn.disabled = !hasAccount;
            if (btn.__convRefreshHandler) {
              btn.removeEventListener("click", btn.__convRefreshHandler);
            }
            const handler: EventListener = (ev: Event) => {
              ev.preventDefault();
              void (async (): Promise<void> => {
                if (provider === "ai0") {
                  await ConversationListManager.refresh({
                    provider,
                    silent: true,
                    skipNotify: true,
                  });
                  return;
                }

                const connectResult = await dispatchInternalSlotBridge(
                  {
                    action: "connection.ensure",
                    toSlot: provider,
                  },
                  {
                    provider: "user",
                    source: "user",
                    fromSlot: "user",
                  }
                );
                if (connectResult.success !== true) {
                  throw new Error(
                    connectResult.message ??
                      connectResult.error ??
                      `${provider.toUpperCase()} could not connect`
                  );
                }

                const syncResult = await WebviewManager.syncProvider(provider, { from: "manual" });
                const syncState =
                  typeof syncResult === "object" && syncResult !== null
                    ? (syncResult as { success?: unknown; message?: unknown })
                    : null;
                if (syncState !== null && "success" in syncState && syncState.success === false) {
                  throw new Error(
                    typeof syncState.message === "string" && syncState.message.trim() !== ""
                      ? syncState.message
                      : `${provider.toUpperCase()} sync failed`
                  );
                }

                await ConversationListManager.refresh({
                  provider,
                  silent: true,
                  skipNotify: true,
                });
              })().catch((err) => {
                Logger.debug(
                  LogCategory.DATABASE,
                  shellT("logs.manualSyncFailed", { message: getErrorMessage(err) }),
                  {
                    error: err instanceof Error ? err : new Error(String(err)),
                  }
                );
              });
            };
            btn.__convRefreshHandler = handler;
            btn.addEventListener("click", handler);
          }
        } catch (e) {}
      }
    } catch (e) {
      Logger.debug(
        LogCategory.SYSTEM,
        shellT("logs.conversationRefreshSetupFailed", { message: getErrorMessage(e) }),
        {
          error: getErrorMessage(e),
        }
      );
    }
  });
}
