// NOTE: Large file outputs can exceed LLM token limits.
// NOTE: Use streaming writes, checksums, and rollback to keep chunked writes safe.

import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { dirname } from "path";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";
import { createProgress } from "../utils/progress.js";
import { logToolError } from "../utils/mcp-logger.js";

interface ChunkMetadata {
  index: number;
  totalChunks: number;
  checksum: string;
  size: number;
  lineCount: number;
}

interface ChunkSession {
  sessionId: string;
  filePath: string;
  totalChunks: number;
  receivedChunks: number[];
  startTime: number;
  metadata: ChunkMetadata[];
}

// NOTE: Keep live sessions in memory until finalize or cancel completes.
const activeSessions = new Map<string, ChunkSession>();

function safeChunkT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.safeChunkTools.${key}`, params);
}

function safeChunkDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.safeChunkTools.definition.${key}`, params);
}

function calculateChecksum(content: string): string {
  return createHash("md5").update(content, "utf-8").digest("hex");
}

function validateUTF8(content: string): boolean {
  try {
    const buffer = Buffer.from(content, "utf-8");
    const decoded = buffer.toString("utf-8");
    return decoded === content;
  } catch {
    return false;
  }
}

function validateChunkBoundary(content: string): { valid: boolean; warning?: string } {
  // NOTE: Prefer newline-terminated chunks so split boundaries stay predictable.
  if (!content.endsWith("\n")) {
    return {
      valid: true,
      warning: safeChunkT("warnings.noTrailingNewline"),
    };
  }

  const lastChar = content.slice(-2, -1);
  const lastCharCode = lastChar.charCodeAt(0);

  // NOTE: Reject chunks that end halfway through a surrogate pair.
  if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
    return {
      valid: false,
      warning: safeChunkT("warnings.incompleteSurrogate"),
    };
  }

  return { valid: true };
}

// NOTE: Call order: start session -> write chunks -> finalize.
export function startChunkedSession(
  filePath: string,
  totalChunks: number,
  _projectRoot: string
): { success: boolean; sessionId: string; message: string } {
  const progress = createProgress({
    operation: safeChunkT("progress.startOperation"),
    quiet: true,
  });

  try {
    const sessionId = `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (totalChunks < 1 || totalChunks > 1000) {
      return {
        success: false,
        sessionId: "",
        message: safeChunkT("start.invalidTotalChunks"),
      };
    }

    const session: ChunkSession = {
      sessionId,
      filePath,
      totalChunks,
      receivedChunks: [],
      startTime: Date.now(),
      metadata: [],
    };

    activeSessions.set(sessionId, session);

    progress.done(safeChunkT("start.progressCreated", { sessionId }));

    return {
      success: true,
      sessionId,
      message: safeChunkT("start.success", { sessionId, filePath, totalChunks }),
    };
  } catch (error) {
    const err = error as Error;
    progress.fail(err.message);
    logToolError("hev_fs_start_chunked_session", err, { filePath, totalChunks });
    return {
      success: false,
      sessionId: "",
      message: safeChunkT("common.error", { message: err.message }),
    };
  }
}

export async function writeChunk(
  sessionId: string,
  chunkIndex: number,
  content: string,
  projectRoot: string
): Promise<{ success: boolean; message: string; warnings?: string[] }> {
  const progress = createProgress({
    operation: safeChunkT("progress.chunkOperation", { chunkIndex }),
    quiet: true,
  });

  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        message: safeChunkT("write.sessionNotFound", { sessionId }),
      };
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return {
        success: false,
        message: safeChunkT("write.invalidChunkIndex", {
          chunkIndex,
          maxIndex: session.totalChunks - 1,
        }),
      };
    }

    if (session.receivedChunks.includes(chunkIndex)) {
      return {
        success: false,
        message: safeChunkT("write.duplicateChunk", { chunkIndex }),
      };
    }

    const warnings: string[] = [];

    progress.update(1, safeChunkT("progress.validatingUtf8"));
    if (!validateUTF8(content)) {
      return {
        success: false,
        message: safeChunkT("write.invalidUtf8", { chunkIndex }),
      };
    }

    progress.update(2, safeChunkT("progress.checkingBoundary"));
    const boundaryCheck = validateChunkBoundary(content);
    if (!boundaryCheck.valid) {
      return {
        success: false,
        message: safeChunkT("write.boundaryError", {
          chunkIndex,
          warning: boundaryCheck.warning ?? safeChunkT("common.unknown"),
        }),
      };
    }
    if (boundaryCheck.warning != null && boundaryCheck.warning !== "") {
      warnings.push(boundaryCheck.warning);
    }

    progress.update(3, safeChunkT("progress.collectingMetadata"));
    const checksum = calculateChecksum(content);
    const size = Buffer.byteLength(content, "utf-8");
    const lineCount = content.split("\n").length - 1;

    const metadata: ChunkMetadata = {
      index: chunkIndex,
      totalChunks: session.totalChunks,
      checksum,
      size,
      lineCount,
    };

    progress.update(4, safeChunkT("progress.writingToDisk"));
    const tempDir = `${projectRoot}/.tmp_safe_chunks/${sessionId}`;
    await mkdir(tempDir, { recursive: true });

    const chunkPath = `${tempDir}/chunk_${String(chunkIndex).padStart(4, "0")}.tmp`;
    await writeFile(chunkPath, content, "utf-8");

    const readBack = await readFile(chunkPath, "utf-8");
    const readChecksum = calculateChecksum(readBack);

    if (readChecksum !== checksum) {
      return {
        success: false,
        message: safeChunkT("write.verificationFailed", {
          chunkIndex,
          expected: checksum,
          actual: readChecksum,
        }),
      };
    }

    session.receivedChunks.push(chunkIndex);
    session.metadata.push(metadata);

    progress.done(safeChunkT("write.progressDone", { size, lineCount }));

    const receivedCount = session.receivedChunks.length;
    const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i).filter(
      (i) => !session.receivedChunks.includes(i)
    );

    let message = safeChunkT("write.saved", {
      chunkIndex,
      sizeKB: (size / 1024).toFixed(1),
      lineCount,
      receivedCount,
      totalChunks: session.totalChunks,
      checksumShort: checksum.slice(0, 8),
    });

    if (missingChunks.length > 0) {
      message += `\n\n${safeChunkT("write.missingChunks", {
        chunks: missingChunks.slice(0, 10).join(", "),
      })}`;
      if (missingChunks.length > 10) {
        message += ` ${safeChunkT("write.moreMissingChunks", {
          count: missingChunks.length - 10,
        })}`;
      }
    } else {
      message += `\n\n${safeChunkT("write.allChunksReceived")}`;
    }

    return {
      success: true,
      message,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (error) {
    const err = error as Error;
    progress.fail(err.message);
    logToolError("hev_fs_write_chunk", err, { sessionId, chunkIndex });
    return { success: false, message: safeChunkT("common.error", { message: err.message }) };
  }
}

export async function finalizeChunked(
  sessionId: string,
  projectRoot: string,
  verifyChecksum?: string
): Promise<{ success: boolean; message: string; filePath?: string; totalSize?: number }> {
  const progress = createProgress({
    operation: safeChunkT("progress.finalizeOperation"),
    total: 100,
  });

  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        message: safeChunkT("finalize.sessionNotFound", { sessionId }),
      };
    }

    if (session.receivedChunks.length !== session.totalChunks) {
      const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i).filter(
        (i) => !session.receivedChunks.includes(i)
      );

      return {
        success: false,
        message: safeChunkT("finalize.missingChunks", {
          receivedCount: session.receivedChunks.length,
          totalChunks: session.totalChunks,
          missingChunks: missingChunks.join(", "),
        }),
      };
    }

    progress.log(safeChunkT("progress.allChunksReceivedMerging"));

    const tempDir = `${projectRoot}/.tmp_safe_chunks/${sessionId}`;
    const buffers: Buffer[] = [];
    let totalSize = 0;

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = `${tempDir}/chunk_${String(i).padStart(4, "0")}.tmp`;
      // eslint-disable-next-line no-await-in-loop
      const buffer = await readFile(chunkPath);
      buffers.push(buffer);
      totalSize += buffer.length;

      progress.update(
        Math.round(((i + 1) / session.totalChunks) * 80),
        safeChunkT("progress.chunkRead", { index: i + 1, totalChunks: session.totalChunks })
      );
    }

    progress.update(85, safeChunkT("progress.merging"));
    const fullBuffer = Buffer.concat(buffers, totalSize);
    const fullContent = fullBuffer.toString("utf-8");

    if (verifyChecksum != null && verifyChecksum !== "") {
      const actualChecksum = calculateChecksum(fullContent);
      if (actualChecksum !== verifyChecksum) {
        return {
          success: false,
          message: safeChunkT("finalize.checksumFailed", {
            expected: verifyChecksum,
            actual: actualChecksum,
          }),
        };
      }
      progress.log(safeChunkT("progress.checksumVerified"));
    }

    progress.update(90, safeChunkT("progress.creatingTargetDir"));
    const targetDir = dirname(session.filePath);
    await mkdir(targetDir, { recursive: true });

    progress.update(95, safeChunkT("progress.writingFinalFile"));
    await writeFile(session.filePath, fullContent, "utf-8");

    const finalCheck = await readFile(session.filePath, "utf-8");
    if (finalCheck !== fullContent) {
      return {
        success: false,
        message: safeChunkT("finalize.finalVerificationFailed"),
      };
    }

    progress.update(98, safeChunkT("progress.cleaningTempFiles"));

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = `${tempDir}/chunk_${String(i).padStart(4, "0")}.tmp`;
      try {
        // eslint-disable-next-line no-await-in-loop
        await unlink(chunkPath);
      } catch {
        // NOTE: Ignore temp cleanup failures after the final file is already durable.
      }
    }

    activeSessions.delete(sessionId);

    const duration = ((Date.now() - session.startTime) / 1000).toFixed(1);
    const lineCount = fullContent.split("\n").length - 1;

    progress.done(
      safeChunkT("finalize.progressDone", {
        sizeKB: (totalSize / 1024).toFixed(1),
        lineCount,
        duration,
      })
    );

    return {
      success: true,
      filePath: session.filePath,
      totalSize,
      message: safeChunkT("finalize.success", {
        filePath: session.filePath,
        sizeKB: (totalSize / 1024).toFixed(1),
        lineCount,
        totalChunks: session.totalChunks,
        duration,
        checksum: calculateChecksum(fullContent),
      }),
    };
  } catch (error) {
    const err = error as Error;
    progress.fail(err.message);
    logToolError("hev_fs_finalize_chunked", err, { sessionId });
    return { success: false, message: safeChunkT("common.error", { message: err.message }) };
  }
}

export function getSessionStatus(sessionId: string): {
  success: boolean;
  message: string;
  session?: {
    sessionId: string;
    filePath: string;
    totalChunks: number;
    receivedChunks: number;
    missingChunks: number;
    durationSeconds: number;
    progressPercent: number;
  };
} {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return {
      success: false,
      message: safeChunkT("status.sessionNotFound", {
        sessionId,
        activeSessions: activeSessions.size,
        ids:
          activeSessions.size > 0
            ? Array.from(activeSessions.keys()).join(", ")
            : safeChunkT("common.none"),
      }),
    };
  }

  const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i).filter(
    (i) => !session.receivedChunks.includes(i)
  );

  const duration = ((Date.now() - session.startTime) / 1000).toFixed(1);
  const progress = ((session.receivedChunks.length / session.totalChunks) * 100).toFixed(1);

  let message = safeChunkT("status.summary", {
    sessionId,
    filePath: session.filePath,
    receivedCount: session.receivedChunks.length,
    totalChunks: session.totalChunks,
    progress,
    duration,
  });

  if (missingChunks.length > 0) {
    message += safeChunkT("status.missingChunks", {
      chunks: missingChunks.slice(0, 20).join(", "),
    });
    if (missingChunks.length > 20) {
      message += ` ${safeChunkT("status.moreMissingChunks", {
        count: missingChunks.length - 20,
      })}`;
    }
  } else {
    message += safeChunkT("status.allChunksReceived");
  }

  return {
    success: true,
    message,
    session: {
      sessionId: session.sessionId,
      filePath: session.filePath,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks.length,
      missingChunks: missingChunks.length,
      durationSeconds: parseFloat(duration),
      progressPercent: parseFloat(progress),
    },
  };
}

export async function cancelSession(
  sessionId: string,
  projectRoot: string
): Promise<{ success: boolean; message: string }> {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return {
      success: false,
      message: safeChunkT("cancel.sessionNotFound", { sessionId }),
    };
  }

  try {
    const tempDir = `${projectRoot}/.tmp_safe_chunks/${sessionId}`;

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = `${tempDir}/chunk_${String(i).padStart(4, "0")}.tmp`;
      try {
        // eslint-disable-next-line no-await-in-loop
        await unlink(chunkPath);
      } catch {
        // NOTE: Ignore missing temp files during best-effort cleanup.
      }
    }

    activeSessions.delete(sessionId);

    return {
      success: true,
      message: safeChunkT("cancel.success", { sessionId }),
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_cancel_chunk_session", err, { sessionId });
    return { success: false, message: safeChunkT("common.error", { message: err.message }) };
  }
}

export const SAFE_CHUNK_TOOL_DEFINITIONS = [
  {
    name: "hev_fs_start_chunked_session",
    description: safeChunkDefT("start.description"),
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: safeChunkDefT("start.filePath"),
        },
        total_chunks: {
          type: "integer",
          description: safeChunkDefT("start.totalChunks"),
          minimum: 1,
          maximum: 1000,
        },
      },
      required: ["file_path", "total_chunks"],
    },
    metadata: {
      category: "filesystem",
      subcategory: "chunked-operations",
      priority: "high",
      complexity: "medium",
      useCases: [
        safeChunkDefT("start.useCases.largeFiles"),
        safeChunkDefT("start.useCases.tokenLimit"),
        safeChunkDefT("start.useCases.streaming"),
      ],
      relatedTools: [
        "hev_fs_write_chunk",
        "hev_fs_finalize_chunked",
        "hev_fs_chunk_session_status",
      ],
      agentGuidance: safeChunkDefT("start.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["chunked", "large-files", "session", "streaming", "safe-write"],
    },
  },
  {
    name: "hev_fs_write_chunk",
    description: safeChunkDefT("write.description"),
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: safeChunkDefT("common.sessionId"),
        },
        chunk_index: {
          type: "integer",
          description: safeChunkDefT("write.chunkIndex"),
          minimum: 0,
        },
        content: {
          type: "string",
          description: safeChunkDefT("write.content"),
        },
      },
      required: ["session_id", "chunk_index", "content"],
    },
    metadata: {
      category: "filesystem",
      subcategory: "chunked-operations",
      priority: "high",
      complexity: "simple",
      useCases: [
        safeChunkDefT("write.useCases.writeChunks"),
        safeChunkDefT("write.useCases.utf8Validation"),
        safeChunkDefT("write.useCases.chunkChecksum"),
      ],
      relatedTools: ["hev_fs_start_chunked_session", "hev_fs_finalize_chunked"],
      agentGuidance: safeChunkDefT("write.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["chunked", "validation", "write", "checksum", "utf8"],
    },
  },
  {
    name: "hev_fs_finalize_chunked",
    description: safeChunkDefT("finalize.description"),
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: safeChunkDefT("common.sessionId"),
        },
        verify_checksum: {
          type: "string",
          description: safeChunkDefT("finalize.verifyChecksum"),
        },
      },
      required: ["session_id"],
    },
    metadata: {
      category: "filesystem",
      subcategory: "chunked-operations",
      priority: "high",
      complexity: "simple",
      useCases: [
        safeChunkDefT("finalize.useCases.mergeChunks"),
        safeChunkDefT("finalize.useCases.completeSession"),
        safeChunkDefT("finalize.useCases.verifyIntegrity"),
      ],
      relatedTools: ["hev_fs_start_chunked_session", "hev_fs_write_chunk"],
      agentGuidance: safeChunkDefT("finalize.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["chunked", "finalize", "merge", "completion", "verification"],
    },
  },
  {
    name: "hev_fs_chunk_session_status",
    description: safeChunkDefT("status.description"),
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: safeChunkDefT("common.sessionId"),
        },
      },
      required: ["session_id"],
    },
    metadata: {
      category: "filesystem",
      subcategory: "chunked-operations",
      priority: "medium",
      complexity: "simple",
      useCases: [
        safeChunkDefT("status.useCases.checkProgress"),
        safeChunkDefT("status.useCases.identifyMissing"),
        safeChunkDefT("status.useCases.monitor"),
      ],
      relatedTools: ["hev_fs_write_chunk", "hev_fs_finalize_chunked"],
      agentGuidance: safeChunkDefT("status.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["chunked", "status", "monitoring", "progress", "debugging"],
    },
  },
  {
    name: "hev_fs_cancel_chunk_session",
    description: safeChunkDefT("cancel.description"),
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: safeChunkDefT("common.sessionId"),
        },
      },
      required: ["session_id"],
    },
    metadata: {
      category: "filesystem",
      subcategory: "chunked-operations",
      priority: "low",
      complexity: "simple",
      useCases: [
        safeChunkDefT("cancel.useCases.cancelSession"),
        safeChunkDefT("cancel.useCases.cleanTemp"),
        safeChunkDefT("cancel.useCases.abort"),
      ],
      relatedTools: ["hev_fs_start_chunked_session", "hev_fs_chunk_session_status"],
      agentGuidance: safeChunkDefT("cancel.agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["chunked", "cancel", "cleanup", "abort", "rollback"],
    },
  },
];

// NOTE: Auto-generated metadata for listTools().
export const SAFE_CHUNK_TOOL_METADATA = {
  category: "Filesystem",
  emoji: "📁",
  tools: SAFE_CHUNK_TOOL_DEFINITIONS.map((t) => t.name),
};
