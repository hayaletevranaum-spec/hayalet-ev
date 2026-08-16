export { editLines, LINE_EDITOR_TOOL } from "./line-editor.js";
export { lintFile, LINTER_TOOL } from "./linter.js";
export { lintProject, LINT_PROJECT_TOOL } from "./eslint-project.js";
export { generateEslintDashboard, ESLINT_DASHBOARD_TOOL } from "./eslint-dashboard.js";
export { searchSymbol, SYMBOL_SEARCHER_TOOL } from "./symbol-searcher.js";
export { testRun, TEST_RUNNER_TOOL } from "./test-runner.js";
export { checkSyntax, SYNTAX_CHECKER_TOOL } from "./syntax-checker.js";
export { fixTypescriptErrors, TYPESCRIPT_BATCH_FIXER_TOOL } from "./typescript-batch-fixer.js";
export { generateTypescriptDashboard, TYPESCRIPT_DASHBOARD_TOOL } from "./typescript-dashboard.js";
export { analyzeTypeConflicts, TYPESCRIPT_TYPE_HELPER_TOOL } from "./typescript-type-helper.js";
export { safelyRefactorCode, SAFE_BATCH_REFACTOR_TOOL } from "./safe-batch-refactor.js";
export { smartInsertCode, SMART_SEARCH_INSERT_TOOL } from "./smart-search-insert.js";
export { analyzeScopeImpact, validateBracketBalance } from "./scope-validator.js";
export {
  tsGetTypeInfo,
  tsGetDefinition,
  tsGetReferences,
  tsGetDiagnostics,
  TS_TYPE_INFO_TOOL,
  TS_GO_TO_DEFINITION_TOOL,
  TS_FIND_REFERENCES_TOOL,
  TS_DIAGNOSTICS_TOOL,
  TS_LANGUAGE_TOOL_DEFINITIONS,
} from "./ts-language-tools.js";

import { LINE_EDITOR_TOOL } from "./line-editor.js";
import { LINTER_TOOL } from "./linter.js";
import { LINT_PROJECT_TOOL } from "./eslint-project.js";
import { ESLINT_DASHBOARD_TOOL } from "./eslint-dashboard.js";
import { SYMBOL_SEARCHER_TOOL } from "./symbol-searcher.js";
import { TEST_RUNNER_TOOL } from "./test-runner.js";
import { SYNTAX_CHECKER_TOOL } from "./syntax-checker.js";
import { TYPESCRIPT_BATCH_FIXER_TOOL } from "./typescript-batch-fixer.js";
import { TYPESCRIPT_DASHBOARD_TOOL } from "./typescript-dashboard.js";
import { TYPESCRIPT_TYPE_HELPER_TOOL } from "./typescript-type-helper.js";
import { SAFE_BATCH_REFACTOR_TOOL } from "./safe-batch-refactor.js";
import { SMART_SEARCH_INSERT_TOOL } from "./smart-search-insert.js";
import { TS_LANGUAGE_TOOL_DEFINITIONS } from "./ts-language-tools.js";

export const DEV_TOOL_DEFINITIONS = [
  LINE_EDITOR_TOOL,
  LINTER_TOOL,
  LINT_PROJECT_TOOL,
  ESLINT_DASHBOARD_TOOL,
  SYMBOL_SEARCHER_TOOL,
  TEST_RUNNER_TOOL,
  SYNTAX_CHECKER_TOOL,
  TYPESCRIPT_BATCH_FIXER_TOOL,
  TYPESCRIPT_DASHBOARD_TOOL,
  TYPESCRIPT_TYPE_HELPER_TOOL,
  SAFE_BATCH_REFACTOR_TOOL,
  SMART_SEARCH_INSERT_TOOL,
  ...TS_LANGUAGE_TOOL_DEFINITIONS,
];

export const DEV_TOOL_METADATA = {
  category: "Development",
  emoji: "🔧",
  tools: DEV_TOOL_DEFINITIONS.map((t) => t.name),
};
