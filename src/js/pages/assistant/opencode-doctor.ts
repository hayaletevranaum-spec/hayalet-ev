import { LogCategory } from "@shared/logging-core";
import type { TranslationParams } from "@shared/i18n.js";
import type { AppSettings } from "@shared/settings.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";

import { AppI18n } from "../../modules/i18n/index.js";
import { Logger } from "../../modules/logger/index.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import { resolveIpcErrorMessage } from "../../modules/ipc-errors.js";
import { openSharedAssistantToolModal } from "../../ui/overlay-presets.js";
import { Toast } from "../../ui/toast-manager.js";
import { getOpencodePreferences, normalizeOpencodePort } from "./opencode-preferences.js";

interface OpencodeIndicatorElements {
  indicator: HTMLElement | null;
  indicatorDot: HTMLElement | null;
  indicatorText: HTMLElement | null;
  actionButton?: HTMLButtonElement | null;
}

function assistantT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`shell.assistant.${key}`, params);
}

function setOpencodeIndicatorState(
  elements: OpencodeIndicatorElements,
  state: "checking" | "ready" | "missing" | "error",
  text: string,
  title = ""
): void {
  if (elements.indicatorText != null) {
    elements.indicatorText.textContent = text;
  }
  if (elements.indicator != null) {
    elements.indicator.title = title;
  }

  const indicator = elements.indicator;
  const dot = elements.indicatorDot;
  if (indicator == null || dot == null) return;

  indicator.classList.remove("is-success", "is-warning", "is-error");
  dot.classList.remove("is-success", "is-warning", "is-error", "is-loading");

  if (state === "ready") {
    indicator.classList.add("is-success");
    dot.classList.add("is-success");
    return;
  }

  if (state === "missing") {
    indicator.classList.add("is-warning");
    dot.classList.add("is-warning");
    return;
  }

  if (state === "error") {
    indicator.classList.add("is-error");
    dot.classList.add("is-error");
    return;
  }

  dot.classList.add("is-loading");
}

function setOpencodeActionButtonState(
  button: HTMLButtonElement | null | undefined,
  options: {
    icon: string;
    ariaLabel: string;
    title: string;
    disabled?: boolean;
    busy?: boolean;
  }
): void {
  if (button == null) return;
  button.textContent = options.icon;
  button.setAttribute("aria-label", options.ariaLabel);
  button.title = options.title;
  button.disabled = options.disabled === true;
  button.classList.toggle("is-busy", options.busy === true);
}

function getDetectedOpencodeVersion(): string | null {
  const settings = SettingsManager.getSnapshot() as AppSettings | null;
  const version = settings?.assistants?.opencode?.version;
  if (typeof version !== "string" || version.trim() === "") {
    return null;
  }
  return version.trim();
}

export function refreshOpencodeDoctorStatus(elements: OpencodeIndicatorElements): void {
  const settings = SettingsManager.getSnapshot() as AppSettings | null;
  const opencode = settings?.assistants?.opencode;
  const defaultPort = normalizeOpencodePort(opencode?.defaultPort);
  const version =
    typeof opencode?.version === "string" && opencode.version.trim() !== ""
      ? opencode.version.trim()
      : null;

  const titleLines = [assistantT("opencodeDoctor.defaultPortTitle", { port: defaultPort })];

  if (version !== null) {
    setOpencodeIndicatorState(
      elements,
      "ready",
      assistantT("opencodeDoctor.indicatorReady", { version }),
      titleLines.join("\n")
    );
    setOpencodeActionButtonState(elements.actionButton, {
      icon: "↻",
      ariaLabel: assistantT("opencodeDoctor.checkUpdatesAriaLabel"),
      title: assistantT("opencodeDoctor.checkUpdatesTitle", { version }),
    });
    return;
  }

  setOpencodeIndicatorState(
    elements,
    "missing",
    assistantT("opencodeDoctor.indicatorMissing"),
    titleLines.join("\n")
  );
  setOpencodeActionButtonState(elements.actionButton, {
    icon: "⬇",
    ariaLabel: assistantT("opencodeDoctor.installAriaLabel"),
    title: assistantT("opencodeDoctor.installTitle"),
  });
}

async function launchOpencodeInstallFlow(): Promise<void> {
  const electronApi = window.electronAPI;
  if (electronApi === undefined || typeof electronApi.opencodeLaunchInstall !== "function") {
    throw new Error(assistantT("opencodeDoctor.errors.installIpcMissing"));
  }

  const result = await electronApi.opencodeLaunchInstall();
  if (result.success !== true) {
    throw new Error(
      formatErrorWithDetail(
        assistantT("opencodeDoctor.errors.installFlowFailed"),
        resolveIpcErrorMessage(result) ?? result.error
      )
    );
  }

  if (result.fallbackToBrowser === true) {
    Toast.success(
      assistantT("opencodeDoctor.toasts.installPageOpenedTitle"),
      assistantT("opencodeDoctor.toasts.installPageOpenedMessage")
    );
    return;
  }

  Toast.success(
    assistantT("opencodeDoctor.toasts.installTerminalOpenedTitle"),
    assistantT("opencodeDoctor.toasts.installTerminalOpenedMessage")
  );
}

export async function handleOpencodeActionButtonClick(
  elements: OpencodeIndicatorElements
): Promise<void> {
  const electronApi = window.electronAPI;
  const actionButton = elements.actionButton ?? null;
  const loadingMessage =
    getDetectedOpencodeVersion() !== null
      ? assistantT("opencodeDoctor.loading.checkingUpdates")
      : assistantT("opencodeDoctor.loading.preparingInstall");
  const loadingToastId = Toast.loading(
    assistantT("opencodeDoctor.toasts.loadingTitle"),
    loadingMessage
  );

  setOpencodeActionButtonState(actionButton, {
    icon: "…",
    ariaLabel: assistantT("opencodeDoctor.actionInProgress"),
    title: assistantT("opencodeDoctor.actionInProgress"),
    disabled: true,
    busy: true,
  });

  try {
    if (electronApi === undefined || typeof electronApi.opencodeServeDoctor !== "function") {
      throw new Error(assistantT("opencodeDoctor.errors.doctorIpcMissing"));
    }

    const doctorResult = await electronApi.opencodeServeDoctor();
    const detectedVersion =
      doctorResult.success === true &&
      doctorResult.available === true &&
      typeof doctorResult.version === "string" &&
      doctorResult.version.trim() !== ""
        ? doctorResult.version.trim()
        : null;

    if (detectedVersion === null) {
      Toast.update(loadingToastId, {
        type: "info",
        title: assistantT("opencodeDoctor.toasts.installFlowStartingTitle"),
        message: assistantT("opencodeDoctor.toasts.installFlowStartingMessage"),
        closable: true,
      });
      await launchOpencodeInstallFlow();
      return;
    }

    if (typeof electronApi.opencodeCheckUpdates !== "function") {
      throw new Error(assistantT("opencodeDoctor.errors.updateIpcMissing"));
    }

    const result = await electronApi.opencodeCheckUpdates(detectedVersion);
    if (result.success !== true) {
      throw new Error(
        formatErrorWithDetail(
          assistantT("opencodeDoctor.errors.updateCheckFailed"),
          resolveIpcErrorMessage(result) ?? result.error
        )
      );
    }

    const latestVersion =
      typeof result.latestVersion === "string" && result.latestVersion.trim() !== ""
        ? result.latestVersion.trim()
        : null;

    if (result.updateAvailable === true && latestVersion !== null) {
      Toast.update(loadingToastId, {
        type: "warning",
        title: assistantT("opencodeDoctor.toasts.updateAvailableTitle", {
          version: latestVersion,
        }),
        message: assistantT("opencodeDoctor.toasts.installedVersionMessage", {
          version: result.installedVersion,
        }),
        closable: true,
        action: {
          label: assistantT("opencodeDoctor.toasts.updateActionLabel"),
          onClick: () => {
            void launchOpencodeInstallFlow();
          },
        },
      });
      return;
    }

    Toast.update(loadingToastId, {
      type: "success",
      title: assistantT("opencodeDoctor.toasts.upToDateTitle"),
      message:
        latestVersion !== null
          ? assistantT("opencodeDoctor.toasts.upToDateWithLatestMessage", {
              installedVersion: result.installedVersion,
              latestVersion,
            })
          : assistantT("opencodeDoctor.toasts.upToDateMessage", {
              installedVersion: result.installedVersion,
            }),
      closable: true,
    });
  } catch (error) {
    Toast.update(loadingToastId, {
      type: "error",
      title: assistantT("opencodeDoctor.toasts.actionFailedTitle"),
      message: (error as Error).message,
      closable: true,
    });
    Logger.warnT(
      LogCategory.ASSISTANT_CORE,
      "shell.assistant.logs.opencodeActionButtonFailure",
      { message: (error as Error).message },
      {
        error: (error as Error).message,
      }
    );
  } finally {
    refreshOpencodeDoctorStatus(elements);
  }
}

export async function openOpencodeSettingsModal(
  options: { onSaved?: () => void } = {}
): Promise<void> {
  const prefs = getOpencodePreferences(SettingsManager.getSnapshot());
  const electronApi = window.electronAPI;

  const content = document.createElement("div");
  content.className = "opencode-settings-modal";
  content.innerHTML = `
    <div class="opencode-settings-actions">
      <button class="btn btn-ghost btn-sm" data-action="check" type="button">${assistantT("opencodeDoctor.settingsModal.checkButton")}</button>
    </div>
    <div class="opencode-settings-row">
      <label>${assistantT("opencodeDoctor.settingsModal.defaultPortLabel")}</label>
      <input
        class="input opencode-settings-input"
        type="number"
        min="1024"
        max="65535"
        step="1"
        data-role="default-port"
      />
    </div>
    <div class="opencode-settings-check" data-role="check-result"></div>
  `;

  const portInput = content.querySelector<HTMLInputElement>('[data-role="default-port"]');
  const checkResult = content.querySelector<HTMLElement>('[data-role="check-result"]');
  const checkBtn = content.querySelector<HTMLButtonElement>('[data-action="check"]');

  if (portInput != null) portInput.value = String(prefs.defaultPort);

  const setCheckResult = (
    message: string,
    tone: "normal" | "success" | "error" = "normal"
  ): void => {
    if (checkResult == null) return;

    checkResult.textContent = message;
    checkResult.classList.remove("text-success", "text-error");
    if (tone === "success") {
      checkResult.classList.add("text-success");
    } else if (tone === "error") {
      checkResult.classList.add("text-error");
    }
  };

  let lastValidation: { version: string | null } | null = null;

  const runDoctorCheck = async (): Promise<void> => {
    if (electronApi === undefined || typeof electronApi.opencodeServeDoctor !== "function") {
      setCheckResult(assistantT("opencodeDoctor.errors.doctorIpcMissing"), "error");
      return;
    }

    setCheckResult(assistantT("opencodeDoctor.settingsModal.checking"));

    try {
      const result = await electronApi.opencodeServeDoctor();
      if (result.success !== true || result.available !== true) {
        lastValidation = null;
        setCheckResult(
          assistantT("opencodeDoctor.settingsModal.checkFailed", {
            message: formatErrorWithDetail(
              assistantT("opencodeDoctor.settingsModal.unknownError"),
              resolveIpcErrorMessage(result) ?? result.error
            ),
          }),
          "error"
        );
        return;
      }

      const detectedVersion =
        typeof result.version === "string" && result.version.trim() !== ""
          ? result.version.trim()
          : null;

      lastValidation = {
        version: detectedVersion,
      };

      setCheckResult(
        assistantT("opencodeDoctor.settingsModal.detectedVersion", {
          version:
            detectedVersion !== null
              ? `v${detectedVersion}`
              : assistantT("opencodeDoctor.settingsModal.versionUnknown"),
        }),
        "success"
      );
    } catch (error) {
      lastValidation = null;
      setCheckResult(
        assistantT("opencodeDoctor.settingsModal.checkError", {
          message: (error as Error).message,
        }),
        "error"
      );
    }
  };

  checkBtn?.addEventListener("click", () => {
    void runDoctorCheck();
  });

  const modalHandle = await openSharedAssistantToolModal({
    title: assistantT("opencodeDoctor.settingsModal.title"),
    content,
    size: "medium",
    buttons: [
      { label: AppI18n.t("shell.common.cancel"), variant: "secondary" },
      {
        label: AppI18n.t("shell.common.save"),
        variant: "primary",
        closeOnClick: false,
        onClick: (): void => {
          void (async (): Promise<void> => {
            const normalizedPortText = portInput?.value.trim() ?? "";
            const parsedPort = Number.parseInt(normalizedPortText, 10);
            if (Number.isInteger(parsedPort) !== true || parsedPort < 1024 || parsedPort > 65535) {
              setCheckResult(
                assistantT("opencodeDoctor.settingsModal.defaultPortInvalid"),
                "error"
              );
              return;
            }

            await runDoctorCheck();
            if (lastValidation === null) {
              setCheckResult(
                assistantT("opencodeDoctor.settingsModal.validationRequired"),
                "error"
              );
              return;
            }

            await SettingsManager.set("assistants.opencode", {
              defaultPort: parsedPort,
              version: lastValidation.version,
            });

            setCheckResult(assistantT("opencodeDoctor.settingsModal.saved"), "success");
            Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.opencodeSettingsUpdated"), {
              defaultPort: parsedPort,
              version: lastValidation.version,
            });

            options.onSaved?.();
            modalHandle.close();
          })();
        },
      },
    ],
  });
}
