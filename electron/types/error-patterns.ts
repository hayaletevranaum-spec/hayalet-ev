export interface ErrorHint {
  pattern: string;
  category: string;
  suggestion: string;
  checkFiles: string[];
  relatedDocs: string[];
  severity?: "low" | "medium" | "high" | "critical";
}

export interface MatchedHint {
  pattern: string;
  category: string;
  suggestion: string;
  checkFiles: string[];
  relatedDocs: string[];
  severity: "low" | "medium" | "high" | "critical";
}
