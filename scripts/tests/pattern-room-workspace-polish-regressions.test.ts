import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { assert, test } from "./forge-room-ui-smoke.helpers.ts";

function resolvePatternRoomUiFile(fileName: string): string {
  return fileURLToPath(new URL(`../../rooms/pattern-room/ui/${fileName}`, import.meta.url));
}

void test("pattern-room final workspace polish owns the last cascade and responsive inspector", async () => {
  const [indexHtml, styleCss, polishCss] = await Promise.all([
    readFile(resolvePatternRoomUiFile("index.html"), "utf8"),
    readFile(resolvePatternRoomUiFile("style.css"), "utf8"),
    readFile(resolvePatternRoomUiFile("workspace-polish.css"), "utf8"),
  ]);

  assert.match(indexHtml, /<html lang="tr">/);
  assert.equal(indexHtml.includes("fonts.googleapis.com/css2"), false);
  assert.equal((styleCss.match(/fonts\.googleapis\.com\/css2/g) ?? []).length, 1);

  const graphStyleIndex = indexHtml.indexOf("./graph-revision.css");
  const polishStyleIndex = indexHtml.indexOf("./workspace-polish.css");
  assert.ok(graphStyleIndex >= 0);
  assert.ok(polishStyleIndex > graphStyleIndex);

  assert.match(
    polishCss,
    /\.pattern-room-workspace-outlet\s*\{[^}]*overflow-y:\s*auto;/s
  );
  assert.match(
    polishCss,
    /\.pattern-room-graph-viewport\s*\{[^}]*overflow:\s*auto;/s
  );
  assert.match(
    polishCss,
    /@media \(--pattern-bp-max-960\)[\s\S]*?\.pattern-room-workspace-inspector\s*\{[\s\S]*?display:\s*flex;/
  );
  assert.match(
    polishCss,
    /@media \(--pattern-bp-max-820\)[\s\S]*?\.pattern-room-workspace-navigation\s*\{[\s\S]*?display:\s*flex;/
  );
  assert.match(
    polishCss,
    /\.pattern-room-workspace-outlet h1,[\s\S]*?font-family:\s*"Source Serif 4"/
  );
});
