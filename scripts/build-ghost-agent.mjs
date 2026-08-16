import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = dirname(__dirname);

const srcRenderer = join(root, "ghost-agent", "src", "renderer");
const outRenderer = join(root, "dist", "ghost-agent", "renderer");
const tsconfigPath = join(root, "ghost-agent", "tsconfig.json");

async function ensureCleanOutDir() {
  await rm(outRenderer, { recursive: true, force: true });
  await mkdir(outRenderer, { recursive: true });
}

async function copyStaticFiles() {
  const indexHtmlRaw = await readFile(join(srcRenderer, "index.html"), "utf-8");
  const indexHtml = indexHtmlRaw.replace("./index.ts", "./index.js");

  await writeFile(join(outRenderer, "index.html"), indexHtml, "utf-8");
  await cp(join(srcRenderer, "index.css"), join(outRenderer, "index.css"));
}

async function buildBundles() {
  await build({
    entryPoints: [join(srcRenderer, "index.ts")],
    outfile: join(outRenderer, "index.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    sourcemap: true,
    target: "es2022",
    tsconfig: tsconfigPath,
  });
}

async function main() {
  await ensureCleanOutDir();
  await buildBundles();
  await copyStaticFiles();
}

main().catch((error) => {
  console.error("ghost-agent build failed:", error);
  process.exitCode = 1;
});
