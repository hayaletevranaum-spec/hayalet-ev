export { MailTransportService, MailTransportError } from "./service.js";
export {
  applyMailTransportAccountDefaults,
  resolveMailTransportAccount,
  resolveMailTransportSettings,
} from "./config.js";
export type {
  ResolvedMailTransportAccountConfig,
  ResolvedMailTransportSettings,
} from "./config.js";
export type {
  FetchInboxRequest,
  FetchInboxResult,
  MailTransportErrorKind,
  MailTransportImapClient,
  MailTransportMessageAddress,
  MailTransportParsedAttachment,
  MailTransportSendAttachment,
  MailTransportServiceOptions,
  MailTransportSmtpTransporter,
  ParsedTransportMessage,
  ProbeMailAccountResult,
  ProcessIncomingMessageRequest,
  ProcessIncomingMessageResult,
  SendMailRequest,
  SendMailResult,
} from "./types.js";
