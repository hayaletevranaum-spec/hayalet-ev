import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initPaths, Paths } from "../../electron/paths.ts";
import { RoomPackageManager } from "../../electron/room-package-manager.ts";

function parseArgs(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") {
      options.outputFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--workspace-root") {
      options.workspaceRoot = argv[index + 1];
      index += 1;
      continue;
    }
    positionals.push(value);
  }

  return {
    roomId: positionals[0] ?? "",
    options,
  };
}

export async function buildRoomBundle(roomId, options = {}) {
  initPaths(join(process.cwd(), "electron"));

  const manager = new RoomPackageManager({
    ...(options.workspaceRoot !== undefined
      ? { workspaceRoot: resolve(options.workspaceRoot) }
      : {}),
  });
  const result = await manager.packageWorkspaceRoom(roomId, {
    ...(options.outputFile !== undefined ? { outputFile: resolve(options.outputFile) } : {}),
  });

  if (result.success !== true || result.path === undefined) {
    throw new Error(result.error ?? "room bundle build failed");
  }

  const workspaceRoot =
    options.workspaceRoot !== undefined
      ? resolve(options.workspaceRoot)
      : Paths.getRoomsWorkspaceDir();

  return {
    outputFile: result.path,
    roomDir: resolve(workspaceRoot, roomId),
  };
}

async function runCli() {
  const { roomId, options } = parseArgs(process.argv.slice(2));
  if (roomId === "") {
    console.error(
      "Usage: node --import tsx scripts/rooms/build-room-bundle.mjs <roomId> [--output <file>] [--workspace-root <dir>]"
    );
    process.exitCode = 1;
    return;
  }

  const result = await buildRoomBundle(roomId, options);
  console.log(result.outputFile);
}

const currentPath = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === currentPath) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
