import { RoomProtocolRegistry } from "./rooms/room-protocol-registry.js";
import { AppI18n } from "./i18n/index.js";

type ProtocolMap = Record<string, string>;

type ResolveProtocolMessageResult = {
  message: string;
  body: string;
  bodyLoaded: boolean;
  error?: Error;
};

type ComposeProtocolMessageOptions = {
  preface?: string | null;
};

export const PROTOCOL_HEADER_TAG = "[PROTOCOL]";

export function buildProtocolHeader(fallbackTitle: string): string {
  const title = fallbackTitle.trim();
  if (title === "") {
    return PROTOCOL_HEADER_TAG;
  }
  if (title.startsWith("[")) {
    return `${PROTOCOL_HEADER_TAG}${title}`;
  }
  return `${PROTOCOL_HEADER_TAG} ${title}`;
}

function normalizeProtocolPreface(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function composeProtocolMessage(
  fallbackTitle: string,
  protocolBody: string | null,
  options: ComposeProtocolMessageOptions = {}
): string {
  const header = buildProtocolHeader(fallbackTitle);
  const preface = normalizeProtocolPreface(options.preface);
  const body = (protocolBody ?? "").trim();
  if (preface === "" && body === "") {
    return header;
  }
  return [header, preface, body].filter((part) => part.trim() !== "").join("\n\n");
}

async function loadProtocolMap(): Promise<{ protocols: ProtocolMap | null; error?: Error }> {
  const loadProtocols = window.electronAPI?.["loadProtocols"] as
    (() => Promise<{ success: boolean; protocols?: Record<string, string> }>) | undefined;
  if (loadProtocols === undefined) {
    return {
      protocols: await RoomProtocolRegistry.mergeProtocolMap({}, { locale: AppI18n.getLocale() }),
    };
  }

  try {
    const result = await loadProtocols();
    if (result.success === true && result.protocols !== undefined) {
      return {
        protocols: await RoomProtocolRegistry.mergeProtocolMap(result.protocols, {
          locale: AppI18n.getLocale(),
        }),
      };
    }
    return {
      protocols: await RoomProtocolRegistry.mergeProtocolMap(
        {},
        {
          locale: AppI18n.getLocale(),
        }
      ),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      protocols: await RoomProtocolRegistry.mergeProtocolMap(
        {},
        {
          locale: AppI18n.getLocale(),
        }
      ),
      error: err,
    };
  }
}

export async function resolveComposedProtocolMessage({
  fallbackTitle,
  protocolKey,
  preface,
}: {
  fallbackTitle: string;
  protocolKey?: string;
  preface?: string | null;
}): Promise<ResolveProtocolMessageResult> {
  const { protocols, error } = await loadProtocolMap();
  const normalizedKey = protocolKey?.trim() ?? "";
  const body = normalizedKey === "" ? "" : (protocols?.[normalizedKey] ?? "");
  const message =
    preface === undefined
      ? composeProtocolMessage(fallbackTitle, body)
      : composeProtocolMessage(fallbackTitle, body, { preface });

  return {
    message,
    body,
    bodyLoaded: normalizedKey !== "" && body.trim() !== "",
    ...(error !== undefined ? { error } : {}),
  };
}
