import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProjectRootFromFile } from "../../mcp-server/utils/project-root.ts";

async function createProjectRootFixture(): Promise<{
  cleanup: () => Promise<void>;
  root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "app-project-root-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}\n', "utf-8");
  await writeFile(join(root, "AGENTS.md"), "# fixture\n", "utf-8");

  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

void test("resolveProjectRootFromFile finds repo root from source tree path", async () => {
  const fixture = await createProjectRootFixture();

  try {
    const sourceFile = join(fixture.root, "mcp-server", "utils", "project-root.ts");
    await mkdir(join(fixture.root, "mcp-server", "utils"), { recursive: true });
    await writeFile(sourceFile, "// fixture\n", "utf-8");

    assert.equal(resolveProjectRootFromFile(sourceFile), fixture.root);
  } finally {
    await fixture.cleanup();
  }
});

void test("resolveProjectRootFromFile finds repo root from compiled mcp dist path", async () => {
  const fixture = await createProjectRootFixture();

  try {
    const distFile = join(
      fixture.root,
      "dist",
      "mcp-server",
      "mcp-server",
      "utils",
      "project-root.js"
    );
    await mkdir(join(fixture.root, "dist", "mcp-server", "mcp-server", "utils"), {
      recursive: true,
    });
    await writeFile(distFile, "// fixture\n", "utf-8");

    assert.equal(resolveProjectRootFromFile(distFile), fixture.root);
  } finally {
    await fixture.cleanup();
  }
});

void test("resolveProjectRootFromFile finds repo root from bundled standalone dist path", async () => {
  const fixture = await createProjectRootFixture();

  try {
    const distFile = join(fixture.root, "dist", "mcp-server", "standalone", "index.js");
    await mkdir(join(fixture.root, "dist", "mcp-server", "standalone"), {
      recursive: true,
    });
    await writeFile(distFile, "// fixture\n", "utf-8");

    assert.equal(resolveProjectRootFromFile(distFile), fixture.root);
  } finally {
    await fixture.cleanup();
  }
});
