import { SlotController } from "./slot-controller.js";
import { LogCategory } from "@shared/logging-core";
import { Logger } from "./logger/index.js";
import { START_STOP_PROTOCOL_HEADERS } from "./protocol-default-headers.js";
import { RoomProtocolRegistry } from "./rooms/room-protocol-registry.js";
import { AppState } from "./app-state.js";

function isSlotEligible(slot: string): boolean {
  if (AppState.isAssigned(slot) !== true) {
    return false;
  }

  const state = SlotController.getState(slot);
  if (state === null) {
    return true;
  }

  if (state.urlExcluded === true) {
    Logger.debugT(
      LogCategory.SYSTEM,
      "app.logs.protocolHandler.slotUrlExcluded",
      { slot },
      {
        category: "protocol",
      }
    );
    return false;
  }

  return true;
}

type ProtocolPayload = {
  message: string;
  protocolKey?: string;
  targets: string[];
};

export type ProtocolDescriptor = {
  fallbackTitle: string;
  protocolKey?: string;
};

type ProtocolDescriptorRequest = {
  room?: string;
  scenario?: string;
  context?: { starter?: string };
  protocolKey?: string;
  fallbackTitle?: string;
};

function resolveProtocolDescriptor({
  room = "",
  scenario = "",
  context = {},
  protocolKey = "",
  fallbackTitle = "",
}: ProtocolDescriptorRequest = {}): ProtocolDescriptor | null {
  const normalizedProtocolKey = protocolKey.trim();
  const normalizedFallbackTitle = fallbackTitle.trim();
  if (normalizedProtocolKey !== "" && normalizedFallbackTitle !== "") {
    return {
      fallbackTitle: normalizedFallbackTitle,
      protocolKey: normalizedProtocolKey,
    };
  }

  if (normalizedFallbackTitle !== "") {
    return {
      fallbackTitle: normalizedFallbackTitle,
      ...(normalizedProtocolKey !== "" ? { protocolKey: normalizedProtocolKey } : {}),
    };
  }

  const roomProtocol = RoomProtocolRegistry.resolve(room, scenario);

  if (roomProtocol !== null) {
    return {
      fallbackTitle: roomProtocol.title,
      protocolKey: roomProtocol.key,
    };
  }

  if (room === "analyze") {
    if (scenario === "user-ai-ai") {
      return {
        fallbackTitle: START_STOP_PROTOCOL_HEADERS.ANALYZE_USER_AI_AI_START,
        protocolKey: "analyze-user-AI-AI",
      };
    }
    if (scenario === "user-ai-ai-stop") {
      return {
        fallbackTitle: START_STOP_PROTOCOL_HEADERS.ANALYZE_USER_AI_AI_STOP,
      };
    }

    if (scenario === "ai-ai") {
      const starter = context.starter === "ai2" ? "ai2" : "ai1";
      const protocolKey = starter === "ai2" ? "analyze-AI2-AI1" : "analyze-AI1-AI2";

      return {
        fallbackTitle: START_STOP_PROTOCOL_HEADERS.ANALYZE_AI_AI_START,
        protocolKey,
      };
    }

    if (scenario === "ai-ai-stop") {
      return {
        fallbackTitle: START_STOP_PROTOCOL_HEADERS.ANALYZE_AI_AI_STOP,
      };
    }

    if (scenario === "ai-assistant-stop") {
      return {
        fallbackTitle: START_STOP_PROTOCOL_HEADERS.ANALYZE_AI_ASSISTANT_STOP,
      };
    }
  }

  return null;
}

function buildProtocolPayload({
  room = "",
  scenario = "",
  targets = [] as string[],
  context = {},
  protocolKey = "",
  fallbackTitle = "",
}: {
  room?: string;
  scenario?: string;
  targets?: string[];
  context?: { starter?: string };
  protocolKey?: string;
  fallbackTitle?: string;
} = {}): ProtocolPayload | null {
  const descriptor = resolveProtocolDescriptor({
    room,
    scenario,
    context,
    protocolKey,
    fallbackTitle,
  });
  if (descriptor === null) {
    return null;
  }

  const connected = targets.filter((t) => isSlotEligible(t));
  return {
    message: descriptor.fallbackTitle,
    ...(descriptor.protocolKey !== undefined ? { protocolKey: descriptor.protocolKey } : {}),
    targets: /** @type {any[]} */ connected,
  };
}

const protocolHandler = {
  buildPayload: buildProtocolPayload,
  resolveDescriptor: resolveProtocolDescriptor,
};

export { protocolHandler, protocolHandler as ProtocolHandler };
