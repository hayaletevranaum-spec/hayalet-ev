import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from "mailparser";
import nodemailer, { type SendMailOptions } from "nodemailer";

import { LogCategory, LogLevel } from "@shared/index.js";
import type { MailTransportAccountConfig } from "@shared/settings.js";
import { hashString, normalizeText } from "../database/hash-utils.js";
import {
  MailSidecarStoreManager,
  type MailSessionMapRecord,
} from "../database/mail-sidecar-manager.js";
import { getLoggerCore } from "../logger/index.js";
import {
  applyMailTransportAccountDefaults,
  type ResolvedMailTransportAccountConfig,
} from "./config.js";
import type {
  FetchInboxRequest,
  FetchInboxResult,
  MailTransportErrorKind,
  MailTransportImapClient,
  MailTransportMessageAddress,
  MailTransportParsedAttachment,
  ProbeMailAccountResult,
  MailTransportServiceOptions,
  MailTransportSmtpTransporter,
  ParsedTransportMessage,
  ProcessIncomingMessageRequest,
  ProcessIncomingMessageResult,
  SendMailRequest,
  SendMailResult,
} from "./types.js";

const DEFAULT_DOMAIN = "mail.hayalet-ev.local";

function asStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter((entry) => entry !== "");
  }
  if (typeof value === "string" && value.trim() !== "") {
    return [value.trim()];
  }
  return [];
}

function normalizeMessageId(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("messageId is required");
  }
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed : `<${trimmed}>`;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toTimestamp(value: Date | string | number | null | undefined, fallback: number): number {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function flattenAddresses(
  value: AddressObject | AddressObject[] | undefined
): MailTransportMessageAddress[] {
  if (value === undefined) {
    return [];
  }

  const objects = Array.isArray(value) ? value : [value];
  return objects.flatMap((entry) =>
    entry.value.map((address) => ({
      name: normalizeOptionalText(address.name),
      address: normalizeOptionalText(address.address),
    }))
  );
}

function normalizeParsedAttachment(
  attachment: Attachment,
  includeContent: boolean
): MailTransportParsedAttachment {
  return {
    filename: normalizeOptionalText(attachment.filename),
    contentType: normalizeOptionalText(attachment.contentType),
    contentDisposition: normalizeOptionalText(attachment.contentDisposition),
    checksum: normalizeOptionalText(attachment.checksum),
    size: attachment.size,
    contentId: normalizeOptionalText(attachment.contentId ?? attachment.cid),
    inline: attachment.related === true || attachment.contentDisposition === "inline",
    ...(includeContent ? { content: attachment.content } : {}),
  };
}

function normalizeReferences(
  references: ParsedMail["references"],
  inReplyTo?: string | undefined
): string[] {
  const values = [
    ...(Array.isArray(references)
      ? references
      : typeof references === "string"
        ? [references]
        : []),
    ...(typeof inReplyTo === "string" ? [inReplyTo] : []),
  ]
    .map((entry) => normalizeOptionalText(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => normalizeMessageId(entry));

  return Array.from(new Set(values));
}

function toCursor(uid: number | null): string | null {
  return uid === null ? null : `uid:${uid}`;
}

function parseCursor(cursor: string | null | undefined): number | null {
  if (typeof cursor !== "string") {
    return null;
  }
  const match = cursor.match(/^uid:(\d+)$/);
  if (match === null) {
    return null;
  }
  const [, raw] = match;
  if (typeof raw !== "string") {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildHeadersHash(lines: string[]): string {
  return hashString(lines.join("\n"));
}

function parseHeaderValue(headerLines: string[], headerName: string): string | null {
  const normalizedHeaderName = headerName.toLowerCase();
  for (const line of headerLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (key !== normalizedHeaderName) {
      continue;
    }

    return normalizeOptionalText(line.slice(separatorIndex + 1));
  }

  return null;
}

function buildOutboundHeadersHash(message: SendMailRequest, transportMessageId: string): string {
  return hashString(
    JSON.stringify({
      messageId: transportMessageId,
      to: asStringArray(message.to),
      cc: asStringArray(message.cc),
      bcc: asStringArray(message.bcc),
      subject: message.subject,
      inReplyTo: normalizeOptionalText(message.inReplyTo),
      references: asStringArray(message.references),
      replyTo: normalizeOptionalText(message.replyTo),
      headers: message.headers ?? {},
      attachments:
        message.attachments?.map((attachment) => ({
          filename: attachment.filename ?? null,
          contentType: attachment.contentType ?? null,
          path: attachment.path ?? null,
          inline: attachment.contentDisposition === "inline",
          hasContent: attachment.content !== undefined,
        })) ?? [],
    })
  );
}

function buildDefaultLocalMessageId(
  accountId: string,
  fingerprint: string,
  uid: number | null,
  remoteUserId: string | null
): string {
  const suffix = uid !== null ? `uid-${uid}` : fingerprint.slice(0, 16);
  const remoteSuffix = remoteUserId !== null ? hashString(remoteUserId).slice(0, 8) : "anonymous";
  return `mail-in:${accountId}:${remoteSuffix}:${suffix}`;
}

function buildTransportMessageId(accountId: string, localMessageId: string, now: number): string {
  return `<${hashString(`${accountId}:${localMessageId}:${now}`)}@${DEFAULT_DOMAIN}>`;
}

function isAuthenticationError(
  error: Error & {
    code?: unknown;
    authenticationFailed?: unknown;
    serverResponseCode?: unknown;
  }
): boolean {
  if (
    error.code === "EAUTH" ||
    error.authenticationFailed === true ||
    error.serverResponseCode === "AUTHENTICATIONFAILED"
  ) {
    return true;
  }

  const normalizedMessage = normalizeText(error.message).toLowerCase();
  return (
    normalizedMessage.includes("authentication") ||
    normalizedMessage.includes("auth failed") ||
    normalizedMessage.includes("login failed") ||
    normalizedMessage.includes("invalid credentials")
  );
}

export class MailTransportError extends Error {
  kind: MailTransportErrorKind;
  retriable: boolean;
  details?: Record<string, unknown>;

  constructor(
    kind: MailTransportErrorKind,
    message: string,
    options: {
      retriable?: boolean;
      cause?: unknown;
      details?: Record<string, unknown>;
    } = {}
  ) {
    const errorOptions: ErrorOptions | undefined =
      options.cause !== undefined ? { cause: options.cause } : undefined;
    super(message, errorOptions);
    this.name = "MailTransportError";
    this.kind = kind;
    this.retriable = options.retriable ?? false;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

function classifyTransportError(
  error: unknown,
  fallbackKind: MailTransportErrorKind = "transport_error"
): MailTransportError {
  if (error instanceof MailTransportError) {
    return error;
  }
  if (error instanceof Error) {
    const authLikeError = error as Error & {
      code?: unknown;
      authenticationFailed?: unknown;
      responseText?: unknown;
      response?: unknown;
      serverResponseCode?: unknown;
    };
    const errorCode = typeof authLikeError.code === "string" ? authLikeError.code : "";
    if (isAuthenticationError(authLikeError)) {
      const responseText = authLikeError.responseText;
      const message =
        error.message === "Command failed" &&
        typeof responseText === "string" &&
        responseText !== ""
          ? responseText
          : error.message;

      return new MailTransportError("auth_error", message, {
        cause: error,
        retriable: false,
        details: {
          ...(errorCode !== "" ? { code: errorCode } : {}),
          ...(authLikeError.response !== undefined ? { response: authLikeError.response } : {}),
          ...(authLikeError.serverResponseCode !== undefined
            ? { serverResponseCode: authLikeError.serverResponseCode }
            : {}),
          ...(responseText !== undefined ? { responseText } : {}),
        },
      });
    }

    const retriable = fallbackKind === "transport_error";
    return new MailTransportError(fallbackKind, error.message, {
      cause: error,
      retriable,
      ...(errorCode !== "" ? { details: { code: errorCode } } : {}),
    });
  }

  return new MailTransportError(fallbackKind, String(error), {
    retriable: fallbackKind === "transport_error",
  });
}

export class MailTransportService {
  private retryBaseMs: number;
  private maxRetries: number;
  private now: () => number;
  private wait: (ms: number) => Promise<void>;
  private createImapClient: (
    account: ResolvedMailTransportAccountConfig
  ) => MailTransportImapClient;
  private createSmtpTransporter: (
    account: ResolvedMailTransportAccountConfig
  ) => MailTransportSmtpTransporter;

  constructor(options: MailTransportServiceOptions = {}) {
    this.retryBaseMs = options.retryBaseMs ?? 1500;
    this.maxRetries = options.maxRetries ?? 2;
    this.now = options.now ?? ((): number => Date.now());
    this.wait =
      options.wait ??
      (async (ms: number): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
    this.createImapClient =
      options.createImapClient ??
      ((account): MailTransportImapClient => {
        const loginMethod = normalizeOptionalText(account.auth.loginMethod);
        const auth =
          account.authType === "oauth2"
            ? {
                user: account.auth.user,
                accessToken: normalizeOptionalText(account.auth.accessToken) ?? "",
                ...(loginMethod !== null ? { loginMethod } : {}),
              }
            : {
                user: account.auth.user,
                pass: normalizeOptionalText(account.auth.password) ?? "",
                ...(loginMethod !== null ? { loginMethod } : {}),
              };

        const config: ImapFlowOptions = {
          host: account.imap.host,
          port: account.imap.port,
          secure: account.imap.secure,
          auth,
          disableAutoIdle: true,
          logger: false,
        };

        return new ImapFlow(config);
      });
    this.createSmtpTransporter =
      options.createSmtpTransporter ??
      ((account): MailTransportSmtpTransporter => {
        const refreshToken = normalizeOptionalText(account.auth.refreshToken);
        const clientId = normalizeOptionalText(account.auth.clientId);
        const clientSecret = normalizeOptionalText(account.auth.clientSecret);
        const expiresAt = account.auth.expiresAt;
        const expires =
          typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0
            ? expiresAt
            : undefined;
        const auth =
          account.authType === "oauth2"
            ? {
                type: "OAuth2" as const,
                user: account.auth.user,
                accessToken: normalizeOptionalText(account.auth.accessToken) ?? "",
                ...(refreshToken !== null ? { refreshToken } : {}),
                ...(clientId !== null ? { clientId } : {}),
                ...(clientSecret !== null ? { clientSecret } : {}),
                ...(expires !== undefined ? { expires } : {}),
              }
            : {
                user: account.auth.user,
                pass: normalizeOptionalText(account.auth.password) ?? "",
              };

        return nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth,
        }) as unknown as MailTransportSmtpTransporter;
      });
  }

  async probeAccount(accountConfig: MailTransportAccountConfig): Promise<ProbeMailAccountResult> {
    const account = this.resolveAccount(accountConfig);
    this.validateSmtpAccount(account);
    this.validateImapAccount(account);

    const transporter = this.createSmtpTransporter(account);
    const client = this.createImapClient(account);
    let imapConnected: boolean = false;

    const logger = getLoggerCore();

    try {
      await this.withRetry("probeSmtp", async () => {
        await transporter.verify?.();
      });

      await this.withRetry("probeImap", async () => {
        await client.connect();
      });
      imapConnected = true;

      return {
        accountId: account.id,
        connectionState: "connected",
        smtpVerified: true,
        imapVerified: true,
      };
    } catch (error) {
      const classified = classifyTransportError(error);
      await logger.logInternal(
        LogCategory.ENTRANCE,
        LogLevel.ERROR,
        `Mail account probe failed for ${account.id}: ${classified.message}`,
        {
          accountId: account.id,
          email: account.email,
          kind: classified.kind,
          details: classified.details,
        }
      );
      throw classified;
    } finally {
      transporter.close?.();
      if (imapConnected) {
        try {
          await client.logout();
        } catch {
          client.close();
        }
      } else {
        client.close();
      }
    }
  }

  async sendMail(
    accountConfig: MailTransportAccountConfig,
    message: SendMailRequest
  ): Promise<SendMailResult> {
    const account = this.resolveAccount(accountConfig);
    this.validateSmtpAccount(account);

    const sidecar = new MailSidecarStoreManager(account.id);
    const remoteUserId =
      normalizeOptionalText(message.remoteUserId) ?? account.binding.remoteUserId;
    const localSessionId =
      normalizeOptionalText(message.localSessionId) ?? account.binding.defaultLocalSessionId;
    const transportMessageId = normalizeMessageId(
      message.messageId ?? buildTransportMessageId(account.id, message.localMessageId, this.now())
    );
    const threadMessageId =
      normalizeOptionalText(message.threadMessageId) ??
      normalizeOptionalText(message.inReplyTo) ??
      transportMessageId;
    const headersHash = buildOutboundHeadersHash(message, transportMessageId);

    sidecar.upsertMessageMeta({
      transportMessageId,
      localMessageId: message.localMessageId,
      deliveryState: "queued",
      headersHash,
    });

    if (remoteUserId !== null && localSessionId !== null) {
      sidecar.upsertSessionMapping({
        remoteUserId,
        localSessionId,
        threadMessageId,
        lastMessageId: transportMessageId,
      });
    }

    const transporter = this.createSmtpTransporter(account);

    try {
      const info = await this.withRetry("sendMail", async (): Promise<Record<string, unknown>> => {
        return await transporter.sendMail(
          this.buildSendMailOptions(account, message, transportMessageId)
        );
      });

      const infoMessageId = (info as { messageId?: string }).messageId;
      const resolvedTransportMessageId = normalizeMessageId(
        normalizeOptionalText(infoMessageId) ?? transportMessageId
      );

      sidecar.upsertMessageMeta({
        transportMessageId: resolvedTransportMessageId,
        localMessageId: message.localMessageId,
        deliveryState: "sent",
        headersHash,
      });

      if (remoteUserId !== null && localSessionId !== null) {
        sidecar.upsertSessionMapping({
          remoteUserId,
          localSessionId,
          threadMessageId,
          lastMessageId: resolvedTransportMessageId,
        });
      }

      const accepted = this.collectAddressList(info["accepted"]);
      const rejected = this.collectAddressList(info["rejected"]);
      const pending = this.collectAddressList(info["pending"]);
      const responseValue = info["response"];
      const response = normalizeOptionalText(
        typeof responseValue === "string" ? responseValue : null
      );

      return {
        accountId: account.id,
        localMessageId: message.localMessageId,
        transportMessageId: resolvedTransportMessageId,
        deliveryState: "sent",
        headersHash,
        accepted,
        rejected,
        pending,
        response,
        remoteUserId,
        localSessionId,
        threadMessageId,
      };
    } catch (error) {
      sidecar.upsertMessageMeta({
        transportMessageId,
        localMessageId: message.localMessageId,
        deliveryState: classifyTransportError(error).kind,
        headersHash,
      });
      throw classifyTransportError(error);
    } finally {
      transporter.close?.();
    }
  }

  async fetchInbox(
    accountConfig: MailTransportAccountConfig,
    request: FetchInboxRequest = {}
  ): Promise<FetchInboxResult> {
    const account = this.resolveAccount(accountConfig);
    this.validateImapAccount(account);

    const sidecar = new MailSidecarStoreManager(account.id);
    const mailbox = normalizeOptionalText(request.mailbox) ?? account.defaultMailbox;
    const limit =
      typeof request.limit === "number" && request.limit > 0
        ? Math.trunc(request.limit)
        : account.fetchBatchSize;
    const existingCursor =
      normalizeOptionalText(request.cursor) ?? sidecar.getSyncCursor(account.id)?.cursor ?? null;
    const sinceUid = parseCursor(existingCursor);
    const client = this.createImapClient(account);

    let lock: {
      path: string;
      release(): void;
    } | null = null;

    try {
      await this.withRetry("fetchInbox", async () => {
        await client.connect();
      });

      lock = await client.getMailboxLock(mailbox, {
        readOnly: true,
        description: "mail-transport-fetch",
      });

      const messages: ProcessIncomingMessageResult[] = [];
      let maxUid: number | null = sinceUid;

      const fetchRange = sinceUid === null ? "1:*" : `${sinceUid + 1}:*`;

      for await (const message of client.fetch(
        { uid: fetchRange },
        {
          uid: true,
          envelope: true,
          internalDate: true,
          source: true,
          flags: true,
          threadId: true,
        },
        { uid: true }
      )) {
        if (message.source === undefined) {
          continue;
        }

        const requestPayload: ProcessIncomingMessageRequest = {
          mailbox,
          uid: message.uid,
          source: message.source,
          internalDate: message.internalDate ?? null,
          threadId: normalizeOptionalText(message.threadId),
          ...(message.envelope !== undefined ? { envelope: message.envelope } : {}),
          ...(message.flags !== undefined ? { flags: message.flags } : {}),
          ...(request.remoteUserId !== undefined ? { remoteUserId: request.remoteUserId } : {}),
          ...(request.localSessionId !== undefined
            ? { localSessionId: request.localSessionId }
            : {}),
          ...(request.includeAttachmentContent !== undefined
            ? { includeAttachmentContent: request.includeAttachmentContent }
            : {}),
        };

        const processed = await this.processIncomingMessage(account, requestPayload);

        messages.push(processed);
        maxUid = maxUid === null ? message.uid : Math.max(maxUid, message.uid);

        if (messages.length >= limit) {
          break;
        }
      }

      const nextCursor = toCursor(maxUid);
      sidecar.updateSyncCursor({
        mailAccountId: account.id,
        cursor: nextCursor,
        lastSync: this.now(),
      });

      return {
        accountId: account.id,
        mailbox,
        cursor: nextCursor,
        fetchedCount: messages.length,
        processedCount: messages.filter((entry) => entry.duplicate === false).length,
        duplicateCount: messages.filter((entry) => entry.duplicate === true).length,
        messages,
      };
    } catch (error) {
      throw classifyTransportError(error);
    } finally {
      lock?.release();
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }

  async processIncomingMessage(
    accountConfig: MailTransportAccountConfig,
    request: ProcessIncomingMessageRequest
  ): Promise<ProcessIncomingMessageResult> {
    const account = this.resolveAccount(accountConfig);
    this.validateAccountEnabled(account);
    const sidecar = new MailSidecarStoreManager(account.id);
    const parseOptions: {
      receivedAt?: string | number | Date;
      includeAttachmentContent?: boolean;
    } = {};
    if (request.internalDate != null) {
      parseOptions.receivedAt = request.internalDate;
    }
    if (request.includeAttachmentContent !== undefined) {
      parseOptions.includeAttachmentContent = request.includeAttachmentContent;
    }
    const parsed = await this.parseTransportMessage(request.source, parseOptions);

    const fingerprint = this.computeReceiptFingerprint(parsed);
    const isDuplicate = sidecar.hasProcessedReceipt({
      transportMessageId: parsed.transportMessageId,
      checksum: fingerprint,
    });

    const sessionContext = this.resolveSessionContext(account, sidecar, parsed, request);
    const localMessageId =
      normalizeOptionalText(request.localMessageId) ??
      buildDefaultLocalMessageId(
        account.id,
        fingerprint,
        request.uid ?? null,
        sessionContext.remoteUserId
      );
    const deliveryState = isDuplicate ? "duplicate_skipped" : "received";

    if (!isDuplicate && parsed.transportMessageId !== null) {
      sidecar.upsertMessageMeta({
        transportMessageId: parsed.transportMessageId,
        localMessageId,
        deliveryState: "received",
        headersHash: parsed.headersHash,
      });
    }

    if (
      !isDuplicate &&
      sessionContext.remoteUserId !== null &&
      sessionContext.localSessionId !== null
    ) {
      sidecar.upsertSessionMapping({
        remoteUserId: sessionContext.remoteUserId,
        localSessionId: sessionContext.localSessionId,
        threadMessageId: sessionContext.threadMessageId,
        lastMessageId: parsed.transportMessageId,
      });
    }

    if (!isDuplicate) {
      sidecar.markReceiptProcessed({
        transportMessageId:
          parsed.transportMessageId ??
          buildTransportMessageId(account.id, localMessageId, this.now()),
        checksum: fingerprint,
        processedAt: this.now(),
      });
    }

    return {
      status: isDuplicate ? "duplicate_skipped" : "processed",
      duplicate: isDuplicate,
      accountId: account.id,
      mailbox: request.mailbox,
      uid: request.uid ?? null,
      threadId: normalizeOptionalText(request.threadId),
      transportMessageId: parsed.transportMessageId,
      localMessageId,
      fingerprint,
      headersHash: parsed.headersHash,
      deliveryState,
      remoteUserId: sessionContext.remoteUserId,
      localSessionId: sessionContext.localSessionId,
      threadMessageId: sessionContext.threadMessageId,
      parsed,
    };
  }

  async parseTransportMessage(
    source: Buffer | string,
    options: {
      receivedAt?: Date | string | number;
      includeAttachmentContent?: boolean;
    } = {}
  ): Promise<ParsedTransportMessage> {
    const rawBuffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
    const parsed = await simpleParser(rawBuffer);
    const headerLines = parsed.headerLines.map((entry) => entry.line);

    return {
      transportMessageId:
        normalizeOptionalText(parsed.messageId) !== null
          ? normalizeMessageId(parsed.messageId as string)
          : null,
      inReplyTo:
        normalizeOptionalText(parsed.inReplyTo) !== null
          ? normalizeMessageId(parsed.inReplyTo as string)
          : null,
      references: normalizeReferences(parsed.references, parsed.inReplyTo),
      subject: normalizeOptionalText(parsed.subject),
      text: normalizeText(parsed.text ?? ""),
      html: typeof parsed.html === "string" ? parsed.html : null,
      headersHash: buildHeadersHash(headerLines),
      headerLines,
      from: flattenAddresses(parsed.from),
      to: flattenAddresses(parsed.to),
      cc: flattenAddresses(parsed.cc),
      bcc: flattenAddresses(parsed.bcc),
      replyTo: flattenAddresses(parsed.replyTo),
      attachments: parsed.attachments.map((attachment) =>
        normalizeParsedAttachment(attachment, options.includeAttachmentContent === true)
      ),
      receivedAt: toTimestamp(options.receivedAt, this.now()),
      rawSize: rawBuffer.length,
    };
  }

  computeReceiptFingerprint(parsedMessage: ParsedTransportMessage): string {
    return hashString(
      JSON.stringify({
        transportMessageId: parsedMessage.transportMessageId ?? "",
        inReplyTo: parsedMessage.inReplyTo ?? "",
        references: parsedMessage.references,
        subject: parsedMessage.subject ?? "",
        headersHash: parsedMessage.headersHash,
        textHash: hashString(parsedMessage.text),
        attachments: parsedMessage.attachments.map((attachment) => ({
          filename: attachment.filename ?? "",
          checksum: attachment.checksum ?? "",
          size: attachment.size,
          contentType: attachment.contentType ?? "",
        })),
      })
    );
  }

  private resolveAccount(
    accountConfig: MailTransportAccountConfig
  ): ResolvedMailTransportAccountConfig {
    return applyMailTransportAccountDefaults(accountConfig);
  }

  private validateAccountEnabled(account: ResolvedMailTransportAccountConfig): void {
    if (account.enabled !== true) {
      throw new MailTransportError(
        "config_error",
        `Mail transport account is disabled: ${account.id}`
      );
    }
  }

  private validateSmtpAccount(account: ResolvedMailTransportAccountConfig): void {
    this.validateAccountEnabled(account);
    if (normalizeOptionalText(account.smtp.host) === null) {
      throw new MailTransportError("config_error", `SMTP host missing for account: ${account.id}`);
    }
    if (normalizeOptionalText(account.auth.user) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail auth user missing for account: ${account.id}`
      );
    }
    if (account.authType === "password" && normalizeOptionalText(account.auth.password) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail password missing for account: ${account.id}`
      );
    }
    if (account.authType === "oauth2" && normalizeOptionalText(account.auth.accessToken) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail access token missing for account: ${account.id}`
      );
    }
  }

  private validateImapAccount(account: ResolvedMailTransportAccountConfig): void {
    this.validateAccountEnabled(account);
    if (normalizeOptionalText(account.imap.host) === null) {
      throw new MailTransportError("config_error", `IMAP host missing for account: ${account.id}`);
    }
    if (normalizeOptionalText(account.auth.user) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail auth user missing for account: ${account.id}`
      );
    }
    if (account.authType === "password" && normalizeOptionalText(account.auth.password) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail password missing for account: ${account.id}`
      );
    }
    if (account.authType === "oauth2" && normalizeOptionalText(account.auth.accessToken) === null) {
      throw new MailTransportError(
        "config_error",
        `Mail access token missing for account: ${account.id}`
      );
    }
  }

  private buildSendMailOptions(
    account: ResolvedMailTransportAccountConfig,
    message: SendMailRequest,
    transportMessageId: string
  ): SendMailOptions {
    return {
      from: account.email,
      to: message.to,
      ...(message.cc !== undefined ? { cc: message.cc } : {}),
      ...(message.bcc !== undefined ? { bcc: message.bcc } : {}),
      ...(normalizeOptionalText(message.replyTo) !== null
        ? { replyTo: message.replyTo ?? undefined }
        : {}),
      subject: message.subject,
      ...(typeof message.text === "string" ? { text: message.text } : {}),
      ...(typeof message.html === "string" ? { html: message.html } : {}),
      ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
      ...(normalizeOptionalText(message.inReplyTo) !== null
        ? { inReplyTo: message.inReplyTo ?? undefined }
        : {}),
      ...(message.references != null ? { references: message.references } : {}),
      ...(message.headers !== undefined ? { headers: message.headers } : {}),
      messageId: transportMessageId,
    };
  }

  private collectAddressList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => String(entry)).filter((entry) => entry.trim() !== "");
  }

  private resolveSessionContext(
    account: ResolvedMailTransportAccountConfig,
    sidecar: MailSidecarStoreManager,
    parsed: ParsedTransportMessage,
    request: ProcessIncomingMessageRequest
  ): {
    remoteUserId: string | null;
    localSessionId: string | null;
    threadMessageId: string | null;
    matchedMapping: MailSessionMapRecord | null;
  } {
    const sessionIdHeader =
      parseHeaderValue(parsed.headerLines, "X-Hayalet-Ev-Session-Id") ??
      parseHeaderValue(parsed.headerLines, "X-Hayalet-Ev-Local-Session-Id");
    const remoteUserId =
      normalizeOptionalText(request.remoteUserId) ??
      account.binding.remoteUserId ??
      parsed.from.find((entry) => entry.address !== null)?.address ??
      null;

    const references = [
      ...parsed.references,
      ...(parsed.transportMessageId !== null ? [parsed.transportMessageId] : []),
    ];

    let matchedMapping: MailSessionMapRecord | null = null;
    if (remoteUserId !== null) {
      for (const reference of references) {
        matchedMapping = sidecar.findSessionMappingByReference(remoteUserId, reference);
        if (matchedMapping !== null) {
          break;
        }
      }
    }

    const localSessionId =
      normalizeOptionalText(request.localSessionId) ??
      sessionIdHeader ??
      matchedMapping?.localSessionId ??
      account.binding.defaultLocalSessionId ??
      null;
    const threadMessageId =
      normalizeOptionalText(request.threadMessageId) ??
      matchedMapping?.threadMessageId ??
      parsed.references[0] ??
      parsed.inReplyTo ??
      parsed.transportMessageId ??
      null;

    return {
      remoteUserId,
      localSessionId,
      threadMessageId,
      matchedMapping,
    };
  }

  private async withRetry<T>(operation: string, run: () => Promise<T>): Promise<T> {
    const totalAttempts = Math.max(1, this.maxRetries + 1);
    let lastError: MailTransportError | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- NOTE: retry loop is sequential by design.
        return await run();
      } catch (error) {
        const classified = classifyTransportError(error);
        lastError = classified;
        if (classified.retriable !== true || attempt >= totalAttempts) {
          if (attempt >= totalAttempts && classified.retriable === true) {
            throw new MailTransportError("retry_exhausted", `${operation} failed after retries`, {
              cause: classified,
              retriable: false,
              details: { attempts: totalAttempts, lastKind: classified.kind },
            });
          }
          throw classified;
        }

        // eslint-disable-next-line no-await-in-loop -- NOTE: backoff must remain sequential.
        await this.wait(this.retryBaseMs * attempt);
      }
    }

    throw (
      lastError ??
      new MailTransportError("transport_error", `${operation} failed`, {
        retriable: false,
      })
    );
  }
}
