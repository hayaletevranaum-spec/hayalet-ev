export type ToolSnapshotStatus = "loaded" | "empty" | "error";

export interface ToolSnapshotResult {
  status: ToolSnapshotStatus;
  toolIds: string[];
}

export interface OpenCodeServerToolSnapshot extends ToolSnapshotResult {
  openCodeToolIds: string[];
  hevToolIds: string[];
}

export type ToolFetcher = (path: string) => Promise<unknown>;

const HEV_MCP_TOOL_ID_PREFIX = "app_hev_";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value !== "")));
}

export function isHayaletEvMcpToolId(toolId: string): boolean {
  return toolId.trim().startsWith(HEV_MCP_TOOL_ID_PREFIX);
}

export function splitOpenCodeServerToolIds(toolIds: string[]): {
  openCodeToolIds: string[];
  hevToolIds: string[];
} {
  const openCodeToolIds: string[] = [];
  const hevToolIds: string[] = [];

  uniqueStrings(toolIds).forEach((toolId) => {
    if (isHayaletEvMcpToolId(toolId)) {
      hevToolIds.push(toolId);
      return;
    }

    openCodeToolIds.push(toolId);
  });

  return { openCodeToolIds, hevToolIds };
}

export function normalizeToolIds(data: unknown): string[] {
  if (Array.isArray(data)) {
    return uniqueStrings(
      data.filter((item): item is string => typeof item === "string" && item !== "")
    );
  }

  if (data === null || data === undefined || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;

  if (record["error"] !== undefined || record["errors"] !== undefined) {
    return [];
  }

  const directIds = record["ids"];
  if (Array.isArray(directIds)) {
    return uniqueStrings(
      directIds.filter((item): item is string => typeof item === "string" && item !== "")
    );
  }

  const nestedToolIds = record["toolIds"];
  if (Array.isArray(nestedToolIds)) {
    return uniqueStrings(
      nestedToolIds.filter((item): item is string => typeof item === "string" && item !== "")
    );
  }

  const tools = record["tools"];
  if (Array.isArray(tools)) {
    return uniqueStrings(
      tools
        .map((item) => {
          if (item !== null && item !== undefined && typeof item === "object") {
            const id = (item as { id?: unknown; name?: unknown }).id;
            if (typeof id === "string" && id !== "") {
              return id;
            }

            const name = (item as { id?: unknown; name?: unknown }).name;
            if (typeof name === "string" && name !== "") {
              return name;
            }
          }

          return "";
        })
        .filter((item) => item !== "")
    );
  }

  return [];
}

export async function loadOpenCodeServerToolSnapshot(
  get: ToolFetcher
): Promise<OpenCodeServerToolSnapshot> {
  const loadToolIds = async (): Promise<{ status: ToolSnapshotStatus; toolIds: string[] }> => {
    try {
      const idsResponse = await get("/experimental/tool/ids");
      const toolIds = normalizeToolIds(idsResponse);
      return {
        status: toolIds.length > 0 ? "loaded" : "empty",
        toolIds,
      };
    } catch (_error) {
      try {
        const toolsResponse = await get("/experimental/tool");
        const toolIds = normalizeToolIds(toolsResponse);
        return {
          status: toolIds.length > 0 ? "loaded" : "empty",
          toolIds,
        };
      } catch (_nestedError) {
        return {
          status: "error",
          toolIds: [],
        };
      }
    }
  };

  const result = await loadToolIds();
  const { openCodeToolIds, hevToolIds } = splitOpenCodeServerToolIds(result.toolIds);
  return {
    ...result,
    openCodeToolIds,
    hevToolIds,
  };
}
