import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sqliteManagerPath = "electron/database/sqlite-manager.ts";
const sqliteArchivePath = "electron/database/sqlite-archive.ts";
const databaseIndexPath = "electron/database/index.ts";

void test("conversation schema tracks title ownership for sync modes", () => {
  const managerContent = readFileSync(sqliteManagerPath, "utf8");

  assert.match(managerContent, /title_source TEXT NOT NULL DEFAULT 'system'/);
  assert.match(
    managerContent,
    /ALTER TABLE conversations ADD COLUMN title_source TEXT NOT NULL DEFAULT 'system'/
  );
  assert.match(managerContent, /title GLOB 'Sohbet \[0-9\]\[0-9\]\[0-9\]\*'/);
});

void test("sqlite archive adds sync metadata upsert and clean reset helpers", () => {
  const archiveContent = readFileSync(sqliteArchivePath, "utf8");

  assert.match(archiveContent, /async upsertConversationMetadata\(/);
  assert.match(archiveContent, /async resetConversationMessages\(/);
  assert.match(archiveContent, /title_source = \?/);
  assert.match(
    archiveContent,
    /DELETE FROM messages WHERE conversation_id = \? AND account_id = \?/
  );
});

void test("database manager exposes sync metadata upsert and clean reset entry points", () => {
  const databaseContent = readFileSync(databaseIndexPath, "utf8");

  assert.match(databaseContent, /async upsertConversationMetadata\(/);
  assert.match(databaseContent, /async resetConversationMessages\(/);
});
