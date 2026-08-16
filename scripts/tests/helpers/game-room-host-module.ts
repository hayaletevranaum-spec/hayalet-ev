import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRoomBuiltArtifact } from "./room-installed-copy.ts";

let builtHostEntryPathPromise: Promise<string> | null = null;

async function getBuiltHostEntryPath(): Promise<string> {
  builtHostEntryPathPromise ??= (async (): Promise<string> => {
    const buildArtifact = await createRoomBuiltArtifact("game-room");
    return join(buildArtifact.rootDir, "host", "index.js");
  })();

  return await builtHostEntryPathPromise;
}

export async function loadGameRoomHostModule(): Promise<{
  default: {
    activate: (api: Record<string, unknown>) => Record<string, unknown>;
  };
  teamTetrisEngine: Record<string, unknown>;
}> {
  const moduleUrl = pathToFileURL(await getBuiltHostEntryPath());
  moduleUrl.searchParams.set("ts", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return await import(moduleUrl.toString()) as {
    default: {
      activate: (api: Record<string, unknown>) => Record<string, unknown>;
    };
    teamTetrisEngine: Record<string, unknown>;
  };
}
