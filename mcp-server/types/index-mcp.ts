export * from "./tool-metadata-mcp.js";

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface CDPConnection {
  ws: WebSocket | null;
  connected: boolean;
  messageId: number;
  pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >;
}

export interface CDPResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  method?: string;
  params?: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export type ToolArgs = Record<string, unknown>;

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  source?: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogSession {
  id: string;
  startTime: string;
  endTime?: string;
  entries: LogEntry[];
}

export interface ProviderInfo {
  name: string;
  url: string;
  active: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  lineCount: number;
  isCollapsed: boolean;
  error?: string;
}

export interface CodeChunk {
  startLine: number;
  endLine: number;
  content: string;
  symbol?: string;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export interface GrepResult {
  pattern: string;
  matches: GrepMatch[];
  totalMatches: number;
  filesSearched: number;
}

export interface FolderEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  children?: FolderEntry[];
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  pid?: number;
  timedOut?: boolean;
}

export interface ReplaceResult {
  file: string;
  replacements: number;
  success: boolean;
  error?: string;
  preview?: string;
  contextPreview?: string;
}

export interface CodeSnippet {
  startLine: number;
  endLine: number;
  code: string;
}

export interface FileChange {
  filePath: string;
  descriptionOfChange: string;
  clarifyingQuestionIfAny?: string;
  codeSnippetsToChange?: CodeSnippet[];
}

export interface LogicalChange {
  summary: string;
  filesToChange: FileChange[];
}

export interface TechnicalPlan {
  logicalChanges: LogicalChange[];
}

export interface CodeStructure {
  type: "function" | "class" | "method" | "interface" | "type" | "const" | "variable";
  name: string;
  startLine: number;
  endLine: number;
  signature?: string;
  children?: CodeStructure[];
}
