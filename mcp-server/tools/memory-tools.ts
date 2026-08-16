import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { TranslationParams } from "../../src/types/i18n.js";
import type {
  MemoryItem,
  MemorySearchResult,
  MemoryStats,
  MemoryStore as MemoryStoreInstance,
} from "./memory/store.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../utils/i18n/index.js";

interface MemoryStoreWriteArgs {
  namespace?: string;
  content?: string;
  summary?: string;
  source_provider?: string;
  memory_type?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface MemoryStoreSearchArgs {
  namespace?: string;
  query?: string;
  source_provider?: string;
  tags?: string[];
  limit?: number;
  response_format?: "json" | "prompt_compact";
  budget_chars?: number;
}

interface MemoryStoreUpdateArgs {
  id?: string;
  content?: string;
  summary?: string;
  source_provider?: string;
  memory_type?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface MemoryStoreDeleteArgs {
  id?: string;
}

interface MemoryStorePruneArgs {
  namespace?: string;
  max_items?: number;
  older_than_days?: number;
}

interface MemoryStoreStatsArgs {
  namespace?: string;
}

interface MemoryBootstrapPolicyArgs {
  namespace?: string;
  files?: string[];
  max_chunk_chars?: number;
  force?: boolean;
}

interface PromptCompactItem {
  id: string;
  score: number;
  type: string;
  importance: number;
  pinned: boolean;
  source_provider: string;
  tags: string[];
  reason: string;
  summary: string;
  content: string;
}

interface MemorySearchResponse extends MemorySearchResult {
  selected_count: number;
  budget_chars: number;
  used_chars: number;
  prompt_items: PromptCompactItem[];
  prompt_context: string;
}

interface MemoryBootstrapPolicyReport {
  namespace: string;
  files_requested: number;
  files_processed: number;
  total_chunks: number;
  inserted: number;
  updated: number;
  skipped: number;
  missing_files: string[];
}

type McpTranslator = (key: string, params?: TranslationParams) => string;

const DEFAULT_POLICY_FILES = [
  "AGENTS.md",
  ".rovo/00-ONBOARDING.md",
  ".rovo/01-CORE-PROTOCOL.md",
  ".rovo/02-MCP-ESSENTIALS.md",
  ".rovo/03-ARCHITECTURE.md",
];
const memoryDefinitionTranslator = createMcpTranslatorSync();

function memoryDefT(key: string, params?: TranslationParams): string {
  return memoryDefinitionTranslator(`mcpServer.memoryTools.definition.${key}`, params);
}

function memoryT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.memoryTools.${key}`, params);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeFileTag(pathValue: string): string {
  return pathValue
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/[^a-z0-9/._-]+/g, "-")
    .replace(/\//g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function splitIntoChunks(content: string, maxChars: number): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized === "") return [];

  const chunks: string[] = [];
  const blocks = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  let current = "";

  for (const block of blocks) {
    if (block.length > maxChars) {
      if (current !== "") {
        chunks.push(current);
        current = "";
      }
      for (let cursor = 0; cursor < block.length; cursor += maxChars) {
        chunks.push(block.slice(cursor, cursor + maxChars));
      }
      continue;
    }

    const merged = current !== "" ? `${current}\n\n${block}` : block;
    if (merged.length > maxChars) {
      if (current !== "") chunks.push(current);
      current = block;
    } else {
      current = merged;
    }
  }

  if (current !== "") chunks.push(current);
  return chunks;
}

function oneLine(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function typeRank(memoryType: string): number {
  if (memoryType === "policy") return 400;
  if (memoryType === "fact") return 300;
  if (memoryType === "task") return 200;
  return 100;
}

function computeScore(item: MemoryItem, now: number): number {
  const ageMs = Math.max(0, now - item.updatedAt);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const recencyScore = Math.max(0, 30 - ageDays);
  return typeRank(item.memoryType) + item.importance * 20 + (item.pinned ? 40 : 0) + recencyScore;
}

function buildReason(item: MemoryItem): string {
  if (item.memoryType === "policy") return "policy";
  if (item.pinned) return "pinned";
  if (item.importance >= 4) return "high-importance";
  return "relevant";
}

function buildPromptCompactPayload(
  result: MemorySearchResult,
  query: string,
  budgetChars: number
): {
  selected_count: number;
  used_chars: number;
  prompt_items: PromptCompactItem[];
  prompt_context: string;
} {
  const now = Date.now();
  const ranked = [...result.items]
    .map((item) => ({ item, score: computeScore(item, now) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.item.updatedAt - left.item.updatedAt;
    });

  const selected: PromptCompactItem[] = [];
  let usedChars = 0;

  for (const entry of ranked) {
    const summary = oneLine(entry.item.summary ?? "", 120);
    const content = oneLine(entry.item.content, 220);
    const sourceProvider = entry.item.sourceProvider ?? "n/a";
    const row = `[id=${entry.item.id} score=${entry.score.toFixed(1)} type=${entry.item.memoryType} imp=${entry.item.importance} pinned=${entry.item.pinned ? 1 : 0} provider=${sourceProvider} reason=${buildReason(entry.item)} tags=${entry.item.tags.join(",")}] summary=${summary !== "" ? summary : "-"} content=${content}`;
    const rowCost = row.length + 4;

    if (usedChars + rowCost > budgetChars && selected.length > 0) break;

    selected.push({
      id: entry.item.id,
      score: Number(entry.score.toFixed(1)),
      type: entry.item.memoryType,
      importance: entry.item.importance,
      pinned: entry.item.pinned,
      source_provider: sourceProvider,
      tags: entry.item.tags,
      reason: buildReason(entry.item),
      summary: summary !== "" ? summary : "-",
      content,
    });
    usedChars += rowCost;
  }

  const lines = [
    "[MEMORY_CONTEXT v1]",
    `query=${query !== "" ? query : "*"} hits=${result.total} selected=${selected.length} budget_chars=${budgetChars} used_chars=${usedChars}`,
    "items:",
    ...selected.map(
      (item) =>
        `- id=${item.id} score=${item.score} type=${item.type} imp=${item.importance} pinned=${item.pinned ? 1 : 0} provider=${item.source_provider} reason=${item.reason} tags=${item.tags.join(",") !== "" ? item.tags.join(",") : "-"}\n  summary: ${item.summary}\n  content: ${item.content}`
    ),
    "[/MEMORY_CONTEXT]",
  ];

  return {
    selected_count: selected.length,
    used_chars: usedChars,
    prompt_items: selected,
    prompt_context: lines.join("\n"),
  };
}

type MemoryStoreClass = new (options: { databasePath: string }) => MemoryStoreInstance;

const storePool = new Map<string, MemoryStoreInstance>();
let memoryStoreClass: MemoryStoreClass | null = null;

async function getMemoryStoreClass(): Promise<MemoryStoreClass> {
  if (memoryStoreClass !== null) {
    return memoryStoreClass;
  }

  const module = await import("./memory/store.js");
  memoryStoreClass = module.MemoryStore;
  return memoryStoreClass;
}

async function getStore(projectRoot: string): Promise<MemoryStoreInstance> {
  const dbPath = join(projectRoot, "data", "shared", "assistant-memory.db");
  const existing = storePool.get(dbPath);
  if (existing) return existing;

  const memoryStoreCtor = await getMemoryStoreClass();
  const store = new memoryStoreCtor({ databasePath: dbPath });
  storePool.set(dbPath, store);
  return store;
}

export async function memoryWrite(
  projectRoot: string,
  args: MemoryStoreWriteArgs
): Promise<{ message: string; memory: MemoryItem }> {
  const t = await createMcpTranslator();
  const content = args.content?.trim();
  if (content == null || content === "") throw new Error(memoryT(t, "errors.contentRequired"));

  const store = await getStore(projectRoot);
  const memory = await store.writeMemory({
    ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
    content,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.source_provider !== undefined ? { sourceProvider: args.source_provider } : {}),
    ...(args.memory_type !== undefined ? { memoryType: args.memory_type } : {}),
    ...(args.importance !== undefined ? { importance: args.importance } : {}),
    ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
  });

  return {
    message: memoryT(t, "write.saved", { id: memory.id }),
    memory,
  };
}

export async function memorySearch(
  projectRoot: string,
  args: MemoryStoreSearchArgs
): Promise<MemorySearchResponse> {
  const store = await getStore(projectRoot);
  let raw = await store.searchMemory({
    ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
    ...(args.query !== undefined ? { query: args.query } : {}),
    ...(args.source_provider !== undefined ? { sourceProvider: args.source_provider } : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });

  const query = (args.query ?? "*").trim() !== "" ? (args.query ?? "*").trim() : "*";
  if (raw.total === 0 && query !== "*") {
    raw = await store.searchMemory({
      ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
      query: "*",
      ...(args.source_provider !== undefined ? { sourceProvider: args.source_provider } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });
  }

  const budgetChars =
    typeof args.budget_chars === "number" && Number.isFinite(args.budget_chars)
      ? Math.max(200, Math.floor(args.budget_chars))
      : 2200;

  const payload = buildPromptCompactPayload(raw, query, budgetChars);
  return {
    ...raw,
    budget_chars: budgetChars,
    selected_count: payload.selected_count,
    used_chars: payload.used_chars,
    prompt_items: payload.prompt_items,
    prompt_context: payload.prompt_context,
  };
}

export async function memoryUpdate(
  projectRoot: string,
  args: MemoryStoreUpdateArgs
): Promise<{ updated: boolean; id: string }> {
  if (args.id == null || args.id.trim() === "") {
    const t = await createMcpTranslator();
    throw new Error(memoryT(t, "errors.idRequired"));
  }

  const store = await getStore(projectRoot);
  const updated = await store.updateMemory({
    id: args.id,
    ...(args.content !== undefined ? { content: args.content } : {}),
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.source_provider !== undefined ? { sourceProvider: args.source_provider } : {}),
    ...(args.memory_type !== undefined ? { memoryType: args.memory_type } : {}),
    ...(args.importance !== undefined ? { importance: args.importance } : {}),
    ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
  });

  return { updated, id: args.id };
}

export async function memoryDelete(
  projectRoot: string,
  args: MemoryStoreDeleteArgs
): Promise<{ deleted: boolean; id: string }> {
  if (args.id == null || args.id.trim() === "") {
    const t = await createMcpTranslator();
    throw new Error(memoryT(t, "errors.idRequired"));
  }
  const store = await getStore(projectRoot);
  const deleted = await store.deleteMemory(args.id);
  return { deleted, id: args.id };
}

export async function memoryPrune(
  projectRoot: string,
  args: MemoryStorePruneArgs
): Promise<{ removed: number; maxItems: number }> {
  const store = await getStore(projectRoot);
  const maxItems =
    typeof args.max_items === "number" && Number.isFinite(args.max_items)
      ? Math.max(0, Math.floor(args.max_items))
      : 500;

  const olderThanMs =
    typeof args.older_than_days === "number" && Number.isFinite(args.older_than_days)
      ? Math.max(0, Math.floor(args.older_than_days)) * 24 * 60 * 60 * 1000
      : undefined;

  const removed = await store.pruneMemory({
    ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
    maxItems,
    ...(olderThanMs !== undefined ? { olderThanMs } : {}),
  });

  return { removed, maxItems };
}

export async function memoryStats(
  projectRoot: string,
  args: MemoryStoreStatsArgs
): Promise<MemoryStats> {
  const store = await getStore(projectRoot);
  return await store.getStats({
    ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
  });
}

export async function memoryBootstrapPolicy(
  projectRoot: string,
  args: MemoryBootstrapPolicyArgs = {}
): Promise<MemoryBootstrapPolicyReport> {
  const store = await getStore(projectRoot);
  const trimmedNamespace = args.namespace?.trim();
  const namespace =
    trimmedNamespace != null && trimmedNamespace !== "" && trimmedNamespace.length > 0
      ? trimmedNamespace
      : "policy";
  const files =
    Array.isArray(args.files) && args.files.length > 0 ? args.files : DEFAULT_POLICY_FILES;
  const force = args.force === true;
  const maxChunkChars =
    typeof args.max_chunk_chars === "number" && Number.isFinite(args.max_chunk_chars)
      ? Math.max(200, Math.floor(args.max_chunk_chars))
      : 1400;

  let filesProcessed = 0;
  let totalChunks = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const missingFiles: string[] = [];

  for (const relPath of files) {
    const normalizedRelPath = relPath.replace(/^\.\//, "");
    const absolutePath = join(projectRoot, normalizedRelPath);
    if (!existsSync(absolutePath)) {
      missingFiles.push(normalizedRelPath);
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    const chunks = splitIntoChunks(content, maxChunkChars);
    if (chunks.length === 0) continue;
    filesProcessed++;

    const safeFileTag =
      sanitizeFileTag(normalizedRelPath) !== ""
        ? sanitizeFileTag(normalizedRelPath)
        : "policy-file";

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index] ?? "";
      if (chunk === "") continue;

      totalChunks++;
      const fileTag = `policy-file:${safeFileTag}`;
      const chunkTag = `policy-chunk:${index + 1}`;
      const tags = ["policy", fileTag, chunkTag];
      const chunkHash = sha256(chunk);
      const summary = `${normalizedRelPath} (${index + 1}/${chunks.length})`;
      const metadata = {
        source_file: normalizedRelPath,
        chunk_index: index + 1,
        chunk_total: chunks.length,
        content_hash: chunkHash,
        bootstrap_version: 1,
      };

      const existing = (
        await store.searchMemory({
          namespace,
          query: "*",
          tags: [fileTag, chunkTag],
          limit: 1,
        })
      ).items[0];

      if (!existing) {
        await store.writeMemory({
          namespace,
          content: chunk,
          summary,
          sourceProvider: "system-policy",
          memoryType: "policy",
          importance: 5,
          pinned: true,
          tags,
          metadata,
        });
        inserted++;
        continue;
      }

      const previousHash =
        existing.metadata && typeof existing.metadata["content_hash"] === "string"
          ? existing.metadata["content_hash"]
          : null;

      if (!force && previousHash === chunkHash) {
        skipped++;
        continue;
      }

      const didUpdate = await store.updateMemory({
        id: existing.id,
        content: chunk,
        summary,
        sourceProvider: "system-policy",
        memoryType: "policy",
        importance: 5,
        pinned: true,
        tags,
        metadata,
      });

      if (didUpdate) {
        updated++;
      } else {
        await store.writeMemory({
          namespace,
          content: chunk,
          summary,
          sourceProvider: "system-policy",
          memoryType: "policy",
          importance: 5,
          pinned: true,
          tags,
          metadata,
        });
        inserted++;
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  return {
    namespace,
    files_requested: files.length,
    files_processed: filesProcessed,
    total_chunks: totalChunks,
    inserted,
    updated,
    skipped,
    missing_files: missingFiles,
  };
}

export const MEMORY_TOOL_DEFINITIONS = [
  {
    name: "hev_memory_write",
    description: memoryDefT("write.description"),
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: memoryDefT("write.namespace"),
          default: "global",
        },
        content: {
          type: "string",
          description: memoryDefT("write.content"),
        },
        summary: {
          type: "string",
          description: memoryDefT("write.summary"),
        },
        source_provider: {
          type: "string",
          description: memoryDefT("write.sourceProvider"),
        },
        memory_type: {
          type: "string",
          enum: ["note", "fact", "policy", "task"],
          description: memoryDefT("write.memoryType"),
          default: "note",
        },
        importance: {
          type: "number",
          description: memoryDefT("write.importance"),
          default: 3,
          minimum: 1,
          maximum: 5,
        },
        pinned: {
          type: "boolean",
          description: memoryDefT("write.pinned"),
          default: false,
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: memoryDefT("write.tags"),
        },
        metadata: {
          type: "object",
          description: memoryDefT("write.metadata"),
        },
      },
      required: ["content"],
    },
    metadata: {
      category: "memory",
      subcategory: "write",
      priority: "high",
      complexity: "simple",
      useCases: [
        memoryDefT("write.useCases.storeMemory"),
        memoryDefT("write.useCases.sharedContext"),
      ],
      relatedTools: ["hev_memory_search", "hev_memory_update", "hev_memory_stats"],
      agentGuidance: memoryDefT("write.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["memory", "libsql", "shared-context", "write"],
    },
  },
  {
    name: "hev_memory_search",
    description: memoryDefT("search.description"),
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: memoryDefT("search.namespace"),
          default: "global",
        },
        query: {
          type: "string",
          description: memoryDefT("search.query"),
          default: "*",
        },
        source_provider: {
          type: "string",
          description: memoryDefT("search.sourceProvider"),
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: memoryDefT("search.tags"),
        },
        limit: {
          type: "number",
          description: memoryDefT("search.limit"),
          default: 20,
          minimum: 1,
          maximum: 200,
        },
        response_format: {
          type: "string",
          enum: ["json", "prompt_compact"],
          description: memoryDefT("search.responseFormat"),
          default: "prompt_compact",
        },
        budget_chars: {
          type: "number",
          description: memoryDefT("search.budgetChars"),
          default: 2200,
          minimum: 200,
          maximum: 12000,
        },
      },
    },
    metadata: {
      category: "memory",
      subcategory: "search",
      priority: "high",
      complexity: "simple",
      useCases: [
        memoryDefT("search.useCases.prefetchMemory"),
        memoryDefT("search.useCases.crossProviderContext"),
        memoryDefT("search.useCases.compactContext"),
      ],
      relatedTools: ["hev_memory_write", "hev_memory_stats"],
      agentGuidance: memoryDefT("search.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["memory", "libsql", "search"],
    },
  },
  {
    name: "hev_memory_update",
    description: memoryDefT("update.description"),
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: memoryDefT("update.id"),
        },
        content: {
          type: "string",
          description: memoryDefT("update.content"),
        },
        summary: {
          type: "string",
          description: memoryDefT("update.summary"),
        },
        source_provider: {
          type: "string",
          description: memoryDefT("update.sourceProvider"),
        },
        memory_type: {
          type: "string",
          enum: ["note", "fact", "policy", "task"],
          description: memoryDefT("update.memoryType"),
        },
        importance: {
          type: "number",
          description: memoryDefT("update.importance"),
          minimum: 1,
          maximum: 5,
        },
        pinned: {
          type: "boolean",
          description: memoryDefT("update.pinned"),
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: memoryDefT("update.tags"),
        },
        metadata: {
          type: "object",
          description: memoryDefT("update.metadata"),
        },
      },
      required: ["id"],
    },
    metadata: {
      category: "memory",
      subcategory: "update",
      priority: "medium",
      complexity: "simple",
      useCases: [
        memoryDefT("update.useCases.fixInformation"),
        memoryDefT("update.useCases.editTags"),
      ],
      relatedTools: ["hev_memory_search", "hev_memory_write"],
      agentGuidance: memoryDefT("update.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["memory", "update", "libsql"],
    },
  },
  {
    name: "hev_memory_delete",
    description: memoryDefT("delete.description"),
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: memoryDefT("delete.id"),
        },
      },
      required: ["id"],
    },
    metadata: {
      category: "memory",
      subcategory: "delete",
      priority: "medium",
      complexity: "simple",
      useCases: [memoryDefT("delete.useCases.cleanup")],
      relatedTools: ["hev_memory_search"],
      agentGuidance: memoryDefT("delete.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "medium",
      tags: ["memory", "delete", "libsql"],
    },
  },
  {
    name: "hev_memory_prune",
    description: memoryDefT("prune.description"),
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: memoryDefT("prune.namespace"),
          default: "global",
        },
        max_items: {
          type: "number",
          description: memoryDefT("prune.maxItems"),
          default: 500,
          minimum: 0,
        },
        older_than_days: {
          type: "number",
          description: memoryDefT("prune.olderThanDays"),
          minimum: 0,
        },
      },
    },
    metadata: {
      category: "memory",
      subcategory: "maintenance",
      priority: "medium",
      complexity: "simple",
      useCases: [
        memoryDefT("prune.useCases.controlBloat"),
        memoryDefT("prune.useCases.periodicCleanup"),
      ],
      relatedTools: ["hev_memory_stats", "hev_memory_search"],
      agentGuidance: memoryDefT("prune.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "medium",
      tags: ["memory", "prune", "maintenance"],
    },
  },
  {
    name: "hev_memory_stats",
    description: memoryDefT("stats.description"),
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: memoryDefT("stats.namespace"),
          default: "global",
        },
      },
    },
    metadata: {
      category: "memory",
      subcategory: "stats",
      priority: "low",
      complexity: "simple",
      useCases: [
        memoryDefT("stats.useCases.checkSize"),
        memoryDefT("stats.useCases.preMaintenance"),
      ],
      relatedTools: ["hev_memory_prune", "hev_memory_search"],
      agentGuidance: memoryDefT("stats.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["memory", "stats", "libsql"],
    },
  },
  {
    name: "hev_memory_bootstrap_policy",
    description: memoryDefT("bootstrap.description"),
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: memoryDefT("bootstrap.namespace"),
          default: "policy",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: memoryDefT("bootstrap.files"),
        },
        max_chunk_chars: {
          type: "number",
          description: memoryDefT("bootstrap.maxChunkChars"),
          default: 1400,
          minimum: 200,
          maximum: 6000,
        },
        force: {
          type: "boolean",
          description: memoryDefT("bootstrap.force"),
          default: false,
        },
      },
    },
    metadata: {
      category: "memory",
      subcategory: "bootstrap",
      priority: "high",
      complexity: "simple",
      useCases: [
        memoryDefT("bootstrap.useCases.pinRules"),
        memoryDefT("bootstrap.useCases.standardizePolicyContext"),
      ],
      relatedTools: ["hev_memory_search", "hev_memory_stats", "hev_memory_update"],
      agentGuidance: memoryDefT("bootstrap.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["memory", "policy", "bootstrap", "pinned"],
    },
  },
];
