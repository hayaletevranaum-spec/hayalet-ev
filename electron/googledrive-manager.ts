import { PassThrough } from "stream";
import type { IpcMainInvokeEvent } from "electron";
import { google } from "googleapis";
import { loadSettings, saveSettings } from "./settings-manager.ts";
import { shouldConvertToGoogleDoc } from "./googledrive-utils.ts";
import { getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import type { TranslationParams } from "../src/types/i18n.ts";
import { DEFAULT_APP_LANGUAGE } from "../src/types/i18n.ts";
import { loadAvailableLanguage } from "./i18n/language-service.ts";
import { translateCatalog } from "../shared/i18n/catalog.js";
import { getBuiltInLanguagePack } from "../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage } from "../shared/i18n/locale.js";

const logger = getLoggerCore();

interface GoogleDriveConfig {
  clientId?: string;
  clientSecret?: string;
  tokens?: unknown;
  connected?: boolean;
  account?: string;
}

interface Settings {
  general?: {
    language?: unknown;
  };
  integrations?: {
    googledrive?: GoogleDriveConfig;
  };
}

interface UploadPayload {
  files?: Array<{
    name?: string;
    mimeType?: string;
    base64?: string;
  }>;
}

function safeGet(obj: unknown, path: string, def: unknown = ""): unknown {
  try {
    const keys = path.split(".");
    let current: unknown = obj;

    for (const key of keys) {
      if (typeof current !== "object" || current === null || !(key in current)) {
        return def;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current ?? def;
  } catch {
    return def;
  }
}

async function translateElectronMessage(
  key: string,
  params?: TranslationParams,
  settings?: Settings
): Promise<string> {
  let resolvedSettings = settings;
  if (resolvedSettings === undefined) {
    try {
      resolvedSettings = (await loadSettings()) ?? {};
    } catch {
      resolvedSettings = {};
    }
  }

  const locale = normalizeAppLanguage(resolvedSettings.general?.language);
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
  const activePack = (await loadAvailableLanguage(locale)) ?? fallbackPack;
  const activeCatalog = activePack?.catalog ?? {};
  const fallbackCatalog = fallbackPack?.catalog;

  return translateCatalog(activeCatalog, key, params, fallbackCatalog);
}

export async function googleDriveT(
  key: string,
  params?: TranslationParams,
  settings?: Settings
): Promise<string> {
  return await translateElectronMessage(`electron.googleDrive.${key}`, params, settings);
}

export async function googledriveStartAuth(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; authUrl?: string; message?: string }> {
  try {
    let settings: Settings = {};
    try {
      settings = (await loadSettings()) ?? {};
    } catch (_err) {
      settings = {};
    }
    const gconf = safeGet(settings, "integrations.googledrive", {}) as GoogleDriveConfig;
    const clientId = gconf.clientId ?? process.env["GOOGLE_CLIENT_ID"] ?? "";
    const clientSecret = gconf.clientSecret ?? process.env["GOOGLE_CLIENT_SECRET"] ?? "";

    if (clientId.length === 0 || clientSecret.length === 0) {
      return {
        success: false,
        message: await googleDriveT("clientConfigMissing", undefined, settings),
      };
    }

    const redirect = "urn:ietf:wg:oauth:2.0:oob";
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirect);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });

    return { success: true, authUrl };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : await googleDriveT("authStartFailed"),
    };
  }
}

export async function googledriveExchangeCode(
  _event: IpcMainInvokeEvent,
  code: string
): Promise<{ success: boolean; account?: string; message?: string }> {
  try {
    if (code.length === 0) {
      return { success: false, message: await googleDriveT("authorizationCodeMissing") };
    }
    let settings: Settings = {};
    try {
      settings = (await loadSettings()) ?? {};
    } catch (_err) {
      settings = {};
    }
    const gconf = safeGet(settings, "integrations.googledrive", {}) as GoogleDriveConfig;
    const clientId = gconf.clientId ?? process.env["GOOGLE_CLIENT_ID"] ?? "";
    const clientSecret = gconf.clientSecret ?? process.env["GOOGLE_CLIENT_SECRET"] ?? "";
    if (clientId.length === 0 || clientSecret.length === 0) {
      return {
        success: false,
        message: await googleDriveT("clientConfigMissing", undefined, settings),
      };
    }
    const redirect = "urn:ietf:wg:oauth:2.0:oob";
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirect);
    const { tokens } = await oauth2Client.getToken(String(code).trim());
    oauth2Client.setCredentials(tokens);
    settings.integrations = settings.integrations ?? {};
    settings.integrations.googledrive = settings.integrations.googledrive ?? {};
    settings.integrations.googledrive.tokens = tokens;

    let accountEmail = "";
    try {
      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const me = (await oauth2.userinfo.get()).data;
      accountEmail = me.email ?? "";
    } catch (err: unknown) {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.WARNING,
        "electron.googleDrive.logs.accountEmailFetchFailed",
        { message: err instanceof Error ? err.message : String(err) },
        { error: err instanceof Error ? err.message : String(err) }
      );
    }

    settings.integrations.googledrive.connected = true;
    settings.integrations.googledrive.account = accountEmail;

    try {
      await saveSettings(settings);
    } catch (err: unknown) {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.WARNING,
        "electron.googleDrive.logs.settingsSaveAfterConnectFailed",
        { message: err instanceof Error ? err.message : String(err) },
        { error: err instanceof Error ? err.message : String(err) }
      );
    }

    return { success: true, account: accountEmail };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : await googleDriveT("exchangeFailed"),
    };
  }
}

export async function googledriveDisconnect(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; message?: string }> {
  try {
    let settings: Settings = {};
    try {
      settings = (await loadSettings()) ?? {};
    } catch (_err) {
      settings = {};
    }
    if (settings.integrations?.googledrive !== undefined) {
      delete settings.integrations.googledrive.tokens;
      delete settings.integrations.googledrive.connected;
      delete settings.integrations.googledrive.account;
      try {
        await saveSettings(null, settings);
      } catch (err: unknown) {
        void logger.logInternalT(
          LogCategory.MAIN,
          LogLevel.WARNING,
          "electron.googleDrive.logs.settingsSaveAfterDisconnectFailed",
          { message: err instanceof Error ? err.message : String(err) },
          { error: err instanceof Error ? err.message : String(err) }
        );
      }
    }
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : await googleDriveT("disconnectFailed"),
    };
  }
}

export async function googledriveUpload(
  _event: IpcMainInvokeEvent,
  payload: UploadPayload = {}
): Promise<{ success: boolean; uploadedLinks?: unknown[]; errors?: unknown[]; message?: string }> {
  try {
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (files.length === 0) {
      return { success: false, message: await googleDriveT("noFilesProvided") };
    }
    let settings: Settings = {};
    try {
      settings = (await loadSettings()) ?? {};
    } catch (_e) {
      settings = {};
    }
    const gconf = safeGet(settings, "integrations.googledrive", {}) as GoogleDriveConfig;
    const clientId = gconf.clientId ?? process.env["GOOGLE_CLIENT_ID"] ?? "";
    const clientSecret = gconf.clientSecret ?? process.env["GOOGLE_CLIENT_SECRET"] ?? "";
    const tokens = gconf.tokens ?? null;
    if (clientId.length === 0 || clientSecret.length === 0 || tokens === null) {
      return {
        success: false,
        message: await googleDriveT("authorizationMissing", undefined, settings),
      };
    }
    const redirect = "urn:ietf:wg:oauth:2.0:oob";
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirect);
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const uploadResults = await Promise.all(
      files.map(async (file) => {
        try {
          const buffer = Buffer.from(file.base64 ?? "", "base64");
          const pass = new PassThrough();
          pass.end(buffer);
          const name = file.name ?? `file-${Date.now()}`;
          const isText = shouldConvertToGoogleDoc(file.mimeType, name);
          const resource: { name: string; mimeType?: string } = { name };
          if (isText) resource.mimeType = "application/vnd.google-apps.document";
          const media = {
            mimeType: file.mimeType ?? "application/octet-stream",
            body: pass,
          };
          const res = await drive.files.create({
            requestBody: resource,
            media,
            fields: "id,name,webViewLink,webContentLink",
          });
          const fileId = res.data.id;
          if (typeof fileId !== "string" || fileId.length === 0)
            throw new Error(await googleDriveT("uploadIdMissing", undefined, settings));
          try {
            await drive.permissions.create({
              fileId,
              requestBody: { role: "reader", type: "anyone" },
            });
          } catch (err: unknown) {
            void logger.logInternalT(
              LogCategory.MAIN,
              LogLevel.WARNING,
              "electron.googleDrive.logs.permissionsSetFailed",
              {
                fileId,
                message: err instanceof Error ? err.message : String(err),
              },
              { error: err instanceof Error ? err.message : String(err), fileId }
            );
          }
          const url = isText
            ? `https://docs.google.com/document/d/${fileId}/export?format=pdf`
            : `https://drive.google.com/uc?export=view&id=${fileId}`;
          return { success: true as const, data: { name, url, id: fileId } };
        } catch (err: unknown) {
          return {
            success: false as const,
            error: {
              name: file.name ?? "file",
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }
      })
    );
    const uploadedLinks: Array<{ name: string; url: string; id: string }> = uploadResults
      .filter(
        (result): result is { success: true; data: { name: string; url: string; id: string } } =>
          result.success
      )
      .map((result) => result.data);
    const errors: Array<{ name: string; message: string }> = uploadResults
      .filter(
        (result): result is { success: false; error: { name: string; message: string } } =>
          !result.success
      )
      .map((result) => result.error);
    if (uploadedLinks.length === 0) {
      return {
        success: false,
        message: await googleDriveT("uploadFailed", undefined, settings),
        errors,
      };
    }
    return {
      success: true,
      uploadedLinks,
      ...(errors.length > 0 ? { errors } : {}),
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : await googleDriveT("uploadFailed"),
    };
  }
}
