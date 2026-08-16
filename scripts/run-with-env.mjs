import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";

function splitEnvAssignment(value) {
  const index = value.indexOf("=");
  if (index <= 0) return null;
  const key = value.slice(0, index);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) !== true) return null;
  return [key, value.slice(index + 1)];
}

function resolveWindowsCommand(command) {
  if (process.platform !== "win32" || /[\\/]/.test(command) || extname(command) !== "") {
    return command;
  }

  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter((entry) => entry !== "");
  // Prefer Windows command wrappers first (.cmd/.exe/.bat) before
  // checking extensionless files, to avoid spawning shell scripts
  // (which exist in node_modules/.bin on non-Windows systems) and
  // causing ENOENT on Windows.
  const extensions = [".cmd", ".exe", ".bat", ""]; 
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(entry, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return command;
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf("--");
  const envTokens = separatorIndex === -1 ? [] : argv.slice(0, separatorIndex);
  const commandTokens = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);
  const env = { ...process.env };

  for (const token of envTokens) {
    const assignment = splitEnvAssignment(token);
    if (assignment === null) {
      throw new Error(`Expected KEY=value before --, got ${token}`);
    }
    const [key, value] = assignment;
    env[key] = value;
  }

  if (commandTokens.length === 0) {
    throw new Error("Usage: node scripts/run-with-env.mjs KEY=value -- command [args...]");
  }

  return {
    env,
    command: commandTokens[0],
    args: commandTokens.slice(1),
  };
}

const parsed = parseArgs(process.argv.slice(2));
const spawnCommand = resolveWindowsCommand(parsed.command);

function quoteForCmd(arg) {
  if (arg === "") return '""';
  // If contains whitespace or double quote, wrap in double quotes and escape inner quotes
  if (/\s|"/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

let child;
if (process.platform === "win32") {
  const cmd = process.env.ComSpec || process.env.comspec || "cmd.exe";
  const hasExt = extname(spawnCommand) !== "";
  const spawnOptions = {
    cwd: process.cwd(),
    env: parsed.env,
    stdio: "inherit",
  };

  if (hasExt) {
    try {
      child = spawn(spawnCommand, parsed.args, spawnOptions);
    } catch (err) {
      // If direct spawn fails (EINVAL on some Windows setups), fallback
      // to launching via cmd.exe with a quoted command line.
      const commandLine = [spawnCommand, ...parsed.args].map(quoteForCmd).join(" ");
      child = spawn(cmd, ["/s", "/c", commandLine], spawnOptions);
    }
  } else {
    // When the command has no extension, prefer running through cmd.exe so
    // PATHEXT and cmd shim behavior is honored. Still guard against errors.
    const commandLine = [spawnCommand, ...parsed.args].map(quoteForCmd).join(" ");
    try {
      child = spawn(cmd, ["/s", "/c", commandLine], spawnOptions);
    } catch (err) {
      // As a last resort, attempt to spawn the command directly.
      child = spawn(spawnCommand, parsed.args, spawnOptions);
    }
  }
} else {
  try {
    child = spawn(spawnCommand, parsed.args, {
      cwd: process.cwd(),
      env: parsed.env,
      stdio: "inherit",
    });
  } catch (err) {
    // Non-Windows fallback: run via the system shell if direct spawn fails.
    const shell = process.env.SHELL || "/bin/sh";
    const commandLine = [spawnCommand, ...parsed.args].map((a) => a).join(" ");
    child = spawn(shell, ["-c", commandLine], {
      cwd: process.cwd(),
      env: parsed.env,
      stdio: "inherit",
    });
  }
}

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`Command interrupted by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 0;
});
