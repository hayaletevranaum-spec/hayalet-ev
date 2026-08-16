import { Logger } from "../logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { TrafficManager } from "../traffic-manager.js";
import { FileManager } from "../file-manager.js";
import { AppState } from "../app-state.js";
import { AppI18n } from "../i18n/index.js";
import { ProviderRegistry } from "./provider-registry.js";
import { getProvider } from "./provider-factory.js";
import type { ProviderModule } from "./provider-factory.js";
import { waitForDomReady } from "./methods/shared/file-utils.js";
import { isSlotUrlExcluded, isDefaultPage } from "./methods/shared/url-utils.js";
import { resolveSelectorLanguage } from "../../../../shared/i18n/locale.js";
import { resolveSelectorCandidates } from "../../../../shared/provider-selector-resolution";
import type { AppSettings } from "@shared/settings.js";
import type { SelectorLanguage } from "@shared/i18n.js";

export interface MessageSenderWebview {
  getURL?: () => string;
  executeJavaScript: (script: string) => Promise<unknown>;
  focus?: () => void;
  isLoading?: () => boolean;
  addEventListener?: (
    event: string,
    cb: (...args: unknown[]) => void,
    options?: { once?: boolean }
  ) => void;
}

interface FileEntry {
  name?: string;
  path?: string;
}

interface UploadedLink {
  name: string;
  url: string;
}

interface FileResult {
  success: boolean;
  message?: string;
  uploadedLinks?: UploadedLink[];
}

interface SendOptions {
  provider: string;
  text?: string;
  attachments?: FileEntry[];
  webview: MessageSenderWebview;
}

interface SendResult {
  success: boolean;
  message: string;
  files: FileResult | null;
}

interface SendAckState {
  loading: string;
  send: string;
  thinking: string;
}

interface SendButtonState {
  found: boolean;
  disabled: boolean;
}

type FileFn = (
  webview: MessageSenderWebview,
  opts: { files: unknown[]; provider: string }
) => Promise<FileResult>;

function messageSenderT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.messageSender.${key}`, params);
}

function messageSenderLogKey(key: string): string {
  return `app.messageSender.logs.${key}`;
}

class MessageSenderClass {
  _settings: AppSettings | null;

  constructor() {
    this._settings = null;
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private _getSelectorLanguage(): SelectorLanguage {
    return resolveSelectorLanguage(this._settings?.general?.language);
  }

  private _getSendButtonSelector(config: unknown): string[] {
    if (!this._isRecord(config)) return [];
    const selectors = config["selectors"];
    const selectorMatrix = config["selectorMatrix"];
    if (!this._isRecord(selectors)) return [];
    const matrixSelectors = this._isRecord(selectorMatrix)
      ? (selectorMatrix["selectors"] as Record<string, unknown> | undefined)
      : undefined;

    return resolveSelectorCandidates(
      (matrixSelectors?.["sendButton"] ?? selectors["sendButton"]) as
        string | string[] | Record<string, unknown>,
      this._getSelectorLanguage()
    );
  }

  setSettings(settings: AppSettings | null): void {
    this._settings = settings;
  }

  getProviderModule(providerSlot: string): ProviderModule | null {
    const providerId = AppState.getProviderIdForSlot(providerSlot);
    if (providerId === null || providerId === "") {
      return null;
    }
    return getProvider(providerId) ?? null;
  }

  isUrlExcluded(providerSlot: string, url: string): boolean {
    return isSlotUrlExcluded(providerSlot, url);
  }

  async send({ provider, text, attachments = [], webview }: SendOptions): Promise<SendResult> {
    const currentUrl = webview.getURL?.() ?? "";
    if (this.isUrlExcluded(provider, currentUrl)) {
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("urlExcluded"),
        { provider, currentUrl },
        {
          provider,
          currentUrl,
        }
      );
      throw new Error(messageSenderT("urlExcluded", { currentUrl }));
    }

    const providerId = AppState.getProviderIdForSlot(provider);
    if (providerId === null || providerId === "") {
      throw new Error(messageSenderT("providerNotConfigured", { provider }));
    }

    const providerModule = this.getProviderModule(provider);
    if (providerModule === null) {
      throw new Error(messageSenderT("providerModuleMissing", { provider, providerId }));
    }

    await waitForDomReady(webview);

    // NOTE: Inject provider config only when missing.
    const providerConfig = ProviderRegistry.get(providerId);
    try {
      const checkScript = `(function() { return !!window.__app_provider_config; })();`;
      const hasConfig = await webview.executeJavaScript(checkScript);

      if (hasConfig !== true) {
        const configScript = `
          (function() {
            window.__app_slot = ${JSON.stringify(provider)};
            window.__app_provider_config = ${JSON.stringify(providerConfig)};
            return true;
          })();
        `;
        await webview.executeJavaScript(configScript);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("providerConfigInjectionSkipped"),
        { provider, providerId, message: errorMessage },
        {
          provider,
          providerId,
          error: errorMessage,
        }
      );
    }

    const slots = this._settings?.slots as
      Record<string, { messageMethod?: string; fileMethod?: string }> | undefined;
    const assistantSlot = this._settings?.assistantSlot as
      { messageMethod?: string; fileMethod?: string } | undefined;
    const slotConfig = provider === "ai0" ? assistantSlot : slots?.[provider];

    const messageMethodName = slotConfig?.messageMethod;
    if (messageMethodName === undefined || messageMethodName === "") {
      throw new Error(messageSenderT("messageMethodMissing", { provider }));
    }

    const fileMethodName = slotConfig?.fileMethod;
    if (fileMethodName === undefined || fileMethodName === "") {
      throw new Error(messageSenderT("fileMethodMissing", { provider }));
    }

    const messageFn =
      messageMethodName === "xdotools"
        ? providerModule["sendMessage_xdotools"]
        : providerModule["sendMessage"];

    const fileFn = attachments.length > 0 ? providerModule[`attachFiles_${fileMethodName}`] : null;

    if (typeof messageFn !== "function") {
      throw new Error(
        messageSenderT("messageFunctionMissing", {
          messageMethod: messageMethodName,
          provider,
        })
      );
    }

    if (attachments.length > 0 && typeof fileFn !== "function") {
      throw new Error(
        messageSenderT("fileFunctionMissing", {
          fileMethod: fileMethodName,
          provider,
        })
      );
    }

    try {
      webview.focus?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("webviewFocusFailed"),
        { provider, message: errorMessage },
        {
          provider,
          error: errorMessage,
        }
      );
    }

    const isLinkBased = ["tmpfile", "catbox", "uguu", "googledrive"].includes(fileMethodName);

    let finalMessage = text ?? "";
    let fileResult = null;

    if (attachments.length > 0 && isLinkBased) {
      fileResult = await this._handleLinkBasedUpload(
        webview,
        provider,
        attachments,
        fileFn as FileFn,
        fileMethodName
      );

      const uploadedLinks = fileResult?.uploadedLinks ?? [];
      if (uploadedLinks.length > 0) {
        const linkText = uploadedLinks.map((l) => `[${l.name}](${l.url})`).join("\n");
        finalMessage = finalMessage.trim() !== "" ? `${finalMessage}\n${linkText}` : linkText;
      }
    }

    if (attachments.length > 0 && !isLinkBased) {
      fileResult = await this._handleDirectUpload(
        webview,
        provider,
        attachments,
        fileFn as FileFn,
        fileMethodName
      );
    }

    if (finalMessage.trim().length > 0) {
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("addingMessage"),
        { provider, messageMethod: messageMethodName },
        {
          provider,
          messageMethod: messageMethodName,
        }
      );
      const sendResult = await (
        messageFn as (
          wv: MessageSenderWebview,
          opts: { message: string }
        ) => Promise<{ success?: boolean; message?: string }>
      )(webview, { message: finalMessage });
      if (sendResult.success !== true) {
        throw new Error(sendResult.message ?? messageSenderT("inputWriteFailed"));
      }
    }

    Logger.infoT(
      LogCategory.WEBVIEW,
      messageSenderLogKey("waitingSendEnabled"),
      { provider },
      { provider }
    );
    await TrafficManager.waitForSendEnabled(provider, 20000);

    Logger.infoT(
      LogCategory.WEBVIEW,
      messageSenderLogKey("triggeringSend"),
      { provider },
      { provider }
    );

    const urlBeforeSend = webview.getURL?.() ?? "";
    if (isDefaultPage(urlBeforeSend, providerId)) {
      TrafficManager.skipNextLoadingFor(provider);
    }

    await this._triggerSendWithAck(webview, provider, providerId);

    return {
      success: true,
      message: messageSenderT("sendSuccess"),
      files: fileResult,
    };
  }

  async _handleLinkBasedUpload(
    webview: MessageSenderWebview,
    provider: string,
    attachments: FileEntry[],
    fileFn: FileFn,
    fileMethodName: string
  ): Promise<FileResult | null> {
    const files = await FileManager.readUploadFiles(attachments);
    if (files.length === 0) return null;

    Logger.debugT(
      LogCategory.WEBVIEW,
      messageSenderLogKey("uploadingFiles"),
      {
        provider,
        fileCount: files.length,
        fileMethod: fileMethodName,
      },
      {
        provider,
        fileCount: files.length,
        fileMethod: fileMethodName,
      }
    );

    const fileResult = await fileFn(webview, { files, provider });

    if (fileResult.success !== true) {
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("fileUploadFailed"),
        {
          provider,
          fileMethod: fileMethodName,
          message: fileResult.message ?? messageSenderT("unknownUploadError"),
        },
        {
          provider,
          fileMethod: fileMethodName,
          error: fileResult.message ?? messageSenderT("unknownUploadError"),
        }
      );
      throw new Error(
        fileResult.message ?? messageSenderT("uploadFailed", { fileMethod: fileMethodName })
      );
    }

    if ((fileResult.uploadedLinks?.length ?? 0) === 0) {
      Logger.debugT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("fileUploadNoLinks"),
        { provider, fileMethod: fileMethodName },
        {
          provider,
          fileMethod: fileMethodName,
          rawResult: fileResult,
        }
      );
      throw new Error(messageSenderT("uploadReturnedNoLinks", { fileMethod: fileMethodName }));
    }

    return fileResult;
  }

  async _handleDirectUpload(
    webview: MessageSenderWebview,
    provider: string,
    attachments: FileEntry[],
    fileFn: FileFn,
    fileMethodName: string
  ): Promise<FileResult | null> {
    const files = await FileManager.readUploadFiles(attachments);
    if (files.length === 0) return null;

    Logger.infoT(
      LogCategory.WEBVIEW,
      messageSenderLogKey("attachingFiles"),
      {
        provider,
        fileCount: files.length,
        fileMethod: fileMethodName,
      },
      {
        provider,
        fileCount: files.length,
        fileMethod: fileMethodName,
      }
    );

    const fileResult = await fileFn(webview, { files, provider });

    if (fileResult.success !== true) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        messageSenderLogKey("fileAttachmentFailed"),
        {
          provider,
          message: fileResult.message ?? messageSenderT("unknownUploadError"),
        },
        {
          provider,
          error: fileResult.message ?? messageSenderT("unknownUploadError"),
        }
      );
    }

    return fileResult;
  }

  private _readSendAckState(provider: string): SendAckState {
    const state = TrafficManager.getState(provider);
    return {
      loading: state?.status.loading ?? "idle",
      send: state?.status.send ?? "busy",
      thinking: state?.status.thinking ?? "idle",
    };
  }

  private async _readSendButtonState(
    webview: MessageSenderWebview,
    providerId: string
  ): Promise<SendButtonState> {
    const providerConfig = ProviderRegistry.get(providerId);
    const sendButtonSelector = this._getSendButtonSelector(providerConfig);

    if (sendButtonSelector.length === 0) {
      return { found: false, disabled: true };
    }

    const selectorCandidates = JSON.stringify(sendButtonSelector);
    const script = `(function() {
      const selectorCandidates = ${selectorCandidates};
      const isVisible = (element) => {
        if (!element || typeof getComputedStyle !== 'function') return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = element.getBoundingClientRect?.();
        return !rect || rect.width > 0 || rect.height > 0;
      };
      let sendButton = null;
      for (const selector of selectorCandidates) {
        try {
          const candidate = document.querySelector(selector);
          if (candidate && isVisible(candidate)) {
            sendButton = candidate;
            break;
          }
        } catch (_) {
          void 0;
        }
      }

      if (!sendButton) {
        return { found: false, disabled: true };
      }

      const disabledAttr = sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true';
      const disabledStyle = getComputedStyle(sendButton).pointerEvents === 'none';
      const disabledClass = /disabled|opacity-4|opacity-5|cursor-not-allowed/i.test(sendButton.className || '');
      return {
        found: true,
        disabled: disabledAttr || disabledStyle || disabledClass
      };
    })();`;

    try {
      const result = (await webview.executeJavaScript(script)) as SendButtonState | null;
      return {
        found: result?.found === true,
        disabled: result?.disabled !== false,
      };
    } catch {
      return { found: false, disabled: true };
    }
  }

  private _didButtonDisableAfterSend(baseline: SendButtonState, current: SendButtonState): boolean {
    return (
      baseline.found === true &&
      baseline.disabled === false &&
      ((current.found === true && current.disabled === true) || current.found === false)
    );
  }

  private _hasSendAck(provider: string, baseline: SendAckState): boolean {
    const current = this._readSendAckState(provider);
    return (
      (current.thinking === "busy" && baseline.thinking !== "busy") ||
      (current.send === "busy" && baseline.send !== "busy")
    );
  }

  private async _sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async _pollSendAck(
    webview: MessageSenderWebview,
    provider: string,
    providerId: string,
    baseline: SendAckState,
    baselineButton: SendButtonState,
    deadline: number,
    intervalMs: number
  ): Promise<boolean> {
    if (Date.now() > deadline) {
      const finalButtonState = await this._readSendButtonState(webview, providerId);
      return (
        this._hasSendAck(provider, baseline) ||
        this._didButtonDisableAfterSend(baselineButton, finalButtonState)
      );
    }

    if (this._hasSendAck(provider, baseline)) {
      return true;
    }

    const currentButton = await this._readSendButtonState(webview, providerId);
    if (this._didButtonDisableAfterSend(baselineButton, currentButton)) {
      return true;
    }

    await this._sleep(intervalMs);
    return await this._pollSendAck(
      webview,
      provider,
      providerId,
      baseline,
      baselineButton,
      deadline,
      intervalMs
    );
  }

  private async _waitForSendAck(
    webview: MessageSenderWebview,
    provider: string,
    providerId: string,
    baseline: SendAckState,
    baselineButton: SendButtonState,
    timeoutMs = 4500,
    intervalMs = 150
  ): Promise<boolean> {
    return await this._pollSendAck(
      webview,
      provider,
      providerId,
      baseline,
      baselineButton,
      Date.now() + timeoutMs,
      intervalMs
    );
  }

  private async _triggerSendWithAckAttempt(
    webview: MessageSenderWebview,
    provider: string,
    providerId: string,
    attempt: number,
    maxAttempts: number
  ): Promise<void> {
    const baseline = this._readSendAckState(provider);
    const baselineButton = await this._readSendButtonState(webview, providerId);
    await this._triggerSendButton(webview, provider, providerId);
    if (await this._waitForSendAck(webview, provider, providerId, baseline, baselineButton)) {
      return;
    }

    if (attempt >= maxAttempts - 1) {
      throw new Error(messageSenderT("sendTriggerFailed"));
    }

    const sendReady = await TrafficManager.waitForSendEnabled(provider, 4000);
    if (sendReady !== true) {
      const currentButton = await this._readSendButtonState(webview, providerId);
      if (
        this._hasSendAck(provider, baseline) ||
        this._didButtonDisableAfterSend(baselineButton, currentButton)
      ) {
        return;
      }
      throw new Error(messageSenderT("sendTriggerFailed"));
    }

    await this._triggerSendWithAckAttempt(webview, provider, providerId, attempt + 1, maxAttempts);
    return;
  }

  private async _triggerSendWithAck(
    webview: MessageSenderWebview,
    provider: string,
    providerId: string
  ): Promise<void> {
    const maxAttempts = 4;
    await this._triggerSendWithAckAttempt(webview, provider, providerId, 0, maxAttempts);
  }

  async _triggerSendButton(
    webview: MessageSenderWebview,
    provider: string,
    providerId: string
  ): Promise<void> {
    const providerConfig = ProviderRegistry.get(providerId);
    const sendButtonSelector = this._getSendButtonSelector(providerConfig);

    if (sendButtonSelector.length === 0) {
      const hasConfig = providerConfig !== null;
      const hasSelectors =
        this._isRecord(providerConfig) && this._isRecord(providerConfig["selectors"]);
      throw new Error(
        messageSenderT("providerConfigMissing", {
          providerId,
          provider,
          hasConfig: String(hasConfig),
          hasSelectors: String(hasSelectors),
        })
      );
    }

    const sendSel = JSON.stringify(sendButtonSelector);

    const maxRetries = 10;
    const retryInterval = 500;

    const trySend = async (attempt: number): Promise<void> => {
      const script = `(function() {
        const selectorCandidates = ${sendSel};
        const isVisible = (element) => {
          if (!element || typeof getComputedStyle !== 'function') return false;
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          const rect = element.getBoundingClientRect?.();
          return !rect || rect.width > 0 || rect.height > 0;
        };
        let sendButton = null;
        let matchedSelector = null;
        for (const selector of selectorCandidates) {
          try {
            const candidate = document.querySelector(selector);
            if (candidate && isVisible(candidate)) {
              sendButton = candidate;
              matchedSelector = selector;
              break;
            }
          } catch (_) {
            void 0;
          }
        }
        if (!sendButton) {
          return {
            success: false,
            message: 'send button not found',
            retry: true,
            debug: { selectorCandidates }
          };
        }
        
        const disabledAttr = sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true';
        const disabledStyle = getComputedStyle(sendButton).pointerEvents === 'none';
        const disabledClass = /disabled|opacity-4|opacity-5|cursor-not-allowed/i.test(sendButton.className || '');
        const isDisabled = disabledAttr || disabledStyle || disabledClass;
        
        if (isDisabled) {
          return { success: false, message: 'send button disabled', retry: true, 
                   debug: {
                     matchedSelector,
                     disabled: sendButton.disabled,
                     ariaDisabled: sendButton.getAttribute('aria-disabled'),
                     className: sendButton.className
                   } };
        }
        
        sendButton.click();
        return { success: true, message: 'send clicked' };
      })();`;

      const res = (await webview.executeJavaScript(script)) as {
        success?: boolean;
        retry?: boolean;
        message?: string;
        debug?: Record<string, unknown>;
      } | null;

      if (res?.success === true) {
        return;
      }

      if (res?.retry !== true || attempt >= maxRetries - 1) {
        Logger.debugT(
          LogCategory.WEBVIEW,
          messageSenderLogKey("sendTriggerFailed"),
          {
            provider,
            message: res?.message ?? messageSenderT("unknownSendError"),
          },
          {
            provider,
            message: res?.message ?? messageSenderT("unknownSendError"),
            debug: res?.debug ?? {},
          }
        );
        throw new Error(messageSenderT("sendTriggerFailed"));
      }

      await new Promise((resolve) => setTimeout(resolve, retryInterval));
      await trySend(attempt + 1);
    };
    await trySend(0);
  }
}

const messageSender = new MessageSenderClass();
export { messageSender as MessageSender };
