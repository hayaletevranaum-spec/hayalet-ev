import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@libsql/client";
import type { Client, InStatement, Row } from "@libsql/client";

const TAG_SEPARATOR = "\u001f";

export interface MemoryStoreOptions {
  databasePath: string;
}

export interface MemoryWriteInput {
  namespace?: string;
  content: string;
  summary?: string;
  sourceProvider?: string;
  memoryType?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export interface MemorySearchInput {
  namespace?: string;
  query?: string;
  sourceProvider?: string;
  tags?: string[];
  limit?: number;
}

export interface MemoryUpdateInput {
  id: string;
  content?: string;
  summary?: string;
  sourceProvider?: string;
  memoryType?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryPruneInput {
  namespace?: string;
  maxItems: number;
  olderThanMs?: number;
}

export interface MemoryStatsInput {
  namespace?: string;
}

export interface MemoryItem {
  id: string;
  namespace: string;
  content: string;
  summary: string | null;
  sourceProvider: string | null;
  memoryType: string;
  importance: number;
  pinned: boolean;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface MemorySearchResult {
  items: MemoryItem[];
  total: number;
}

export interface MemoryStats {
  totalMemories: number;
  pinnedMemories: number;
  averageImportance: number;
  lastUpdatedAt: number | null;
}

interface MemoryRow {
  id: string;
  namespace: string;
  content: string;
  summary: string | null;
  source_provider: string | null;
  memory_type: string;
  importance: number;
  pinned: number;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  access_count: number;
  tags_concat: string | null;
}

function clampImportance(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 3;
  if (value < 1) return 1;
  if (value > 5) return 5;
  return Math.round(value);
}

function normalizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === "") continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }

  return normalized;
}

function parseMetadata(metadataJson: string | null): Record<string, unknown> | null {
  if (metadataJson == null) return null;
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (
      parsed !== null &&
      parsed !== undefined &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function makePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function getRowValue(row: Row, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

function toMemoryRow(row: Row): MemoryRow {
  return {
    id: asString(getRowValue(row, "id")),
    namespace: asString(getRowValue(row, "namespace")),
    content: asString(getRowValue(row, "content")),
    summary: asNullableString(getRowValue(row, "summary")),
    source_provider: asNullableString(getRowValue(row, "source_provider")),
    memory_type: asString(getRowValue(row, "memory_type")),
    importance: asNumber(getRowValue(row, "importance")),
    pinned: asNumber(getRowValue(row, "pinned")),
    metadata_json: asNullableString(getRowValue(row, "metadata_json")),
    created_at: asNumber(getRowValue(row, "created_at")),
    updated_at: asNumber(getRowValue(row, "updated_at")),
    last_accessed_at: asNumber(getRowValue(row, "last_accessed_at")),
    access_count: asNumber(getRowValue(row, "access_count")),
    tags_concat: asNullableString(getRowValue(row, "tags_concat")),
  };
}

export class MemoryStore {
  private readonly client: Client;

  private readonly ready: Promise<void>;

  constructor(options: MemoryStoreOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.client = createClient({
      url: pathToFileURL(options.databasePath).toString(),
      concurrency: 4,
    });
    this.ready = this.initializeSchema();
  }

  close(): void {
    this.client.close();
  }

  async writeMemory(input: MemoryWriteInput): Promise<MemoryItem> {
    await this.ready;

    const content = input.content.trim();
    if (content === "") {
      throw new Error("content is required");
    }

    const now = Date.now();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;
    const id = randomUUID();
    const trimmedNamespace = input.namespace?.trim();
    const namespace =
      trimmedNamespace != null && trimmedNamespace.length > 0 ? trimmedNamespace : "global";
    const trimmedSummary = input.summary?.trim();
    const summary = trimmedSummary != null && trimmedSummary.length > 0 ? trimmedSummary : null;
    const trimmedSourceProvider = input.sourceProvider?.trim();
    const sourceProvider =
      trimmedSourceProvider != null && trimmedSourceProvider.length > 0
        ? trimmedSourceProvider
        : null;
    const trimmedMemoryType = input.memoryType?.trim();
    const memoryType =
      trimmedMemoryType != null && trimmedMemoryType.length > 0 ? trimmedMemoryType : "note";
    const importance = clampImportance(input.importance);
    const pinned = input.pinned === true ? 1 : 0;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const tags = normalizeTags(input.tags);

    const statements: InStatement[] = [
      {
        sql: `
          INSERT INTO memories (
            id,
            namespace,
            content,
            summary,
            source_provider,
            memory_type,
            importance,
            pinned,
            metadata_json,
            created_at,
            updated_at,
            last_accessed_at,
            access_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `,
        args: [
          id,
          namespace,
          content,
          summary,
          sourceProvider,
          memoryType,
          importance,
          pinned,
          metadataJson,
          createdAt,
          updatedAt,
          updatedAt,
        ],
      },
      ...this.buildReplaceTagsStatements(id, tags),
    ];

    await this.client.batch(statements, "write");

    const row = await this.getMemoryById(id);
    if (row == null) {
      throw new Error("failed to read inserted memory");
    }
    return row;
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    await this.ready;

    const limit = this.normalizeLimit(input.limit);
    const namespace = input.namespace?.trim();
    const sourceProvider = input.sourceProvider?.trim();
    const tags = normalizeTags(input.tags);
    const query = (input.query ?? "*").trim();

    const conditions: string[] = [];
    const params: Array<string | number | null> = [];

    if (namespace != null && namespace !== "") {
      conditions.push("m.namespace = ?");
      params.push(namespace);
    }

    if (sourceProvider != null && sourceProvider !== "") {
      conditions.push("m.source_provider = ?");
      params.push(sourceProvider);
    }

    if (tags.length > 0) {
      const placeholders = makePlaceholders(tags.length);
      conditions.push(
        `m.id IN (
          SELECT memory_id
          FROM memory_tags
          WHERE tag IN (${placeholders})
          GROUP BY memory_id
          HAVING COUNT(DISTINCT tag) = ?
        )`
      );
      params.push(...tags, tags.length);
    }

    if (query !== "" && query !== "*") {
      conditions.push(
        `(
          m.content LIKE ? OR
          COALESCE(m.summary, '') LIKE ? OR
          EXISTS (
            SELECT 1
            FROM memory_tags mt
            WHERE mt.memory_id = m.id AND mt.tag LIKE ?
          )
        )`
      );
      const likeQuery = `%${query}%`;
      params.push(likeQuery, likeQuery, likeQuery);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.client.execute({
      sql: `
        SELECT
          m.id,
          m.namespace,
          m.content,
          m.summary,
          m.source_provider,
          m.memory_type,
          m.importance,
          m.pinned,
          m.metadata_json,
          m.created_at,
          m.updated_at,
          m.last_accessed_at,
          m.access_count,
          (
            SELECT group_concat(tag, '${TAG_SEPARATOR}')
            FROM memory_tags
            WHERE memory_id = m.id
          ) AS tags_concat
        FROM memories m
        ${whereClause}
        ORDER BY m.pinned DESC, m.importance DESC, m.updated_at DESC
        LIMIT ?
      `,
      args: [...params, limit],
    });

    const items = result.rows.map((row) => this.mapRow(toMemoryRow(row)));
    await this.bumpAccess(items.map((item) => item.id));

    return {
      items,
      total: items.length,
    };
  }

  async updateMemory(input: MemoryUpdateInput): Promise<boolean> {
    await this.ready;

    const existing = await this.getMemoryById(input.id);
    if (existing == null) {
      return false;
    }

    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    if (input.content !== undefined) {
      const content = input.content.trim();
      if (content === "") throw new Error("content cannot be empty");
      updates.push("content = ?");
      params.push(content);
    }

    if (input.summary !== undefined) {
      updates.push("summary = ?");
      params.push(input.summary.trim() !== "" ? input.summary.trim() : null);
    }

    if (input.sourceProvider !== undefined) {
      updates.push("source_provider = ?");
      params.push(input.sourceProvider.trim() !== "" ? input.sourceProvider.trim() : null);
    }

    if (input.memoryType !== undefined) {
      updates.push("memory_type = ?");
      params.push(input.memoryType.trim() !== "" ? input.memoryType.trim() : "note");
    }

    if (input.importance !== undefined) {
      updates.push("importance = ?");
      params.push(clampImportance(input.importance));
    }

    if (input.pinned !== undefined) {
      updates.push("pinned = ?");
      params.push(input.pinned ? 1 : 0);
    }

    if (input.metadata !== undefined) {
      updates.push("metadata_json = ?");
      params.push(JSON.stringify(input.metadata));
    }

    const statements: InStatement[] = [];

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(Date.now());
      statements.push({
        sql: `
          UPDATE memories
          SET ${updates.join(", ")}
          WHERE id = ?
        `,
        args: [...params, input.id],
      });
    }

    if (input.tags !== undefined) {
      statements.push(...this.buildReplaceTagsStatements(input.id, normalizeTags(input.tags)));
    }

    if (statements.length === 0) {
      return false;
    }

    await this.client.batch(statements, "write");
    return true;
  }

  async deleteMemory(id: string): Promise<boolean> {
    await this.ready;

    const result = await this.client.batch(
      [
        {
          sql: "DELETE FROM memory_tags WHERE memory_id = ?",
          args: [id],
        },
        {
          sql: "DELETE FROM memories WHERE id = ?",
          args: [id],
        },
      ],
      "write"
    );

    return (result[1]?.rowsAffected ?? 0) > 0;
  }

  async pruneMemory(input: MemoryPruneInput): Promise<number> {
    await this.ready;

    const maxItems = Math.max(0, Math.floor(input.maxItems));
    const namespace = input.namespace?.trim();
    const threshold = input.olderThanMs;

    const conditions = ["pinned = 0"];
    const params: Array<string | number | null> = [];

    if (namespace != null && namespace !== "") {
      conditions.push("namespace = ?");
      params.push(namespace);
    }

    const result = await this.client.execute({
      sql: `
        SELECT id, updated_at
        FROM memories
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at DESC
      `,
      args: params,
    });

    const rows = result.rows.map((row) => ({
      id: asString(getRowValue(row, "id")),
      updated_at: asNumber(getRowValue(row, "updated_at")),
    }));

    const keepIds = new Set(rows.slice(0, maxItems).map((row) => row.id));
    const deleteIds: string[] = [];
    const now = Date.now();

    for (const row of rows) {
      const olderThanThreshold =
        typeof threshold === "number" ? now - row.updated_at > threshold : false;
      const overflow = !keepIds.has(row.id);
      if (olderThanThreshold || overflow) {
        deleteIds.push(row.id);
      }
    }

    if (deleteIds.length === 0) return 0;

    const uniqueDeleteIds = Array.from(new Set(deleteIds));
    const placeholders = makePlaceholders(uniqueDeleteIds.length);

    const deleteResults = await this.client.batch(
      [
        {
          sql: `DELETE FROM memory_tags WHERE memory_id IN (${placeholders})`,
          args: uniqueDeleteIds,
        },
        {
          sql: `DELETE FROM memories WHERE id IN (${placeholders})`,
          args: uniqueDeleteIds,
        },
      ],
      "write"
    );

    return deleteResults[1]?.rowsAffected ?? 0;
  }

  async getStats(input: MemoryStatsInput = {}): Promise<MemoryStats> {
    await this.ready;

    const namespace = input.namespace?.trim();
    const where = namespace != null && namespace !== "" ? "WHERE namespace = ?" : "";
    const params: Array<string | number | null> =
      namespace != null && namespace !== "" ? [namespace] : [];

    const result = await this.client.execute({
      sql: `
        SELECT
          COUNT(*) AS total_memories,
          SUM(CASE WHEN pinned = 1 THEN 1 ELSE 0 END) AS pinned_memories,
          AVG(importance) AS avg_importance,
          MAX(updated_at) AS last_updated_at
        FROM memories
        ${where}
      `,
      args: params,
    });

    const row = result.rows[0];
    if (row == null) {
      return {
        totalMemories: 0,
        pinnedMemories: 0,
        averageImportance: 0,
        lastUpdatedAt: null,
      };
    }

    const averageImportance = getRowValue(row, "avg_importance");
    const lastUpdatedAt = getRowValue(row, "last_updated_at");

    return {
      totalMemories: asNumber(getRowValue(row, "total_memories")),
      pinnedMemories: asNumber(getRowValue(row, "pinned_memories")),
      averageImportance:
        typeof averageImportance === "number" && Number.isFinite(averageImportance)
          ? Number(averageImportance.toFixed(2))
          : 0,
      lastUpdatedAt:
        typeof lastUpdatedAt === "number"
          ? lastUpdatedAt
          : typeof lastUpdatedAt === "bigint"
            ? Number(lastUpdatedAt)
            : null,
    };
  }

  private async initializeSchema(): Promise<void> {
    await this.client.batch(
      [
        `
          CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            content TEXT NOT NULL,
            summary TEXT,
            source_provider TEXT,
            memory_type TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 3,
            pinned INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_accessed_at INTEGER NOT NULL,
            access_count INTEGER NOT NULL DEFAULT 0
          )
        `,
        `
          CREATE TABLE IF NOT EXISTS memory_tags (
            memory_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (memory_id, tag)
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_memories_namespace_updated
          ON memories(namespace, updated_at DESC)
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_memories_provider
          ON memories(source_provider)
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_memories_pinned_importance
          ON memories(pinned DESC, importance DESC, updated_at DESC)
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_memory_tags_tag
          ON memory_tags(tag)
        `,
      ],
      "write"
    );
  }

  private buildReplaceTagsStatements(memoryId: string, tags: string[]): InStatement[] {
    return [
      {
        sql: "DELETE FROM memory_tags WHERE memory_id = ?",
        args: [memoryId],
      },
      ...tags.map(
        (tag): InStatement => ({
          sql: `
            INSERT INTO memory_tags (memory_id, tag)
            VALUES (?, ?)
          `,
          args: [memoryId, tag],
        })
      ),
    ];
  }

  private async getMemoryById(id: string): Promise<MemoryItem | null> {
    const result = await this.client.execute({
      sql: `
        SELECT
          m.id,
          m.namespace,
          m.content,
          m.summary,
          m.source_provider,
          m.memory_type,
          m.importance,
          m.pinned,
          m.metadata_json,
          m.created_at,
          m.updated_at,
          m.last_accessed_at,
          m.access_count,
          (
            SELECT group_concat(tag, '${TAG_SEPARATOR}')
            FROM memory_tags
            WHERE memory_id = m.id
          ) AS tags_concat
        FROM memories m
        WHERE m.id = ?
        LIMIT 1
      `,
      args: [id],
    });

    const row = result.rows[0];
    return row != null ? this.mapRow(toMemoryRow(row)) : null;
  }

  private mapRow(row: MemoryRow): MemoryItem {
    return {
      id: row.id,
      namespace: row.namespace,
      content: row.content,
      summary: row.summary,
      sourceProvider: row.source_provider,
      memoryType: row.memory_type,
      importance: Number(row.importance),
      pinned: row.pinned === 1,
      tags:
        row.tags_concat != null && row.tags_concat !== ""
          ? row.tags_concat.split(TAG_SEPARATOR)
          : [],
      metadata: parseMetadata(row.metadata_json),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      lastAccessedAt: Number(row.last_accessed_at),
      accessCount: Number(row.access_count),
    };
  }

  private normalizeLimit(limit?: number): number {
    if (typeof limit !== "number" || Number.isNaN(limit)) return 20;
    if (limit < 1) return 1;
    if (limit > 200) return 200;
    return Math.floor(limit);
  }

  private async bumpAccess(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const uniqueIds = Array.from(new Set(ids));
    const placeholders = makePlaceholders(uniqueIds.length);

    await this.client.execute({
      sql: `
        UPDATE memories
        SET
          last_accessed_at = ?,
          access_count = access_count + 1
        WHERE id IN (${placeholders})
      `,
      args: [Date.now(), ...uniqueIds],
    });
  }
}
