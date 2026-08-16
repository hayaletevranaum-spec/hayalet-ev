import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tscCliPath = require.resolve("typescript/bin/tsc");
const mode = process.argv[2] ?? "stats";
const project = process.argv[3] ?? "src/tsconfig.json";

const child = spawn(
  process.execPath,
  [tscCliPath, "--noEmit", "-p", project, "--pretty", "false"],
  {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString("utf-8");
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString("utf-8");
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("close", () => {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (mode === "errors") {
    process.stdout.write(`${lines.filter((line) => line.includes("error TS")).join("\n")}\n`);
    return;
  }
  process.stdout.write(`${lines.at(-1) ?? ""}\n`);
});
