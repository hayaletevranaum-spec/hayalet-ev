import { join as joinWindowsPath } from "node:path/win32";

export type PackagedSurface = "wrapper" | "main" | "ghost";

export type VisibleTerminalLauncher = {
  command: string;
  args: string[];
  shell?: boolean;
};

export const PACKAGED_SURFACE_FLAG = "--packaged-surface";
export const WRAPPER_TERMINAL_ENV_KEY = "HAYALET_WRAPPER_TERMINAL";

function escapeShellSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

function quoteShellArg(value: string): string {
  return `'${escapeShellSingleQuotes(value)}'`;
}

function quoteWindowsCmdArg(value: string): string {
  if (value === "") {
    return '""';
  }

  const escaped = value.replace(/"/g, '""');
  return /[\s&()[\]{}^;!'+,`~|<>]/.test(value) ? `"${escaped}"` : escaped;
}

function stripPackagedSurfaceArgs(argv: readonly string[]): string[] {
  return argv
    .slice(1)
    .filter((arg) => arg !== PACKAGED_SURFACE_FLAG && !arg.startsWith(`${PACKAGED_SURFACE_FLAG}=`));
}

function buildLinuxVisibleTerminalCommand(
  executablePath: string,
  rootDir: string,
  argv: readonly string[]
): string {
  const relayArgs = stripPackagedSurfaceArgs(argv);
  const quotedArgs = relayArgs.map((arg) => quoteShellArg(arg)).join(" ");
  const executable = quoteShellArg(executablePath);
  const root = quoteShellArg(rootDir);
  return `cd ${root}; exec ${executable}${quotedArgs !== "" ? ` ${quotedArgs}` : ""}`;
}

function buildWindowsVisibleTerminalCommand(
  executablePath: string,
  rootDir: string,
  resourcesPath: string | undefined,
  argv: readonly string[]
): string {
  const relayArgs = stripPackagedSurfaceArgs(argv);
  const quotedArgs = relayArgs.map((arg) => quoteWindowsCmdArg(arg)).join(" ");
  const executable = quoteWindowsCmdArg(executablePath);
  const root = quoteWindowsCmdArg(rootDir);
  const resolvedResourcesPath =
    typeof resourcesPath === "string" && resourcesPath.trim() !== ""
      ? resourcesPath.trim()
      : joinWindowsPath(rootDir, "resources");
  const cliEntrypoint = quoteWindowsCmdArg(
    joinWindowsPath(
      resolvedResourcesPath,
      "app.asar",
      "dist",
      "electron",
      "packaged-wrapper-cli.js"
    )
  );
  return `cd /d ${root} && set ELECTRON_RUN_AS_NODE=1 && ${executable} ${cliEntrypoint}${quotedArgs !== "" ? ` ${quotedArgs}` : ""}`;
}

export function shouldLaunchVisibleTerminal({
  surface,
  platform,
  stdoutIsTTY,
  env,
}: {
  surface: PackagedSurface;
  platform: NodeJS.Platform;
  stdoutIsTTY: boolean;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (surface !== "wrapper") {
    return false;
  }

  if (platform !== "linux" && platform !== "win32") {
    return false;
  }

  if (stdoutIsTTY) {
    return false;
  }

  if (env[WRAPPER_TERMINAL_ENV_KEY] === "1") {
    return false;
  }

  if (platform === "linux") {
    return typeof env["DISPLAY"] === "string" || typeof env["WAYLAND_DISPLAY"] === "string";
  }

  return true;
}

export function createVisibleTerminalLaunchers({
  platform,
  executablePath,
  rootDir,
  resourcesPath,
  argv,
}: {
  platform: NodeJS.Platform;
  executablePath: string;
  rootDir: string;
  resourcesPath?: string;
  argv: readonly string[];
}): VisibleTerminalLauncher[] {
  if (platform === "win32") {
    return [
      {
        command: "cmd",
        args: [
          "/d",
          "/c",
          "start",
          '"Hayalet Ev Wrapper"',
          "cmd",
          "/d",
          "/k",
          buildWindowsVisibleTerminalCommand(executablePath, rootDir, resourcesPath, argv),
        ],
        shell: true,
      },
    ];
  }

  if (platform !== "linux") {
    return [];
  }

  const shellCommand = buildLinuxVisibleTerminalCommand(executablePath, rootDir, argv);
  return [
    {
      command: "gnome-terminal",
      args: ["--title=Hayalet Ev Wrapper", "--", "bash", "-lc", shellCommand],
    },
    {
      command: "konsole",
      args: ["-e", "bash", "-lc", shellCommand],
    },
    {
      command: "x-terminal-emulator",
      args: ["-e", "bash", "-lc", shellCommand],
    },
    {
      command: "xfce4-terminal",
      args: [
        "--title=Hayalet Ev Wrapper",
        "--command",
        `bash -lc '${escapeShellSingleQuotes(shellCommand)}'`,
      ],
    },
  ];
}
