import { Logger } from "../../../modules/logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { DEFAULT_APP_LANGUAGE, type AppLanguage, type LanguageDescriptor } from "@shared/i18n.js";
import { getErrorMessage } from "@shared/index.js";
import { normalizeAppLanguage } from "../../../../../shared/i18n/locale.js";
import { AppI18n, formatLanguageLabel } from "../../../modules/i18n/index.js";
import type { AppSettings, GoogleDriveSettings } from "@shared/settings.js";
import { t as entranceT } from "../panel-i18n.js";

interface SettingsManager {
  getSnapshot(): AppSettings;
  save(settings: Record<string, unknown>): Promise<boolean>;
}

interface GDriveExchangeCodeResult {
  success?: boolean;
  account?: string;
}

function isGDriveExchangeCodeResult(value: unknown): value is GDriveExchangeCodeResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  const successIsValid = maybe["success"] === undefined || typeof maybe["success"] === "boolean";
  const accountIsValid = maybe["account"] === undefined || typeof maybe["account"] === "string";
  return successIsValid && accountIsValid;
}

export class UserPanel {
  settingsManager: SettingsManager;
  languageRenderVersion: number;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
    this.languageRenderVersion = 0;
  }

  init(): void {
    this.setupListeners();
    void this.renderLanguageSection(DEFAULT_APP_LANGUAGE);
    this.render();
  }

  setupListeners(): void {
    const nickInput = document.getElementById("user-nickname-input") as HTMLInputElement | null;
    const avatarEditBtn = document.getElementById("user-avatar-edit-btn");
    if (nickInput) {
      nickInput.addEventListener("blur", (): void => {
        void this.saveNickname();
      });
      nickInput.addEventListener("keydown", (e): void => {
        if (e.key === "Enter") {
          nickInput.blur();
        }
      });
    }

    const handleAvatarEdit = (): void => {
      void this.browseAvatar();
    };

    if (avatarEditBtn instanceof HTMLElement) {
      avatarEditBtn.onclick = (): void => {
        handleAvatarEdit();
      };
      avatarEditBtn.onkeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        handleAvatarEdit();
      };
    }

    const gdriveStartAuthBtn = document.getElementById("gdrive-start-auth");
    if (gdriveStartAuthBtn instanceof HTMLElement) {
      gdriveStartAuthBtn.onclick = (): void => {
        void this.startGDriveAuth();
      };
    }

    const gdriveConnectBtn = document.getElementById("gdrive-connect-btn");
    if (gdriveConnectBtn instanceof HTMLElement) {
      gdriveConnectBtn.onclick = (): void => {
        void this.toggleGDriveConnection();
      };
    }

    const gdriveAuthCodeInput = document.getElementById(
      "gdrive-auth-code"
    ) as HTMLInputElement | null;
    if (gdriveAuthCodeInput !== null) {
      gdriveAuthCodeInput.onchange = (event): void => {
        void this.saveGDriveCode((event.target as HTMLInputElement).value);
      };
    }

    const appLanguageSelect = document.getElementById(
      "app-language-select"
    ) as HTMLSelectElement | null;
    if (appLanguageSelect !== null) {
      appLanguageSelect.onchange = (event): void => {
        void this.saveAppLanguage((event.target as HTMLSelectElement).value);
      };
    }
  }

  render(): void {
    const settings = this.settingsManager.getSnapshot();
    const user = settings.user ?? {};
    const integrations = settings.integrations ?? {};
    const gd = (integrations.googledrive ?? {}) as Partial<GoogleDriveSettings> & {
      clientId?: string;
      clientSecret?: string;
      authorizationCode?: string;
    };

    const nickInput = document.getElementById("user-nickname-input") as HTMLInputElement | null;
    if (nickInput && document.activeElement !== nickInput) {
      nickInput.value = user.nickname ?? entranceT("user.defaultNickname");
    }

    const gdStatus = document.getElementById("gdrive-status-dot");
    const gdBtn = document.getElementById("gdrive-connect-btn");
    const isConnected = gd.connected === true;
    const driveStatusLabel = isConnected
      ? AppI18n.t("entrance.user.googleDrive.connected")
      : AppI18n.t("entrance.user.googleDrive.disconnected");

    if (gdStatus instanceof HTMLElement) {
      gdStatus.classList.toggle("is-connected", isConnected);
      gdStatus.classList.toggle("is-error", !isConnected);
      gdStatus.classList.remove("is-warning");
      gdStatus.title = driveStatusLabel;
      gdStatus.setAttribute("aria-label", driveStatusLabel);
    }
    if (gdBtn) {
      gdBtn.textContent = isConnected
        ? AppI18n.t("entrance.user.googleDrive.disconnect")
        : AppI18n.t("entrance.user.googleDrive.connect");
      gdBtn.classList.toggle("btn-danger", isConnected);
      gdBtn.classList.toggle("btn-primary", !isConnected);
    }

    const clientIdEl = document.getElementById("gdrive-client-id") as HTMLInputElement | null;
    const clientSecretEl = document.getElementById(
      "gdrive-client-secret"
    ) as HTMLInputElement | null;
    const authCodeEl = document.getElementById("gdrive-auth-code") as HTMLInputElement | null;
    const appLanguageEl = document.getElementById(
      "app-language-select"
    ) as HTMLSelectElement | null;

    if (clientIdEl) clientIdEl.value = gd.clientId ?? "";
    if (clientSecretEl) clientSecretEl.value = gd.clientSecret ?? "";
    if (authCodeEl) authCodeEl.value = gd.authorizationCode ?? "";
    if (appLanguageEl) {
      appLanguageEl.value = settings.general?.language ?? DEFAULT_APP_LANGUAGE;
    }
    void this.renderLanguageSection(settings.general?.language ?? DEFAULT_APP_LANGUAGE);
  }

  private async renderLanguageSection(language: AppLanguage): Promise<void> {
    const renderVersion = ++this.languageRenderVersion;
    const nextLanguage = normalizeAppLanguage(language);

    await AppI18n.setLocale(nextLanguage);
    let languages = await AppI18n.listLanguages();
    if (renderVersion !== this.languageRenderVersion) {
      return;
    }

    if (languages.some((item) => item.locale === nextLanguage) === false) {
      languages = [
        ...languages,
        {
          locale: nextLanguage,
          nativeName: nextLanguage,
          selectorLanguage: nextLanguage === "en" ? "en" : "tr",
          source: "external",
        } satisfies LanguageDescriptor,
      ];
    }

    const labelEl = document.getElementById("app-language-label");
    const selectEl = document.getElementById("app-language-select") as HTMLSelectElement | null;

    if (labelEl) {
      labelEl.textContent = AppI18n.t("entrance.user.language.label");
    }

    if (!selectEl) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const descriptor of languages) {
      fragment.append(new Option(formatLanguageLabel(descriptor), descriptor.locale));
    }

    selectEl.replaceChildren(fragment);
    selectEl.value = nextLanguage;
  }

  async saveAppLanguage(language: string): Promise<void> {
    const nextLanguage = normalizeAppLanguage(language);
    const current = this.settingsManager.getSnapshot();

    if (current.general?.language === nextLanguage) {
      return;
    }

    const updated = {
      ...current,
      general: { ...current.general, language: nextLanguage },
    };
    await this.settingsManager.save(updated);
  }

  async saveNickname(): Promise<void> {
    const input = document.getElementById("user-nickname-input") as HTMLInputElement | null;
    const nick = input?.value.trim() ?? "";

    if (nick !== "") {
      const current = this.settingsManager.getSnapshot();
      if (current.user?.nickname === nick) return;

      const updated = {
        ...current,
        user: { ...current.user, nickname: nick },
      };
      await this.settingsManager.save(updated);
    } else {
      this.render();
    }
  }

  async browseAvatar(): Promise<void> {
    try {
      const electronApi = window.electronAPI;
      if (!electronApi) return;
      const showOpenDialog = electronApi["showOpenDialog"];
      if (typeof showOpenDialog !== "function") return;
      const result = await showOpenDialog({
        title: AppI18n.t("entrance.user.dialog.avatarTitle"),
        buttonLabel: AppI18n.t("entrance.user.dialog.selectButton"),
        filters: [
          {
            name: AppI18n.t("entrance.user.dialog.imageFilterName"),
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
        properties: ["openFile"],
      });

      if (result.canceled === true || result.filePaths.length === 0) return;

      const selectedPath = result.filePaths[0] ?? "";
      if (selectedPath === "") return;
      const copyToAssets = electronApi["copyToAssets"];
      if (typeof copyToAssets !== "function") return;
      const copied = await copyToAssets(selectedPath, "user", null);
      const targetPath = copied?.path ?? selectedPath;

      const current = this.settingsManager.getSnapshot();
      const updated = {
        ...current,
        user: { ...current.user, avatarPath: targetPath },
      };
      await this.settingsManager.save(updated);
    } catch (err) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.userAvatarError", { message: getErrorMessage(err) })
      );
    }
  }

  async startGDriveAuth(): Promise<void> {
    try {
      const electronApi = window.electronAPI;
      if (!electronApi) return;
      const googledriveStartAuth = electronApi["googledriveStartAuth"];
      if (typeof googledriveStartAuth !== "function") return;
      await googledriveStartAuth();
    } catch (err) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.googleDriveAuthError", { message: getErrorMessage(err) })
      );
    }
  }

  async saveGDriveCode(code: string): Promise<void> {
    const trimmed = String(code).trim();
    if (trimmed === "") return;
    const settings = this.settingsManager.getSnapshot();
    const integrations = settings.integrations ?? {};
    const gd = (integrations.googledrive ?? {}) as Partial<GoogleDriveSettings> & {
      authorizationCode?: string;
    };
    const updated = {
      ...settings,
      integrations: {
        ...settings.integrations,
        googledrive: { ...gd, authorizationCode: trimmed },
      },
    };
    await this.settingsManager.save(updated);
  }

  async toggleGDriveConnection(): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    const integrations = settings.integrations ?? {};
    const gd = (integrations.googledrive ?? {}) as Partial<GoogleDriveSettings>;
    const electronApi = window.electronAPI;
    if (!electronApi) return;

    if (gd.connected === true) {
      try {
        const googledriveDisconnect = electronApi["googledriveDisconnect"];
        if (typeof googledriveDisconnect !== "function") return;
        await googledriveDisconnect();
        const updated = {
          ...settings,
          integrations: {
            ...settings.integrations,
            googledrive: { ...gd, connected: false, account: "" },
          },
        };
        await this.settingsManager.save(updated);
        this.render();
      } catch (e) {
        Logger.error(
          LogCategory.ENTRANCE,
          entranceT("logs.googleDriveDisconnectError", { message: getErrorMessage(e) })
        );
      }
    } else {
      const clientId = (
        document.getElementById("gdrive-client-id") as HTMLInputElement
      ).value.trim();
      const clientSecret = (
        document.getElementById("gdrive-client-secret") as HTMLInputElement
      ).value.trim();
      const code = (document.getElementById("gdrive-auth-code") as HTMLInputElement).value.trim();

      if (clientId === "" || clientSecret === "" || code === "") return;

      const updated = {
        ...settings,
        integrations: {
          ...settings.integrations,
          googledrive: { ...gd, clientId, clientSecret, authorizationCode: code },
        },
      };
      await this.settingsManager.save(updated);

      try {
        const googledriveExchangeCode = electronApi["googledriveExchangeCode"];
        if (typeof googledriveExchangeCode !== "function") return;
        const rawRes: unknown = await googledriveExchangeCode(code);
        const res = isGDriveExchangeCodeResult(rawRes) ? rawRes : null;
        if (res?.success === true) {
          const finalUpdated = {
            ...updated,
            integrations: {
              ...updated.integrations,
              googledrive: {
                ...updated.integrations.googledrive,
                connected: true,
                account: res.account ?? "",
              },
            },
          };
          await this.settingsManager.save(finalUpdated);
          this.render();
        }
      } catch (e) {
        Logger.error(
          LogCategory.ENTRANCE,
          entranceT("logs.googleDriveCodeExchangeError", { message: getErrorMessage(e) })
        );
      }
    }
  }
}
