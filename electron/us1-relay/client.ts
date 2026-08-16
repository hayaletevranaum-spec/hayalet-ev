import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity, connect as tlsConnect, type PeerCertificate } from "node:tls";

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
} from "@shared/us1-relay.js";

import { randomToken, signRelayPayload } from "./crypto.ts";
import { us1RelayIdentityService } from "./identity-service.ts";

const TLS_TRUST_CACHE_TTL_MS = 5 * 60 * 1000;
const RELAY_REQUEST_TIMEOUT_MS = 10_000;

type RelayTransportProtocol = "http" | "https";

interface RelayTlsTrustMaterial {
  certificatePem: string;
  serverFingerprint: string;
  cachedAt: number;
}

export interface Us1RelayRequestOptions {
  pinnedServerFingerprint?: string | null;
}

export interface Us1RelayResponseMeta {
  serverFingerprint: string | null;
  transportProtocol: RelayTransportProtocol;
}

export class RelayTlsPinError extends Error {
  expectedFingerprint: string | null;
  observedFingerprint: string | null;

  constructor(expectedFingerprint: string | null, observedFingerprint: string | null) {
    super(
      `US1 relay TLS fingerprint mismatch. Expected ${expectedFingerprint ?? "none"}, got ${
        observedFingerprint ?? "unknown"
      }.`
    );
    this.name = "RelayTlsPinError";
    this.expectedFingerprint = expectedFingerprint;
    this.observedFingerprint = observedFingerprint;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/g, "");
  if (trimmed === "") {
    throw new Error("US1 relay base URL is not configured.");
  }
  return trimmed;
}

export function normalizeRelayServerFingerprint(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^a-f0-9]/gi, "").toLowerCase();
  return normalized !== "" ? normalized : null;
}

type RelayJsonPayload<TResponse> = TResponse & { error?: string };

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

function fingerprintFromCertificate(rawCertificate: Buffer): string {
  return createHash("sha256").update(rawCertificate).digest("hex");
}

function certificateDerToPem(rawCertificate: Buffer): string {
  const base64 = rawCertificate.toString("base64");
  const wrapped = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

function normalizePeerCertificate(certificate: PeerCertificate): {
  rawCertificate: Buffer;
  fingerprint: string;
} {
  if (!Buffer.isBuffer(certificate.raw) || certificate.raw.byteLength === 0) {
    throw new Error("US1 relay TLS certificate is not available.");
  }

  return {
    rawCertificate: certificate.raw,
    fingerprint:
      normalizeRelayServerFingerprint(certificate.fingerprint256) ??
      fingerprintFromCertificate(certificate.raw),
  };
}

async function performNodeRequest<TResponse>(params: {
  url: URL;
  method: "GET" | "POST";
  body?: unknown;
  caCertificatePem?: string;
}): Promise<TResponse> {
  const bodyText = params.body === undefined ? null : JSON.stringify(params.body);

  return await new Promise<TResponse>((resolve, reject) => {
    const requestOptions = {
      hostname: params.url.hostname,
      port:
        params.url.port !== ""
          ? Number.parseInt(params.url.port, 10)
          : params.url.protocol === "https:"
            ? 443
            : 80,
      path: `${params.url.pathname}${params.url.search}`,
      method: params.method,
      headers: {
        Accept: "application/json",
        ...(bodyText !== null
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(bodyText),
            }
          : {}),
      },
      ...(params.url.protocol === "https:" && params.caCertificatePem !== undefined
        ? { ca: params.caCertificatePem }
        : {}),
    };

    const requestFn = params.url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestFn(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => {
        chunks.push(toBufferChunk(chunk, "US1 relay response"));
      });
      res.on("end", () => {
        try {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const payload: RelayJsonPayload<TResponse> =
            rawBody.trim() !== ""
              ? (JSON.parse(rawBody) as RelayJsonPayload<TResponse>)
              : ({
                  success: res.statusCode !== undefined && res.statusCode < 400,
                } as unknown as RelayJsonPayload<TResponse>);
          const statusCode = res.statusCode ?? 500;
          if (statusCode >= 400) {
            reject(
              new Error(payload.error ?? `US1 relay request failed with status ${statusCode}.`)
            );
            return;
          }
          resolve(payload);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      res.on("error", reject);
    });

    req.setTimeout(RELAY_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("US1 relay request timed out."));
    });
    req.on("error", reject);

    if (bodyText !== null) {
      req.write(bodyText);
    }
    req.end();
  });
}

export class Us1RelayClient {
  private readonly tlsTrustCache = new Map<string, RelayTlsTrustMaterial>();

  private buildSignedRequest<T extends Record<string, unknown>>(
    payload: T
  ): T & { signedAt: number; nonce: string; signature: string } {
    const signedAt = Date.now();
    const nonce = randomToken(12);
    const unsignedPayload = {
      ...payload,
      signedAt,
      nonce,
    };

    return {
      ...unsignedPayload,
      signature: signRelayPayload(unsignedPayload, us1RelayIdentityService.getSigningPrivateKey()),
    };
  }

  private getTlsCacheKey(url: URL): string {
    return `${url.protocol}//${url.host}`;
  }

  private async resolveTlsTrustMaterial(
    url: URL,
    pinnedServerFingerprint: string | null
  ): Promise<RelayTlsTrustMaterial> {
    const cacheKey = this.getTlsCacheKey(url);
    const cached = this.tlsTrustCache.get(cacheKey);
    if (
      cached !== undefined &&
      Date.now() - cached.cachedAt <= TLS_TRUST_CACHE_TTL_MS &&
      (pinnedServerFingerprint === null || cached.serverFingerprint === pinnedServerFingerprint)
    ) {
      return cached;
    }

    const material = await new Promise<RelayTlsTrustMaterial>((resolve, reject) => {
      const socket = tlsConnect({
        host: url.hostname,
        port:
          url.port !== "" ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80,
        servername: url.hostname,
        rejectUnauthorized: false,
      });
      socket.setTimeout(RELAY_REQUEST_TIMEOUT_MS, () => {
        socket.destroy(new Error("US1 relay TLS handshake timed out."));
      });
      socket.once("secureConnect", () => {
        try {
          const certificate = socket.getPeerCertificate(true);
          const hostnameError = checkServerIdentity(url.hostname, certificate);
          if (hostnameError !== undefined) {
            throw hostnameError;
          }

          const normalizedCertificate = normalizePeerCertificate(certificate);
          if (
            pinnedServerFingerprint !== null &&
            normalizedCertificate.fingerprint !== pinnedServerFingerprint
          ) {
            throw new RelayTlsPinError(pinnedServerFingerprint, normalizedCertificate.fingerprint);
          }

          resolve({
            certificatePem: certificateDerToPem(normalizedCertificate.rawCertificate),
            serverFingerprint: normalizedCertificate.fingerprint,
            cachedAt: Date.now(),
          });
          socket.end();
        } catch (error) {
          socket.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      });
      socket.once("error", reject);
    });

    this.tlsTrustCache.set(cacheKey, material);
    return material;
  }

  private async requestJson<TResponse>(
    url: string,
    method: "GET" | "POST",
    body: unknown,
    options: Us1RelayRequestOptions = {}
  ): Promise<TResponse & Us1RelayResponseMeta> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "https:") {
      const pinnedServerFingerprint = normalizeRelayServerFingerprint(
        options.pinnedServerFingerprint
      );
      const cacheKey = this.getTlsCacheKey(parsedUrl);
      const requestOverHttps = async (): Promise<TResponse & Us1RelayResponseMeta> => {
        const tlsTrustMaterial = await this.resolveTlsTrustMaterial(
          parsedUrl,
          pinnedServerFingerprint
        );
        const payload = await performNodeRequest<TResponse>({
          url: parsedUrl,
          method,
          body,
          caCertificatePem: tlsTrustMaterial.certificatePem,
        });
        return {
          ...payload,
          serverFingerprint: tlsTrustMaterial.serverFingerprint,
          transportProtocol: "https",
        };
      };

      try {
        return await requestOverHttps();
      } catch {
        this.tlsTrustCache.delete(cacheKey);
        return await requestOverHttps();
      }
    }

    const payload = await performNodeRequest<TResponse>({
      url: parsedUrl,
      method,
      body,
    });
    return {
      ...payload,
      serverFingerprint: null,
      transportProtocol: "http",
    };
  }

  async health(
    baseUrl: string,
    options: Us1RelayRequestOptions = {}
  ): Promise<{ reachable: boolean } & Us1RelayResponseMeta> {
    const response = await this.requestJson<{ success?: boolean }>(
      `${normalizeBaseUrl(baseUrl)}/v1/health`,
      "GET",
      undefined,
      options
    );
    return {
      reachable: response.success !== false,
      serverFingerprint: response.serverFingerprint,
      transportProtocol: response.transportProtocol,
    };
  }

  async publish(
    baseUrl: string,
    params: Omit<
      Us1RelayPublishRequest,
      "signedAt" | "nonce" | "signature" | "senderSigningPublicKey" | "senderSigningKeyFingerprint"
    >,
    options: Us1RelayRequestOptions = {}
  ): Promise<Us1RelayPublishResponse & Us1RelayResponseMeta> {
    const localIdentity = us1RelayIdentityService.getLocalMetadata();

    return await this.requestJson<Us1RelayPublishResponse>(
      `${normalizeBaseUrl(baseUrl)}/v1/publish`,
      "POST",
      this.buildSignedRequest({
        ...params,
        senderSigningKeyFingerprint: localIdentity.signingKeyFingerprint,
        senderSigningPublicKey: localIdentity.signingPublicKey,
      }),
      options
    );
  }

  async uploadAttachmentChunk(
    baseUrl: string,
    params: Omit<
      Us1RelayAttachmentUploadRequest,
      "signedAt" | "nonce" | "signature" | "senderSigningPublicKey" | "senderSigningKeyFingerprint"
    >,
    options: Us1RelayRequestOptions = {}
  ): Promise<Us1RelayAttachmentUploadResponse & Us1RelayResponseMeta> {
    const localIdentity = us1RelayIdentityService.getLocalMetadata();

    return await this.requestJson<Us1RelayAttachmentUploadResponse>(
      `${normalizeBaseUrl(baseUrl)}/v1/attachment/upload`,
      "POST",
      this.buildSignedRequest({
        ...params,
        senderSigningKeyFingerprint: localIdentity.signingKeyFingerprint,
        senderSigningPublicKey: localIdentity.signingPublicKey,
      }),
      options
    );
  }

  async downloadAttachment(
    baseUrl: string,
    params: Omit<
      Us1RelayAttachmentDownloadRequest,
      | "signedAt"
      | "nonce"
      | "signature"
      | "recipientSigningPublicKey"
      | "recipientSigningKeyFingerprint"
    >,
    options: Us1RelayRequestOptions = {}
  ): Promise<Us1RelayAttachmentDownloadResponse & Us1RelayResponseMeta> {
    const localIdentity = us1RelayIdentityService.getLocalMetadata();

    return await this.requestJson<Us1RelayAttachmentDownloadResponse>(
      `${normalizeBaseUrl(baseUrl)}/v1/attachment/download`,
      "POST",
      this.buildSignedRequest({
        ...params,
        recipientSigningKeyFingerprint: localIdentity.signingKeyFingerprint,
        recipientSigningPublicKey: localIdentity.signingPublicKey,
      }),
      options
    );
  }

  async poll(
    baseUrl: string,
    params: Omit<
      Us1RelayPollRequest,
      | "signedAt"
      | "nonce"
      | "signature"
      | "recipientSigningPublicKey"
      | "recipientSigningKeyFingerprint"
    >,
    options: Us1RelayRequestOptions = {}
  ): Promise<Us1RelayPollResponse & Us1RelayResponseMeta> {
    const localIdentity = us1RelayIdentityService.getLocalMetadata();

    return await this.requestJson<Us1RelayPollResponse>(
      `${normalizeBaseUrl(baseUrl)}/v1/poll`,
      "POST",
      this.buildSignedRequest({
        ...params,
        recipientSigningKeyFingerprint: localIdentity.signingKeyFingerprint,
        recipientSigningPublicKey: localIdentity.signingPublicKey,
      }),
      options
    );
  }

  async acknowledge(
    baseUrl: string,
    params: Omit<
      Us1RelayAckRequest,
      | "signedAt"
      | "nonce"
      | "signature"
      | "recipientSigningPublicKey"
      | "recipientSigningKeyFingerprint"
    >,
    options: Us1RelayRequestOptions = {}
  ): Promise<Us1RelayAckResponse & Us1RelayResponseMeta> {
    const localIdentity = us1RelayIdentityService.getLocalMetadata();

    return await this.requestJson<Us1RelayAckResponse>(
      `${normalizeBaseUrl(baseUrl)}/v1/ack`,
      "POST",
      this.buildSignedRequest({
        ...params,
        recipientSigningKeyFingerprint: localIdentity.signingKeyFingerprint,
        recipientSigningPublicKey: localIdentity.signingPublicKey,
      }),
      options
    );
  }
}

export const us1RelayClient = new Us1RelayClient();
