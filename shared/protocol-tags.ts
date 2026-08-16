export type ProtocolTokenTag = "<AI0>" | "<AI1>" | "<AI2>" | "<US1>";
export type ProtocolTokenProvider = "ai0" | "ai1" | "ai2" | "us1";
export type ProtocolTokenDeletionDirection = "backward" | "forward";

export const PROTOCOL_TOKEN_TAGS: ProtocolTokenTag[] = ["<AI0>", "<AI1>", "<AI2>", "<US1>"];

const PROTOCOL_TOKEN_PROVIDER_BY_TAG: Record<ProtocolTokenTag, ProtocolTokenProvider> = {
  "<AI0>": "ai0",
  "<AI1>": "ai1",
  "<AI2>": "ai2",
  "<US1>": "us1",
};

export function isProtocolTokenTag(value: string): value is ProtocolTokenTag {
  return PROTOCOL_TOKEN_TAGS.includes(value as ProtocolTokenTag);
}

export function getProtocolTokenProvider(tag: ProtocolTokenTag): ProtocolTokenProvider {
  return PROTOCOL_TOKEN_PROVIDER_BY_TAG[tag];
}

export function replaceProtocolTagsWithResolver(
  text: string,
  resolveNickname: (provider: ProtocolTokenProvider) => string
): string {
  return PROTOCOL_TOKEN_TAGS.reduce(
    (result, tag) => result.replaceAll(tag, resolveNickname(getProtocolTokenProvider(tag))),
    text
  );
}

export function resolveProtocolTokenDeletionRange(
  rawValue: string,
  caretOffset: number,
  direction: ProtocolTokenDeletionDirection
): { start: number; end: number; tag: ProtocolTokenTag } | null {
  const normalizedOffset = Math.max(0, Math.min(caretOffset, rawValue.length));

  if (direction === "backward") {
    for (const tag of PROTOCOL_TOKEN_TAGS) {
      const start = normalizedOffset - tag.length;
      if (start < 0) {
        continue;
      }
      if (rawValue.slice(start, normalizedOffset) === tag) {
        return {
          start,
          end: normalizedOffset,
          tag,
        };
      }
    }
    return null;
  }

  for (const tag of PROTOCOL_TOKEN_TAGS) {
    const end = normalizedOffset + tag.length;
    if (rawValue.slice(normalizedOffset, end) === tag) {
      return {
        start: normalizedOffset,
        end,
        tag,
      };
    }
  }

  return null;
}
