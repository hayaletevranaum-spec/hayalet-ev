import { readFile, writeFile, unlink, readdir, stat, mkdir, rename, access } from "fs/promises";
import { dirname, join } from "path";
import { logToolError } from "../../../utils/mcp-logger.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../../utils/i18n/index.js";
import type { ToolResult } from "../../../types/index-mcp.js";
import type { TranslationParams } from "../../../../src/types/i18n.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

function fsT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.fs.${key}`, params);
}

const fsToolDefinitionTranslator = createMcpTranslatorSync();

function fsToolDefinitionT(key: string, params?: TranslationParams): string {
  return fsToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.${key}`, params);
}

export interface ReadFileOptions {
  file_path: string;
  head?: number;
  tail?: number;
  start_line?: number;
  end_line?: number;
  encoding?: "utf8" | "base64" | "latin1";
}

export interface WriteFileOptions {
  file_path: string;
  content: string;
  overwrite?: boolean;
  encoding?: "utf8" | "base64" | "latin1";
}

export interface ListDirectoryOptions {
  path: string;
  max_depth?: number;
  include_hidden?: boolean;
}

export interface DeleteFileOptions {
  file_path: string;
  recursive?: boolean;
}

export interface MoveFileOptions {
  source: string;
  destination: string;
  overwrite?: boolean;
}

export interface DirectoryEntry {
  name: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modified: string;
}

// NOTE: Block path traversal attempts.
function validatePath(filePath: string): { valid: boolean; errorKey?: string } {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.includes("../") || normalized.includes("..\\")) {
    return {
      valid: false,
      errorKey: "errors.pathTraversalDetected",
    };
  }

  if (normalized.startsWith("/") && normalized.length > 1) {
    return { valid: true };
  }

  return { valid: true };
}

export async function readFileContent(options: ReadFileOptions): Promise<ToolResult> {
  const {
    file_path: filePath,
    head,
    tail,
    start_line: startLine,
    end_line: endLine,
    encoding = "utf8",
  } = options;
  const t = await createMcpTranslator();

  const validation = validatePath(filePath);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${fsT(t, validation.errorKey ?? "errors.pathValidationFailed")}`,
        },
      ],
      isError: true,
    };
  }

  const effectiveStart =
    startLine ??
    (head !== undefined && head > 0 && tail !== undefined && tail > 0 ? head : undefined);
  const effectiveEnd =
    endLine ??
    (head !== undefined && head > 0 && tail !== undefined && tail > 0 ? tail : undefined);
  const hasHead = head !== undefined && head > 0 && effectiveStart === undefined;
  const hasTail = tail !== undefined && tail > 0 && effectiveEnd === undefined;
  const isRangeMode =
    effectiveStart !== undefined &&
    effectiveStart > 0 &&
    effectiveEnd !== undefined &&
    effectiveEnd > 0;

  try {
    try {
      await access(filePath);
    } catch {
      return {
        content: [{ type: "text", text: fsT(t, "read.fileNotFound", { filePath }) }],
        isError: true,
      };
    }

    const content = await readFile(filePath, encoding);
    const lines = content.split("\n");
    const totalLines = lines.length;

    let displayContent: string;
    let rangeInfo = "";

    if (isRangeMode) {
      const startLine = Math.max(1, effectiveStart);
      const endLine = Math.min(effectiveEnd, totalLines);
      if (startLine > endLine) {
        return {
          content: [
            {
              type: "text",
              text: fsT(t, "read.invalidRange", { startLine, endLine }),
            },
          ],
          isError: true,
        };
      }
      displayContent = lines.slice(startLine - 1, endLine).join("\n");
      rangeInfo = fsT(t, "read.rangeInfoRange", {
        startLine,
        endLine,
        totalLines,
      });
    } else if (hasHead) {
      const endLine = Math.min(head, totalLines);
      displayContent = lines.slice(0, endLine).join("\n");
      rangeInfo = fsT(t, "read.rangeInfoHead", { count: endLine, totalLines });
    } else if (hasTail) {
      const startLine = Math.max(0, totalLines - tail);
      displayContent = lines.slice(startLine).join("\n");
      rangeInfo = fsT(t, "read.rangeInfoTail", {
        count: totalLines - startLine,
        totalLines,
      });
    } else {
      displayContent = content;
      rangeInfo = fsT(t, "read.rangeInfoAll", { totalLines });
    }

    const numberedContent = addLineNumbers(
      displayContent,
      isRangeMode
        ? Math.max(1, effectiveStart)
        : hasHead
          ? 1
          : hasTail
            ? totalLines - displayContent.split("\n").length + 1
            : 1
    );

    const output = [
      fsT(t, "read.header", { filePath, rangeInfo }),
      "",
      "─".repeat(60),
      numberedContent,
      "─".repeat(60),
    ].join("\n");

    return {
      content: [{ type: "text", text: output }],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_read", err, {
      file_path: filePath,
      start_line: startLine,
      end_line: endLine,
      head,
      tail,
    });
    return {
      content: [{ type: "text", text: fsT(t, "read.readError", { message: err.message }) }],
      isError: true,
    };
  }
}

function addLineNumbers(content: string, startLine = 1): string {
  const lines = content.split("\n");
  return lines
    .map((line, index) => {
      const lineNum = String(startLine + index).padStart(4, " ");
      return `${lineNum} │ ${line}`;
    })
    .join("\n");
}

export async function writeFileContent(options: WriteFileOptions): Promise<ToolResult> {
  const { file_path: filePath, content, overwrite = false, encoding = "utf8" } = options;
  const t = await createMcpTranslator();

  const validation = validatePath(filePath);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${fsT(t, validation.errorKey ?? "errors.pathValidationFailed")}`,
        },
      ],
      isError: true,
    };
  }

  try {
    if (!overwrite) {
      try {
        await access(filePath);
        return {
          content: [
            {
              type: "text",
              text: `${fsT(t, "write.fileExists", { filePath })}\n\n${fsT(t, "common.overwriteHint")}`,
            },
          ],
          isError: true,
        };
      } catch {}
    }

    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    await writeFile(filePath, content, encoding);

    const byteLength = Buffer.byteLength(content, encoding);
    const lineCount = content.split("\n").length;

    return {
      content: [
        {
          type: "text",
          text: `${fsT(t, "write.success", { filePath })}\n${fsT(t, "write.stats", {
            lineCount,
            byteLength,
          })}`,
        },
      ],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_write", err, { file_path: filePath, encoding });
    return {
      content: [{ type: "text", text: fsT(t, "write.writeError", { message: err.message }) }],
      isError: true,
    };
  }
}

export async function listDirectory(options: ListDirectoryOptions): Promise<ToolResult> {
  const { path: dirPath, max_depth: maxDepth = 1, include_hidden: includeHidden = false } = options;
  const t = await createMcpTranslator();

  const validation = validatePath(dirPath);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${fsT(t, validation.errorKey ?? "errors.pathValidationFailed")}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) {
      return {
        content: [{ type: "text", text: fsT(t, "list.notDirectory", { path: dirPath }) }],
        isError: true,
      };
    }

    const entries = await readDirectoryRecursive(dirPath, maxDepth, includeHidden);

    const output = formatDirectoryListing(dirPath, entries, maxDepth, t);

    return {
      content: [{ type: "text", text: output }],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_list", err, { dirPath, max_depth: maxDepth });
    return {
      content: [{ type: "text", text: fsT(t, "list.listError", { message: err.message }) }],
      isError: true,
    };
  }
}

async function readDirectoryRecursive(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean,
  currentDepth = 0
): Promise<Array<{ entry: DirectoryEntry; depth: number }>> {
  const results: Array<{ entry: DirectoryEntry; depth: number }> = [];

  const items = await readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (!includeHidden && item.name.startsWith(".")) {
      continue;
    }

    const fullPath = join(dirPath, item.name);
    // eslint-disable-next-line no-await-in-loop
    const stats = await stat(fullPath);

    const entry: DirectoryEntry = {
      name: item.name,
      type: item.isDirectory() ? "directory" : item.isSymbolicLink() ? "symlink" : "file",
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };

    results.push({ entry, depth: currentDepth });

    if (item.isDirectory() && currentDepth < maxDepth - 1) {
      // eslint-disable-next-line no-await-in-loop
      const subResults = await readDirectoryRecursive(
        fullPath,
        maxDepth,
        includeHidden,
        currentDepth + 1
      );
      results.push(...subResults);
    }
  }

  return results;
}

function formatDirectoryListing(
  rootPath: string,
  entries: Array<{ entry: DirectoryEntry; depth: number }>,
  maxDepth: number,
  t: McpTranslator
): string {
  const header =
    maxDepth > 1
      ? fsT(t, "list.headerWithDepth", { path: rootPath, depth: maxDepth })
      : fsT(t, "list.header", { path: rootPath });
  const lines: string[] = [header, ""];

  let fileCount = 0;
  let dirCount = 0;

  for (const { entry, depth } of entries) {
    const indent = "  ".repeat(depth);
    const icon = entry.type === "directory" ? "📂" : entry.type === "symlink" ? "🔗" : "📄";
    const size = entry.type === "file" ? formatBytes(entry.size) : "";

    lines.push(`${indent}${icon} ${entry.name} ${size}`);

    if (entry.type === "directory") dirCount++;
    else fileCount++;
  }

  lines.push("");
  lines.push(`─`.repeat(60));
  lines.push(fsT(t, "list.summary", { fileCount, dirCount }));

  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function deleteFile(options: DeleteFileOptions): Promise<ToolResult> {
  const { file_path: filePath, recursive = false } = options;
  const t = await createMcpTranslator();

  const validation = validatePath(filePath);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${fsT(t, validation.errorKey ?? "errors.pathValidationFailed")}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const stats = await stat(filePath);
    const isDir = stats.isDirectory();

    if (isDir && !recursive) {
      return {
        content: [
          {
            type: "text",
            text: `${fsT(t, "delete.directoryRequiresRecursive", { filePath })}\n\n${fsT(t, "delete.recursiveHint")}`,
          },
        ],
        isError: true,
      };
    }

    if (isDir && recursive) {
      const { rm } = await import("fs/promises");
      await rm(filePath, { recursive: true });
    } else {
      await unlink(filePath);
    }

    return {
      content: [
        {
          type: "text",
          text: fsT(t, "delete.success", {
            filePath,
            suffix: isDir ? fsT(t, "delete.directorySuffix") : "",
          }),
        },
      ],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_delete", err, { file_path: filePath, recursive });
    return {
      content: [{ type: "text", text: fsT(t, "delete.deleteError", { message: err.message }) }],
      isError: true,
    };
  }
}

export async function moveFile(options: MoveFileOptions): Promise<ToolResult> {
  const { source, destination, overwrite = false } = options;
  const t = await createMcpTranslator();

  const sourceValidation = validatePath(source);
  if (!sourceValidation.valid) {
    return {
      content: [
        {
          type: "text",
          text: fsT(t, "move.sourcePathInvalid", {
            message: fsT(t, sourceValidation.errorKey ?? "errors.pathValidationFailed"),
          }),
        },
      ],
      isError: true,
    };
  }

  const destValidation = validatePath(destination);
  if (!destValidation.valid) {
    return {
      content: [
        {
          type: "text",
          text: fsT(t, "move.destinationPathInvalid", {
            message: fsT(t, destValidation.errorKey ?? "errors.pathValidationFailed"),
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    try {
      await access(source);
    } catch {
      return {
        content: [{ type: "text", text: fsT(t, "move.sourceNotFound", { source }) }],
        isError: true,
      };
    }

    if (!overwrite) {
      try {
        await access(destination);
        return {
          content: [
            {
              type: "text",
              text: `${fsT(t, "move.destinationExists", { destination })}\n\n${fsT(t, "common.overwriteHint")}`,
            },
          ],
          isError: true,
        };
      } catch {}
    }

    const destDir = dirname(destination);
    await mkdir(destDir, { recursive: true });

    await rename(source, destination);

    return {
      content: [
        {
          type: "text",
          text: fsT(t, "move.success", { source, destination }),
        },
      ],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_move", err, { source, destination });
    return {
      content: [{ type: "text", text: fsT(t, "move.moveError", { message: err.message }) }],
      isError: true,
    };
  }
}

export const READ_FILE_TOOL = {
  name: "hev_fs_read",
  description: fsToolDefinitionT("read.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string",
        description: fsToolDefinitionT("read.filePath"),
      },
      start_line: {
        type: "integer",
        description: fsToolDefinitionT("read.startLine"),
        minimum: 1,
      },
      end_line: {
        type: "integer",
        description: fsToolDefinitionT("read.endLine"),
        minimum: 1,
      },
      head: {
        type: "integer",
        description: fsToolDefinitionT("read.head"),
        minimum: 0,
      },
      tail: {
        type: "integer",
        description: fsToolDefinitionT("read.tail"),
        minimum: 0,
      },
      encoding: {
        type: "string",
        enum: ["utf8", "base64", "latin1"],
        description: fsToolDefinitionT("read.encoding"),
        default: "utf8",
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "high",
    complexity: "simple",
    useCases: [
      fsToolDefinitionT("read.useCases.viewFileContent"),
      fsToolDefinitionT("read.useCases.readLogFiles"),
      fsToolDefinitionT("read.useCases.readLargeFileSections"),
    ],
    relatedTools: ["hev_fs_write", "hev_fs_expand_code_chunks"],
    agentGuidance: fsToolDefinitionT("read.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["file", "read", "content", "start_line", "end_line", "head", "tail"],
  },
};

export const WRITE_FILE_TOOL = {
  name: "hev_fs_write",
  description: fsToolDefinitionT("write.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string",
        description: fsToolDefinitionT("write.filePath"),
      },
      content: {
        type: "string",
        description: fsToolDefinitionT("write.content"),
      },
      overwrite: {
        type: "boolean",
        description: fsToolDefinitionT("write.overwrite"),
        default: false,
      },
      encoding: {
        type: "string",
        enum: ["utf8", "base64", "latin1"],
        description: fsToolDefinitionT("write.encoding"),
        default: "utf8",
      },
    },
    required: ["file_path", "content"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "high",
    complexity: "simple",
    useCases: [
      fsToolDefinitionT("write.useCases.createFiles"),
      fsToolDefinitionT("write.useCases.overwriteFiles"),
      fsToolDefinitionT("write.useCases.writeConfigFiles"),
    ],
    relatedTools: ["hev_fs_read", "hev_fs_edit"],
    agentGuidance: fsToolDefinitionT("write.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["file", "write", "create", "overwrite"],
  },
};

export const LIST_DIRECTORY_TOOL = {
  name: "hev_fs_list",
  description: fsToolDefinitionT("list.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: fsToolDefinitionT("list.path"),
      },
      max_depth: {
        type: "integer",
        description: fsToolDefinitionT("list.maxDepth"),
        default: 1,
        minimum: 1,
        maximum: 5,
      },
      include_hidden: {
        type: "boolean",
        description: fsToolDefinitionT("list.includeHidden"),
        default: false,
      },
    },
    required: ["path"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "high",
    complexity: "simple",
    useCases: [
      fsToolDefinitionT("list.useCases.exploreDirectoryStructure"),
      fsToolDefinitionT("list.useCases.getFileLists"),
      fsToolDefinitionT("list.useCases.inspectProjectStructure"),
    ],
    relatedTools: ["hev_fs_read", "hev_fs_edit"],
    agentGuidance: fsToolDefinitionT("list.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["directory", "list", "ls", "folder"],
  },
};

export const DELETE_FILE_TOOL = {
  name: "hev_fs_delete",
  description: fsToolDefinitionT("delete.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string",
        description: fsToolDefinitionT("delete.filePath"),
      },
      recursive: {
        type: "boolean",
        description: fsToolDefinitionT("delete.recursive"),
        default: false,
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "medium",
    complexity: "simple",
    useCases: [
      fsToolDefinitionT("delete.useCases.deleteFiles"),
      fsToolDefinitionT("delete.useCases.deleteEmptyDirectories"),
      fsToolDefinitionT("delete.useCases.deleteDirectoriesRecursively"),
    ],
    relatedTools: ["hev_fs_list", "hev_fs_move"],
    agentGuidance: fsToolDefinitionT("delete.agentGuidance"),
    requiresConfirmation: true,
    riskLevel: "high",
    tags: ["file", "delete", "remove", "rm"],
  },
};

export const MOVE_FILE_TOOL = {
  name: "hev_fs_move",
  description: fsToolDefinitionT("move.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      source: {
        type: "string",
        description: fsToolDefinitionT("move.source"),
      },
      destination: {
        type: "string",
        description: fsToolDefinitionT("move.destination"),
      },
      overwrite: {
        type: "boolean",
        description: fsToolDefinitionT("move.overwrite"),
        default: false,
      },
    },
    required: ["source", "destination"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "medium",
    complexity: "simple",
    useCases: [
      fsToolDefinitionT("move.useCases.moveFiles"),
      fsToolDefinitionT("move.useCases.renameFiles"),
      fsToolDefinitionT("move.useCases.moveDirectories"),
    ],
    relatedTools: ["hev_fs_write", "hev_fs_delete"],
    agentGuidance: fsToolDefinitionT("move.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["file", "move", "rename", "mv"],
  },
};
