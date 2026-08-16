import type {
  Us1AcceptRemoteUserParams,
  Us1DeleteMailAccountParams,
  Us1InviteRemoteUserParams,
  Us1MailAccountDraft,
  Us1RejectRemoteUserParams,
} from "@shared/us1-mail.js";

import { LogCategory, LogLevel } from "@shared/index.js";
import { shell } from "electron";
import { getLoggerCore } from "../logger/index.js";
import { mailIdentityService } from "../mail-identity-service.ts";
import { us1ConversationService } from "../us1-conversation-service.ts";
import { registerHandler } from "./ipc-helpers.ts";

const ALLOWED_GOOGLE_AUTH_DOMAINS = ["accounts.google.com", "www.google.com", "google.com"];
const logger = getLoggerCore();

export function setupUs1MailHandlers(): void {
  registerHandler("us1-upsert-mail-account", async (_event, draft: unknown, options: unknown) => {
    return await mailIdentityService.upsertMailAccount(
      draft as Us1MailAccountDraft,
      options as { verifyAfterSave?: boolean }
    );
  });

  registerHandler("us1-verify-mail-account", async (_event, params: unknown) => {
    const payload = params as { mailAccountId?: string };
    return await mailIdentityService.verifyMailAccount(payload.mailAccountId ?? "");
  });

  registerHandler("us1-delete-mail-account", async (_event, params: unknown) => {
    return await mailIdentityService.deleteMailAccount(params as Us1DeleteMailAccountParams);
  });

  registerHandler("us1-invite-remote-user", async (_event, params: unknown) => {
    return await mailIdentityService.inviteRemoteUser(params as Us1InviteRemoteUserParams);
  });

  registerHandler("us1-accept-remote-user", async (_event, params: unknown) => {
    return await mailIdentityService.acceptRemoteUser(params as Us1AcceptRemoteUserParams);
  });

  registerHandler("us1-reject-remote-user", async (_event, params: unknown) => {
    return await mailIdentityService.rejectRemoteUser(params as Us1RejectRemoteUserParams);
  });

  registerHandler("us1-sync-remote-users", async (_event, params: unknown) => {
    return await mailIdentityService.syncRemoteUsers(params ?? {});
  });

  registerHandler("us1-send-message", async (_event, params: unknown) => {
    return await us1ConversationService.sendMessage(params ?? {});
  });

  registerHandler("us1-sync-messages", async (_event, params: unknown) => {
    return await us1ConversationService.syncMessages(params ?? {});
  });

  registerHandler("us1-relay-health-check", async (_event, params: unknown) => {
    return await us1ConversationService.checkRelayHealth(params ?? {});
  });

  registerHandler("us1-mail-start-gmail-oauth", async (_event) => {
    await logger.logInternal(LogCategory.IPC, LogLevel.INFO, "US1 Gmail OAuth start requested.", {
      operation: "us1-mail-start-gmail-oauth",
    });

    const result = await mailIdentityService.startGmailOauth();
    const authUrl = typeof result.authUrl === "string" ? result.authUrl.trim() : "";
    const hasAuthUrl = authUrl !== "";

    await logger.logInternal(
      LogCategory.IPC,
      result.success ? LogLevel.INFO : LogLevel.WARNING,
      "US1 Gmail OAuth URL generation completed.",
      {
        operation: "us1-mail-start-gmail-oauth",
        success: result.success,
        hasAuthUrl,
        ...(typeof result.error === "string" && result.error.trim() !== ""
          ? { error: result.error.trim() }
          : {}),
      }
    );

    if (!result.success) {
      return result;
    }

    if (hasAuthUrl) {
      try {
        const urlObj = new URL(authUrl);

        if (ALLOWED_GOOGLE_AUTH_DOMAINS.includes(urlObj.hostname)) {
          await shell.openExternal(authUrl);

          await logger.logInternal(
            LogCategory.IPC,
            LogLevel.INFO,
            "US1 Gmail OAuth URL opened in the external browser.",
            {
              operation: "us1-mail-start-gmail-oauth",
              hostname: urlObj.hostname,
            }
          );

          return { success: true };
        } else {
          await logger.logInternal(
            LogCategory.IPC,
            LogLevel.WARNING,
            "US1 Gmail OAuth URL blocked because the hostname is not allowed.",
            {
              operation: "us1-mail-start-gmail-oauth",
              hostname: urlObj.hostname,
            }
          );

          return { success: false, error: `Domain not allowed: ${urlObj.hostname}` };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logger.logInternal(
          LogCategory.IPC,
          LogLevel.ERROR,
          "US1 Gmail OAuth URL could not be opened.",
          {
            operation: "us1-mail-start-gmail-oauth",
            error: message,
          }
        );

        return { success: false, error: `Browser open error: ${String(err)}` };
      }
    }

    await logger.logInternal(
      LogCategory.IPC,
      LogLevel.WARNING,
      "US1 Gmail OAuth completed without an auth URL.",
      {
        operation: "us1-mail-start-gmail-oauth",
      }
    );

    return { success: false, error: "Auth URL generation failed." };
  });

  registerHandler("us1-mail-exchange-gmail-code", async (_event, params: unknown) => {
    const payload = params as { code: string };
    return await mailIdentityService.exchangeGmailCode(payload.code);
  });

  registerHandler("us1-mail-listen-gmail-code", async (_event) => {
    return await mailIdentityService.listenForGmailCode();
  });
}
