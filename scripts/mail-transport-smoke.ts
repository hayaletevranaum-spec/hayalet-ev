import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveMailTransportAccount, MailTransportService } from "../electron/mail-transport/index.ts";
import { normalizeSettings } from "../src/js/modules/settings/settings-schema.ts";

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): { action: string; args: ArgMap } {
  const [action = "", ...rest] = argv;
  const args: ArgMap = {};

  rest.forEach((entry) => {
    if (!entry.startsWith("--")) {
      return;
    }

    const normalized = entry.slice(2);
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex === -1) {
      args[normalized] = true;
      return;
    }

    const key = normalized.slice(0, separatorIndex);
    const value = normalized.slice(separatorIndex + 1);
    args[key] = value;
  });

  return { action, args };
}

function getRequiredArg(args: ArgMap, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required argument --${key}=...`);
  }
  return value.trim();
}

function getOptionalArg(args: ArgMap, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function loadSettingsFromFile(settingsPath: string): Promise<ReturnType<typeof normalizeSettings>> {
  const raw = await readFile(resolve(settingsPath), "utf8");
  return normalizeSettings(JSON.parse(raw));
}

async function main(): Promise<void> {
  const { action, args } = parseArgs(process.argv.slice(2));
  if (action !== "send" && action !== "fetch") {
    throw new Error(
      "Usage: npx tsx scripts/mail-transport-smoke.ts <send|fetch> --account=<id> [--settings=config/settings.json] ..."
    );
  }

  const settingsPath = getOptionalArg(args, "settings") ?? "config/settings.json";
  const settings = await loadSettingsFromFile(settingsPath);
  const account = resolveMailTransportAccount(settings, getRequiredArg(args, "account"));
  const service = new MailTransportService();

  if (action === "send") {
    const req: Parameters<typeof service.sendMail>[1] = {
      localMessageId: getOptionalArg(args, "local-message-id") ?? `smoke-${Date.now().toString(36)}`,
      to: getRequiredArg(args, "to"),
      subject: getRequiredArg(args, "subject"),
      text: getOptionalArg(args, "text") ?? "",
      remoteUserId: getOptionalArg(args, "remote-user"),
      localSessionId: getOptionalArg(args, "local-session"),
      threadMessageId: getOptionalArg(args, "thread-message-id"),
      inReplyTo: getOptionalArg(args, "in-reply-to"),
    };

    const html = getOptionalArg(args, "html");
    if (html !== null) {
      req.html = html;
    }

    const result = await service.sendMail(account, req);
    console.info(JSON.stringify(result, null, 2));
    return;
  }

  const req: Parameters<typeof service.fetchInbox>[1] = {
    remoteUserId: getOptionalArg(args, "remote-user"),
    localSessionId: getOptionalArg(args, "local-session"),
    includeAttachmentContent: args["include-attachment-content"] === true,
  };

  const mailbox = getOptionalArg(args, "mailbox");
  if (mailbox !== null) {
    req.mailbox = mailbox;
  }

  if (typeof args["limit"] === "string" && args["limit"].trim() !== "") {
    req.limit = Number.parseInt(args["limit"], 10);
  }

  const result = await service.fetchInbox(account, req);
  console.info(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
