import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  Us1RelayAckRequest,
  Us1RelayAckResponse,
  Us1RelayAttachmentDownloadRequest,
  Us1RelayAttachmentDownloadResponse,
  Us1RelayAttachmentUploadRequest,
  Us1RelayAttachmentUploadResponse,
  Us1RelayPollRequest,
  Us1RelayPollResponse,
  Us1RelayPublishRequest,
  Us1RelayPublishResponse,
  Us1RelayQueuedEnvelope,
  Us1RelayStoredAttachmentChunk,
} from "@shared/us1-relay.js";

import { verifyRelayPayloadSignature } from "../us1-relay/crypto.ts";
import { Paths } from "../paths.ts";

interface StoredEnvelopeRecord extends Us1RelayQueuedEnvelope {
  recipientSigningKeyFingerprint: string;
  senderSigningKeyFingerprint: string;
}

interface StoredAttachmentChunkRecord extends Us1RelayStoredAttachmentChunk {
  recipientSigningKeyFingerprint: string;
  senderSigningKeyFingerprint: string;
}

const DEFAULT_ORPHANED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function toBufferChunk(chunk: unknown, context: string): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }

  throw new TypeError(`${context} received an unsupported chunk type.`);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(toBufferChunk(chunk, "US1 relay request")));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function fingerprintFromPublicKey(base64Key: string): string {
  return createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex");
}

function verifySignedRequest(
  payload: Record<string, unknown>,
  signature: string,
  publicKey: string
): boolean {
  const { signature: _ignored, ...unsignedPayload } = payload;
  return verifyRelayPayloadSignature({
    payload: unsignedPayload,
    signature,
    signingPublicKeyBase64: publicKey,
  });
}

export class Us1RelayServer {
  private readonly rootDir: string;
  private readonly now: () => number;
  private readonly orphanedAttachmentTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private lastCleanupAt = 0;

  constructor(
    rootDir = join(Paths.getDataDir(), "us1-relay-server"),
    options: {
      now?: () => number;
      orphanedAttachmentTtlMs?: number;
      cleanupIntervalMs?: number;
    } = {}
  ) {
    this.rootDir = rootDir;
    this.now = options.now ?? ((): number => Date.now());
    this.orphanedAttachmentTtlMs =
      typeof options.orphanedAttachmentTtlMs === "number" &&
      Number.isFinite(options.orphanedAttachmentTtlMs) &&
      options.orphanedAttachmentTtlMs >= 0
        ? Math.trunc(options.orphanedAttachmentTtlMs)
        : DEFAULT_ORPHANED_ATTACHMENT_TTL_MS;
    this.cleanupIntervalMs =
      typeof options.cleanupIntervalMs === "number" &&
      Number.isFinite(options.cleanupIntervalMs) &&
      options.cleanupIntervalMs >= 0
        ? Math.trunc(options.cleanupIntervalMs)
        : DEFAULT_CLEANUP_INTERVAL_MS;
  }

  private getQueueDir(recipientKeyFingerprint: string): string {
    return join(this.rootDir, "queues", recipientKeyFingerprint);
  }

  private ensureQueueDir(recipientKeyFingerprint: string): string {
    const queueDir = this.getQueueDir(recipientKeyFingerprint);
    mkdirSync(queueDir, { recursive: true });
    return queueDir;
  }

  private getAttachmentDir(recipientKeyFingerprint: string, attachmentId: string): string {
    return join(this.rootDir, "attachments", recipientKeyFingerprint, attachmentId);
  }

  private ensureAttachmentDir(recipientKeyFingerprint: string, attachmentId: string): string {
    const attachmentDir = this.getAttachmentDir(recipientKeyFingerprint, attachmentId);
    mkdirSync(attachmentDir, { recursive: true });
    return attachmentDir;
  }

  private listQueuedMessages(recipientKeyFingerprint: string): StoredEnvelopeRecord[] {
    const queueDir = this.getQueueDir(recipientKeyFingerprint);
    if (existsSync(queueDir) !== true) {
      return [];
    }

    return readdirSync(queueDir)
      .filter((entry) => entry.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right))
      .map((entry) => {
        const filePath = join(queueDir, entry);
        return JSON.parse(readFileSync(filePath, "utf8")) as StoredEnvelopeRecord;
      });
  }

  private storeEnvelope(payload: Us1RelayPublishRequest): StoredEnvelopeRecord {
    const queueDir = this.ensureQueueDir(payload.recipientSigningKeyFingerprint);
    const queuedAt = this.now();
    const id = `${queuedAt}_${payload.envelope.messageId}`;
    const record: StoredEnvelopeRecord = {
      id,
      cursor: id,
      queuedAt,
      recipientSigningKeyFingerprint: payload.recipientSigningKeyFingerprint,
      senderSigningKeyFingerprint: payload.senderSigningKeyFingerprint,
      envelope: payload.envelope,
    };

    writeFileSync(join(queueDir, `${id}.json`), JSON.stringify(record, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return record;
  }

  private listAttachmentChunks(
    recipientKeyFingerprint: string,
    attachmentId: string
  ): StoredAttachmentChunkRecord[] {
    const attachmentDir = this.getAttachmentDir(recipientKeyFingerprint, attachmentId);
    if (existsSync(attachmentDir) !== true) {
      return [];
    }

    return readdirSync(attachmentDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => {
        const filePath = join(attachmentDir, entry);
        return JSON.parse(readFileSync(filePath, "utf8")) as StoredAttachmentChunkRecord;
      })
      .sort((left, right) => left.chunkIndex - right.chunkIndex);
  }

  private storeAttachmentChunk(
    payload: Us1RelayAttachmentUploadRequest
  ): StoredAttachmentChunkRecord {
    const attachmentDir = this.ensureAttachmentDir(
      payload.recipientSigningKeyFingerprint,
      payload.attachmentId
    );
    const queuedAt = this.now();
    const id = `${payload.attachmentId}:${String(payload.chunkIndex).padStart(6, "0")}`;
    const record: StoredAttachmentChunkRecord = {
      id,
      attachmentId: payload.attachmentId,
      chunkIndex: payload.chunkIndex,
      chunkCount: payload.chunkCount,
      queuedAt,
      recipientSigningKeyFingerprint: payload.recipientSigningKeyFingerprint,
      senderSigningKeyFingerprint: payload.senderSigningKeyFingerprint,
      envelope: payload.envelope,
    };

    writeFileSync(
      join(attachmentDir, `${String(payload.chunkIndex).padStart(6, "0")}.json`),
      JSON.stringify(record, null, 2),
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
    return record;
  }

  private deleteAttachment(recipientKeyFingerprint: string, attachmentId: string): boolean {
    if (attachmentId.trim() === "") {
      return false;
    }
    const attachmentDir = this.getAttachmentDir(recipientKeyFingerprint, attachmentId.trim());
    if (existsSync(attachmentDir) !== true) {
      return false;
    }
    rmSync(attachmentDir, { recursive: true, force: true });
    return true;
  }

  private cleanupOrphanedAttachments(now: number): void {
    const attachmentsRoot = join(this.rootDir, "attachments");
    if (existsSync(attachmentsRoot) !== true) {
      return;
    }

    readdirSync(attachmentsRoot, { withFileTypes: true }).forEach((recipientDirent) => {
      if (recipientDirent.isDirectory() !== true) {
        return;
      }

      const recipientDir = join(attachmentsRoot, recipientDirent.name);
      readdirSync(recipientDir, { withFileTypes: true }).forEach((attachmentDirent) => {
        if (attachmentDirent.isDirectory() !== true) {
          return;
        }

        const attachmentDir = join(recipientDir, attachmentDirent.name);
        const chunkFiles = readdirSync(attachmentDir)
          .filter((entry) => entry.endsWith(".json"))
          .map((entry) => join(attachmentDir, entry));
        if (chunkFiles.length === 0) {
          rmSync(attachmentDir, { recursive: true, force: true });
          return;
        }

        let newestQueuedAt = 0;
        for (const chunkFile of chunkFiles) {
          const record = JSON.parse(readFileSync(chunkFile, "utf8")) as StoredAttachmentChunkRecord;
          newestQueuedAt = Math.max(newestQueuedAt, record.queuedAt);
        }

        if (now - newestQueuedAt >= this.orphanedAttachmentTtlMs) {
          rmSync(attachmentDir, { recursive: true, force: true });
        }
      });

      if (readdirSync(recipientDir).length === 0) {
        rmSync(recipientDir, { recursive: true, force: true });
      }
    });
  }

  private runMaintenanceSweep(force = false): void {
    const now = this.now();
    if (force !== true && now - this.lastCleanupAt < this.cleanupIntervalMs) {
      return;
    }

    this.lastCleanupAt = now;
    this.cleanupOrphanedAttachments(now);
  }

  private handlePublish(payload: Us1RelayPublishRequest, res: ServerResponse): void {
    const senderFingerprint = fingerprintFromPublicKey(payload.senderSigningPublicKey);
    if (senderFingerprint !== payload.senderSigningKeyFingerprint) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay sender fingerprint mismatch.",
      } satisfies Us1RelayPublishResponse);
      return;
    }

    if (
      verifySignedRequest(
        payload as unknown as Record<string, unknown>,
        payload.signature,
        payload.senderSigningPublicKey
      ) !== true
    ) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay sender signature is invalid.",
      } satisfies Us1RelayPublishResponse);
      return;
    }

    const stored = this.storeEnvelope(payload);
    sendJson(res, 200, {
      success: true,
      messageId: stored.id,
      queuedAt: stored.queuedAt,
    } satisfies Us1RelayPublishResponse);
  }

  private handlePoll(payload: Us1RelayPollRequest, res: ServerResponse): void {
    const recipientFingerprint = fingerprintFromPublicKey(payload.recipientSigningPublicKey);
    if (recipientFingerprint !== payload.recipientSigningKeyFingerprint) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay recipient fingerprint mismatch.",
      } satisfies Us1RelayPollResponse);
      return;
    }

    if (
      verifySignedRequest(
        payload as unknown as Record<string, unknown>,
        payload.signature,
        payload.recipientSigningPublicKey
      ) !== true
    ) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay poll signature is invalid.",
      } satisfies Us1RelayPollResponse);
      return;
    }

    const queuedMessages = this.listQueuedMessages(payload.recipientSigningKeyFingerprint);
    const trimmedCursor = typeof payload.cursor === "string" ? payload.cursor.trim() : "";
    const startIndex =
      trimmedCursor !== ""
        ? queuedMessages.findIndex((message) => message.cursor === trimmedCursor) + 1
        : 0;
    const safeStartIndex = startIndex >= 0 ? startIndex : 0;
    const limit =
      typeof payload.limit === "number" && Number.isFinite(payload.limit) && payload.limit >= 1
        ? Math.min(Math.trunc(payload.limit), 50)
        : 20;
    const messages = queuedMessages.slice(safeStartIndex, safeStartIndex + limit);

    sendJson(res, 200, {
      success: true,
      cursor: messages[messages.length - 1]?.cursor ?? payload.cursor ?? null,
      messages,
    } satisfies Us1RelayPollResponse);
  }

  private handleUploadAttachment(
    payload: Us1RelayAttachmentUploadRequest,
    res: ServerResponse
  ): void {
    const senderFingerprint = fingerprintFromPublicKey(payload.senderSigningPublicKey);
    if (senderFingerprint !== payload.senderSigningKeyFingerprint) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay sender fingerprint mismatch.",
      } satisfies Us1RelayAttachmentUploadResponse);
      return;
    }

    if (
      verifySignedRequest(
        payload as unknown as Record<string, unknown>,
        payload.signature,
        payload.senderSigningPublicKey
      ) !== true
    ) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay attachment upload signature is invalid.",
      } satisfies Us1RelayAttachmentUploadResponse);
      return;
    }

    if (
      typeof payload.attachmentId !== "string" ||
      payload.attachmentId.trim() === "" ||
      !Number.isInteger(payload.chunkIndex) ||
      payload.chunkIndex < 0 ||
      !Number.isInteger(payload.chunkCount) ||
      payload.chunkCount < 1 ||
      payload.chunkIndex >= payload.chunkCount
    ) {
      sendJson(res, 400, {
        success: false,
        error: "US1 relay attachment upload payload is invalid.",
      } satisfies Us1RelayAttachmentUploadResponse);
      return;
    }

    const stored = this.storeAttachmentChunk(payload);
    sendJson(res, 200, {
      success: true,
      attachmentId: stored.attachmentId,
      chunkIndex: stored.chunkIndex,
      queuedAt: stored.queuedAt,
    } satisfies Us1RelayAttachmentUploadResponse);
  }

  private handleDownloadAttachment(
    payload: Us1RelayAttachmentDownloadRequest,
    res: ServerResponse
  ): void {
    const recipientFingerprint = fingerprintFromPublicKey(payload.recipientSigningPublicKey);
    if (recipientFingerprint !== payload.recipientSigningKeyFingerprint) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay recipient fingerprint mismatch.",
      } satisfies Us1RelayAttachmentDownloadResponse);
      return;
    }

    if (
      verifySignedRequest(
        payload as unknown as Record<string, unknown>,
        payload.signature,
        payload.recipientSigningPublicKey
      ) !== true
    ) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay attachment download signature is invalid.",
      } satisfies Us1RelayAttachmentDownloadResponse);
      return;
    }

    if (typeof payload.attachmentId !== "string" || payload.attachmentId.trim() === "") {
      sendJson(res, 400, {
        success: false,
        error: "US1 relay attachment id is required.",
      } satisfies Us1RelayAttachmentDownloadResponse);
      return;
    }

    sendJson(res, 200, {
      success: true,
      attachmentId: payload.attachmentId.trim(),
      chunks: this.listAttachmentChunks(
        payload.recipientSigningKeyFingerprint,
        payload.attachmentId.trim()
      ),
    } satisfies Us1RelayAttachmentDownloadResponse);
  }

  private handleAck(payload: Us1RelayAckRequest, res: ServerResponse): void {
    const recipientFingerprint = fingerprintFromPublicKey(payload.recipientSigningPublicKey);
    if (recipientFingerprint !== payload.recipientSigningKeyFingerprint) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay recipient fingerprint mismatch.",
      } satisfies Us1RelayAckResponse);
      return;
    }

    if (
      verifySignedRequest(
        payload as unknown as Record<string, unknown>,
        payload.signature,
        payload.recipientSigningPublicKey
      ) !== true
    ) {
      sendJson(res, 403, {
        success: false,
        error: "US1 relay ack signature is invalid.",
      } satisfies Us1RelayAckResponse);
      return;
    }

    const queueDir = this.getQueueDir(payload.recipientSigningKeyFingerprint);
    let acknowledgedCount = 0;
    payload.messageIds.forEach((messageId) => {
      if (typeof messageId !== "string" || messageId.trim() === "") {
        return;
      }
      const filePath = join(queueDir, `${messageId.trim()}.json`);
      if (existsSync(filePath) !== true) {
        return;
      }
      rmSync(filePath);
      acknowledgedCount += 1;
    });
    let deletedAttachmentCount = 0;
    (payload.attachmentIds ?? []).forEach((attachmentId) => {
      if (typeof attachmentId !== "string") {
        return;
      }
      if (this.deleteAttachment(payload.recipientSigningKeyFingerprint, attachmentId) === true) {
        deletedAttachmentCount += 1;
      }
    });

    sendJson(res, 200, {
      success: true,
      acknowledgedCount,
      deletedAttachmentCount,
    } satisfies Us1RelayAckResponse);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.runMaintenanceSweep();
    if (req.url === "/v1/health" && req.method === "GET") {
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { success: false, error: "Method not allowed." });
      return;
    }

    try {
      if (req.url === "/v1/publish") {
        this.handlePublish(await readJsonBody<Us1RelayPublishRequest>(req), res);
        return;
      }

      if (req.url === "/v1/attachment/upload") {
        this.handleUploadAttachment(await readJsonBody<Us1RelayAttachmentUploadRequest>(req), res);
        return;
      }

      if (req.url === "/v1/attachment/download") {
        this.handleDownloadAttachment(
          await readJsonBody<Us1RelayAttachmentDownloadRequest>(req),
          res
        );
        return;
      }

      if (req.url === "/v1/poll") {
        this.handlePoll(await readJsonBody<Us1RelayPollRequest>(req), res);
        return;
      }

      if (req.url === "/v1/ack") {
        this.handleAck(await readJsonBody<Us1RelayAckRequest>(req), res);
        return;
      }

      sendJson(res, 404, { success: false, error: "Not found." });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  createListener(): Server {
    mkdirSync(this.rootDir, { recursive: true });
    this.runMaintenanceSweep(true);

    return createServer((req, res) => {
      void this.handleRequest(req, res);
    });
  }
}
