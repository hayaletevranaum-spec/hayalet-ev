import type { ErrorHint, MatchedHint } from "./types/error-patterns.ts";
export type { ErrorHint, MatchedHint } from "./types/error-patterns.ts";

const ERROR_PATTERNS: ErrorHint[] = [
  {
    pattern: "Cannot read propert(?:y|ies) ['\"]?click['\"]? of (?:null|undefined)",
    category: "dom-selector",
    suggestion:
      "The selector likely changed. Inspect the provider DOM and update the selectors in config.js.",
    checkFiles: [
      "src/js/modules/webview/providers/{provider}/config.ts",
      "src/js/modules/webview/providers/{provider}/index.js",
    ],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "Cannot read propert(?:y|ies) .* of (?:null|undefined)",
    category: "null-reference",
    suggestion:
      "A null/undefined access occurred. Use optional chaining (?.) or guard the value before access.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "querySelector.*returned null",
    category: "dom-selector",
    suggestion:
      "The DOM element was not found. Verify the selector and ensure the element has loaded.",
    checkFiles: ["src/js/modules/webview/providers/{provider}/config.ts"],
    relatedDocs: [],
    severity: "medium",
  },

  {
    pattern: "net::ERR_INTERNET_DISCONNECTED",
    category: "network",
    suggestion: "No internet connection was detected. Check network connectivity.",
    checkFiles: [],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "net::ERR_NAME_NOT_RESOLVED",
    category: "network",
    suggestion:
      "DNS resolution failed. Verify the domain name and confirm the DNS server is reachable.",
    checkFiles: ["src/js/modules/webview/providers/{provider}/config.ts"],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "net::ERR_CONNECTION_REFUSED",
    category: "network",
    suggestion: "The connection was refused. Check whether the target server is running.",
    checkFiles: [],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "net::ERR_CONNECTION_TIMED_OUT",
    category: "network",
    suggestion: "The connection timed out. Check network connectivity and server health.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "net::ERR_SSL",
    category: "network",
    suggestion: "An SSL/TLS error occurred. Verify certificate validity.",
    checkFiles: [],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "CORS",
    category: "network",
    suggestion:
      "A Cross-Origin Resource Sharing error occurred. CORS is usually not an issue in webviews, but external API calls still need attention.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },

  {
    pattern: "ipcRenderer\\.invoke.*timed out",
    category: "ipc",
    suggestion: "The IPC call timed out. Check whether the main process is responding.",
    checkFiles: ["electron/main.js", "electron/preload.cjs"],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "No handler registered for.*channel",
    category: "ipc",
    suggestion:
      "No handler is registered for the IPC channel. Check the ipcMain.handle() registration in the main process.",
    checkFiles: ["electron/main.js"],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "contextBridge.*not available",
    category: "ipc",
    suggestion: "contextBridge is unavailable. Ensure the preload script was loaded correctly.",
    checkFiles: ["electron/preload.cjs", "electron/webview-preload.cjs"],
    relatedDocs: [],
    severity: "critical",
  },

  {
    pattern: "ENOENT.*no such file",
    category: "filesystem",
    suggestion: "The file or directory was not found. Verify the path and confirm the file exists.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "EACCES.*permission denied",
    category: "filesystem",
    suggestion: "File access was denied. Check the file or directory permissions.",
    checkFiles: [],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "EEXIST.*file already exists",
    category: "filesystem",
    suggestion: "The file already exists. Consider overwriting it or using a different name.",
    checkFiles: [],
    relatedDocs: [],
    severity: "low",
  },

  {
    pattern: "ChatGPT.*session.*expired",
    category: "provider-auth",
    suggestion: "The ChatGPT session expired. Sign in again in the webview.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "Gemini.*quota.*exceeded",
    category: "provider-limit",
    suggestion: "The Gemini API quota was exceeded. Wait for recovery or use another account.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "rate.?limit",
    category: "provider-limit",
    suggestion: "A rate limit error occurred. Reduce request frequency or wait before retrying.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },

  {
    pattern: "out of memory|heap.*exceeded",
    category: "memory",
    suggestion: "Memory is exhausted. Restart the app or reduce memory usage.",
    checkFiles: [],
    relatedDocs: [],
    severity: "critical",
  },
  {
    pattern: "Maximum call stack size exceeded",
    category: "stack-overflow",
    suggestion: "An infinite loop or deep recursion is likely present. Inspect the control flow.",
    checkFiles: [],
    relatedDocs: [],
    severity: "critical",
  },

  {
    pattern: "Webview.*crashed",
    category: "webview-crash",
    suggestion: "The webview crashed. Reload the page or recreate the webview.",
    checkFiles: ["src/js/modules/webview-manager.js"],
    relatedDocs: [],
    severity: "critical",
  },
  {
    pattern: "did-fail-load",
    category: "webview-load",
    suggestion: "The webview failed to load the page. Verify the URL and network connection.",
    checkFiles: ["src/js/modules/webview/providers/{provider}/config.ts"],
    relatedDocs: [],
    severity: "high",
  },

  {
    pattern: "JSON\\.parse.*Unexpected token",
    category: "parse",
    suggestion: "A JSON parse error occurred. Make sure the input is valid JSON.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "SyntaxError.*Unexpected",
    category: "syntax",
    suggestion: "A JavaScript syntax error occurred. Review the code content.",
    checkFiles: [],
    relatedDocs: [],
    severity: "high",
  },

  {
    pattern: "Command.*timeout",
    category: "command",
    suggestion: "The command timed out. Check whether the webview is still responding.",
    checkFiles: ["src/js/modules/command-executor.js", "electron/command-manager.js"],
    relatedDocs: [],
    severity: "medium",
  },
  {
    pattern: "Job.*failed",
    category: "command",
    suggestion: "The job failed. Review the error details and the webview state.",
    checkFiles: ["src/js/modules/command-executor.js"],
    relatedDocs: [],
    severity: "medium",
  },

  {
    pattern: "Google.*auth.*failed|OAuth.*error",
    category: "googledrive",
    suggestion:
      "A Google Drive authentication error occurred. Refresh the credentials or reconnect the account.",
    checkFiles: ["electron/googledrive-manager.js"],
    relatedDocs: [],
    severity: "high",
  },
  {
    pattern: "Drive.*quota",
    category: "googledrive",
    suggestion: "Google Drive quota is full. Free up space or use another account.",
    checkFiles: [],
    relatedDocs: [],
    severity: "medium",
  },
];

export function matchErrorPattern(
  errorMessage: string | null | undefined,
  provider: string | null = null
): MatchedHint | null {
  if (typeof errorMessage !== "string" || errorMessage.length === 0) {
    return null;
  }

  for (const pattern of ERROR_PATTERNS) {
    const regex = new RegExp(pattern.pattern, "i");
    if (regex.test(errorMessage)) {
      const hint = { ...pattern };

      if (provider !== null && provider.length > 0) {
        hint.checkFiles = hint.checkFiles.map((f) => f.replace(/{provider}/g, provider));
        hint.relatedDocs = hint.relatedDocs.map((d) => d.replace(/{provider}/g, provider));
      }

      return {
        pattern: pattern.pattern,
        category: hint.category,
        suggestion: hint.suggestion,
        checkFiles: hint.checkFiles,
        relatedDocs: hint.relatedDocs,
        severity: hint.severity ?? "medium",
      };
    }
  }

  return null;
}

export { ERROR_PATTERNS };
