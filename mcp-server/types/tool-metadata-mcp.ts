export type ToolCategory =
  | "core"
  | "filesystem"
  | "development"
  | "electron"
  | "debug"
  | "git"
  | "web"
  | "workflow"
  | "context"
  | "memory"
  | "provider"
  | "ui";

export type ToolPriority = "critical" | "high" | "medium" | "low";

export type ToolComplexity = "simple" | "medium" | "complex";

export interface WorkflowStep {
  step: number;
  tool: string;
  purpose: string;
  mandatory?: boolean;
  condition?: string;
  params?: Record<string, unknown>;
}

export interface ToolExample {
  title: string;
  description: string;
  code: string;
  output?: string;
}

export interface ToolMetadata {
  category: ToolCategory;
  subcategory?: string;

  priority: ToolPriority;
  complexity: ToolComplexity;

  useCases: string[];
  relatedTools?: string[];
  workflow?: WorkflowStep[];

  examples?: ToolExample[];
  agentGuidance?: string;

  requiresConfirmation?: boolean;
  riskLevel?: "low" | "medium" | "high";

  deprecated?: boolean;
  deprecationMessage?: string;
  tags?: string[];

  estimatedIterations?: number;
  usageCount?: number;
}

export interface EnhancedToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  metadata: ToolMetadata;
}

export interface WorkflowScenario {
  id: string;
  name: string;
  description: string;
  tools: WorkflowStep[];
  estimatedIterations: number;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  tags: string[];
}

export interface ToolDiscoveryResult {
  recommended: Array<{
    tool: string;
    priority: number;
    reason: string;
    metadata?: ToolMetadata;
  }>;
  workflow?: string;
  relatedScenarios?: string[];
}
