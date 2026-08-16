import type { FetchMessageObject, MessageEnvelopeObject } from "imapflow";
import type { Attachment, ParsedMail } from "mailparser";
import type { SendMailOptions } from "nodemailer";

import type { MailTransportAccountConfig } from "@shared/settings.js";
import type { ResolvedMailTransportAccountConfig } from "./config.js";

export type MailTransportErrorKind =
  | "auth_error"
  | "config_error"
  | "duplicate_skip"
  | "parse_error"
  | "retry_exhausted"
  | "transport_error";

export interface MailTransportMessageAddress {
  name: string | null;
  address: string | null;
}

export interface MailTransportParsedAttachment {
  filename: string | null;
  contentType: string | null;
  contentDisposition: string | null;
  checksum: string | null;
  size: number;
  contentId: string | null;
  inline: boolean;
  content?: Buffer;
}

export interface ParsedTransportMessage {
  transportMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string | null;
  text: string;
  html: string | null;
  headersHash: string;
  headerLines: string[];
  from: MailTransportMessageAddress[];
  to: MailTransportMessageAddress[];
  cc: MailTransportMessageAddress[];
  bcc: MailTransportMessageAddress[];
  replyTo: MailTransportMessageAddress[];
  attachments: MailTransportParsedAttachment[];
  receivedAt: number;
  rawSize: number;
}

export interface MailTransportSendAttachment {
  filename?: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
  cid?: string;
  contentDisposition?: "attachment" | "inline";
}

export interface SendMailRequest {
  localMessageId: string;
  remoteUserId?: string | null;
  localSessionId?: string | null;
  threadMessageId?: string | null;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailTransportSendAttachment[];
  inReplyTo?: string | null;
  references?: string | string[] | null;
  headers?: Record<string, string>;
  messageId?: string | null;
  replyTo?: string | null;
}

export interface SendMailResult {
  accountId: string;
  localMessageId: string;
  transportMessageId: string;
  deliveryState: string;
  headersHash: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response: string | null;
  remoteUserId: string | null;
  localSessionId: string | null;
  threadMessageId: string | null;
}

export interface ProcessIncomingMessageRequest {
  mailbox: string;
  uid?: number | null;
  source: Buffer | string;
  internalDate?: Date | string | null;
  envelope?: MessageEnvelopeObject;
  flags?: Set<string>;
  threadId?: string | null;
  remoteUserId?: string | null;
  localSessionId?: string | null;
  localMessageId?: string | null;
  threadMessageId?: string | null;
  includeAttachmentContent?: boolean;
}

export interface ProcessIncomingMessageResult {
  status: "processed" | "duplicate_skipped";
  duplicate: boolean;
  accountId: string;
  mailbox: string;
  uid: number | null;
  threadId: string | null;
  transportMessageId: string | null;
  localMessageId: string;
  fingerprint: string;
  headersHash: string;
  deliveryState: string;
  remoteUserId: string | null;
  localSessionId: string | null;
  threadMessageId: string | null;
  parsed: ParsedTransportMessage;
}

export interface FetchInboxRequest {
  mailbox?: string;
  limit?: number;
  cursor?: string | null;
  remoteUserId?: string | null;
  localSessionId?: string | null;
  includeAttachmentContent?: boolean;
}

export interface FetchInboxResult {
  accountId: string;
  mailbox: string;
  cursor: string | null;
  fetchedCount: number;
  processedCount: number;
  duplicateCount: number;
  messages: ProcessIncomingMessageResult[];
}

export interface ProbeMailAccountResult {
  accountId: string;
  connectionState: "connected";
  smtpVerified: boolean;
  imapVerified: boolean;
}

export interface MailTransportImapClient {
  connect(): Promise<void>;
  getMailboxLock(
    path: string,
    options?: {
      readOnly?: boolean;
      description?: string;
    }
  ): Promise<{
    path: string;
    release(): void;
  }>;
  fetch(
    range: unknown,
    query: Record<string, unknown>,
    options?: {
      uid?: boolean;
    }
  ): AsyncIterable<FetchMessageObject>;
  logout(): Promise<void>;
  close(): void;
}

export interface MailTransportSmtpTransporter {
  sendMail(message: SendMailOptions): Promise<Record<string, unknown>>;
  verify?(): Promise<unknown>;
  close?(): void;
}

export interface MailTransportServiceOptions {
  retryBaseMs?: number;
  maxRetries?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  createImapClient?: (account: ResolvedMailTransportAccountConfig) => MailTransportImapClient;
  createSmtpTransporter?: (
    account: ResolvedMailTransportAccountConfig
  ) => MailTransportSmtpTransporter;
}

export interface MailTransportRuntimeConfig {
  account: MailTransportAccountConfig | ResolvedMailTransportAccountConfig;
  parsed?: ParsedMail;
  attachment?: Attachment;
}
