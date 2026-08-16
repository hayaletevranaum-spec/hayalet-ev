import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AppSettings } from "@shared/settings.js";
import type { Us1RelayLocalIdentityMetadata, Us1RelayStoredIdentity } from "@shared/us1-relay.js";

import { Paths } from "../paths.ts";

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function toFingerprint(base64Key: string): string {
  return createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex");
}

function generateDeviceId(): string {
  return `relay_${randomBytes(12).toString("hex")}`;
}

function exportPublicKeyBase64(key: KeyObject): string {
  return toBase64(Buffer.from(key.export({ type: "spki", format: "der" })));
}

function exportPrivateKeyPem(key: KeyObject): string {
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}

function buildMetadata(identity: Us1RelayStoredIdentity): Us1RelayLocalIdentityMetadata {
  return {
    deviceId: identity.deviceId,
    protocolVersion: identity.protocolVersion,
    encryptionPublicKey: identity.encryptionPublicKey,
    encryptionKeyFingerprint: identity.encryptionKeyFingerprint,
    signingPublicKey: identity.signingPublicKey,
    signingKeyFingerprint: identity.signingKeyFingerprint,
    createdAt: identity.createdAt,
  };
}

export class Us1RelayIdentityService {
  private cache: Us1RelayStoredIdentity | null = null;

  private getRelayDir(): string {
    return join(Paths.getDataDir(), "us1-relay");
  }

  private getIdentityPath(): string {
    return join(this.getRelayDir(), "identity.json");
  }

  private createIdentity(): Us1RelayStoredIdentity {
    const encryptionKeys = generateKeyPairSync("x25519");
    const signingKeys = generateKeyPairSync("ed25519");
    const encryptionPublicKey = exportPublicKeyBase64(encryptionKeys.publicKey);
    const signingPublicKey = exportPublicKeyBase64(signingKeys.publicKey);
    const now = Date.now();

    return {
      deviceId: generateDeviceId(),
      protocolVersion: 1,
      encryptionPublicKey,
      encryptionKeyFingerprint: toFingerprint(encryptionPublicKey),
      signingPublicKey,
      signingKeyFingerprint: toFingerprint(signingPublicKey),
      createdAt: now,
      encryptionPrivateKeyPem: exportPrivateKeyPem(encryptionKeys.privateKey),
      signingPrivateKeyPem: exportPrivateKeyPem(signingKeys.privateKey),
    };
  }

  private persistIdentity(identity: Us1RelayStoredIdentity): void {
    mkdirSync(this.getRelayDir(), { recursive: true });
    writeFileSync(this.getIdentityPath(), JSON.stringify(identity, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  ensureIdentity(): Us1RelayStoredIdentity {
    if (this.cache !== null) {
      return this.cache;
    }

    if (existsSync(this.getIdentityPath())) {
      const parsed = JSON.parse(
        readFileSync(this.getIdentityPath(), "utf8")
      ) as Us1RelayStoredIdentity;
      this.cache = parsed;
      return parsed;
    }

    const identity = this.createIdentity();
    this.persistIdentity(identity);
    this.cache = identity;
    return identity;
  }

  getLocalMetadata(): Us1RelayLocalIdentityMetadata {
    return buildMetadata(this.ensureIdentity());
  }

  getEncryptionPrivateKey(): KeyObject {
    return createPrivateKey(this.ensureIdentity().encryptionPrivateKeyPem);
  }

  getSigningPrivateKey(): KeyObject {
    return createPrivateKey(this.ensureIdentity().signingPrivateKeyPem);
  }

  syncSettingsMetadata(settings: AppSettings): boolean {
    const metadata = this.getLocalMetadata();
    settings.integrations ??= {};
    const current = settings.integrations.us1Relay ?? {};
    const next = {
      ...current,
      protocolVersion: metadata.protocolVersion,
      encryptionPublicKey: metadata.encryptionPublicKey,
      encryptionKeyFingerprint: metadata.encryptionKeyFingerprint,
      signingPublicKey: metadata.signingPublicKey,
      signingKeyFingerprint: metadata.signingKeyFingerprint,
      connectionState: current.connectionState ?? "disconnected",
      enabled: current.enabled === true,
      baseUrl: current.baseUrl ?? null,
      trustedServerFingerprint: current.trustedServerFingerprint ?? null,
      lastError: current.lastError ?? null,
      lastConnectedAt: current.lastConnectedAt ?? null,
    };
    const changed = JSON.stringify(current) !== JSON.stringify(next);
    settings.integrations.us1Relay = next;
    return changed;
  }
}

export const us1RelayIdentityService = new Us1RelayIdentityService();
