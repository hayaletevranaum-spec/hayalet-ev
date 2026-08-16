import { clearScreenDown, cursorTo } from "node:readline";

function repeat(char, count) {
  return count > 0 ? char.repeat(count) : "";
}

function pad(text, width) {
  if (text.length >= width) {
    return text.slice(0, Math.max(0, width - 1)) + (width > 0 ? "~" : "");
  }
  return text + repeat(" ", width - text.length);
}

function wrapLine(text, width) {
  if (width <= 0) return [""];
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (value === "") return [""];

  const words = value.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current !== "") lines.push(current);
  return lines;
}

function normalizeLines(lines, width, height) {
  const output = [];
  for (const line of lines) {
    output.push(...wrapLine(line, width));
  }
  if (output.length > height) {
    return output.slice(output.length - height);
  }
  return output;
}

export function renderDashboardFrame({
  sessionId,
  phase,
  phaseLabel = phase,
  userLabel = "USER",
  developerLabel = "DEV",
  userLines,
  developerLines,
  width = 120,
  height = 30,
}) {
  const safeWidth = Math.max(60, width);
  const safeHeight = Math.max(12, height);
  const gutter = 3;
  const paneWidth = Math.floor((safeWidth - gutter) / 2);
  const bodyHeight = safeHeight - 5;
  const leftHeader = pad(`${userLabel} ${phaseLabel}`, paneWidth);
  const rightHeader = pad(`${developerLabel} ${sessionId}`, paneWidth);
  const leftLines = normalizeLines(userLines, paneWidth, bodyHeight).map((line) => pad(line, paneWidth));
  const rightLines = normalizeLines(developerLines, paneWidth, bodyHeight).map((line) => pad(line, paneWidth));
  const totalRows = Math.max(leftLines.length, rightLines.length, bodyHeight);
  const rows = [];

  rows.push(pad(`Wrapper Session ${sessionId}`, safeWidth));
  rows.push(`${leftHeader} | ${rightHeader}`);
  rows.push(`${repeat("-", paneWidth)}-+-${repeat("-", paneWidth)}`);

  for (let index = 0; index < totalRows; index += 1) {
    rows.push(`${leftLines[index] ?? repeat(" ", paneWidth)} | ${rightLines[index] ?? repeat(" ", paneWidth)}`);
  }

  return rows.join("\n");
}

function isTruthyFlag(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function shouldUseInteractiveDashboard(stdout, env) {
  if (stdout?.isTTY !== true) return false;
  if (isTruthyFlag(env?.HAYALET_WRAPPER_PLAIN)) return false;
  if (isTruthyFlag(env?.HAYALET_WRAPPER_TUI)) return true;

  const term = String(env?.TERM ?? "").trim().toLowerCase();
  if (term === "" || term === "dumb") return false;

  const columns = Number(stdout.columns ?? 0);
  const rows = Number(stdout.rows ?? 0);
  return Number.isFinite(columns) && Number.isFinite(rows) && columns > 0 && rows > 0;
}

/**
 * @param {{
 *   stdout?: any;
 *   env?: any;
 *   sessionId?: string;
 *   enabled?: boolean;
 *   userLabel?: string;
 *   developerLabel?: string;
 *   formatPhaseLabel?: (phase: string) => string;
 * }} [options]
 */
export function createWrapperDashboard({
  stdout = process.stdout,
  env = process.env,
  sessionId = "wrapper",
  enabled = true,
  userLabel = "USER",
  developerLabel = "DEV",
  formatPhaseLabel = undefined,
} = {}) {
  const tty = enabled === true && shouldUseInteractiveDashboard(stdout, env);
  const userLines = [];
  const developerLines = [];
  let phase = "idle";
  let attached = false;
  let preserveLastFrame = true;
  let renderTimer = null;

  function prune(lines) {
    if (lines.length > 400) {
      lines.splice(0, lines.length - 400);
    }
  }

  function render() {
    if (!tty || !attached) return;
    const frame = renderDashboardFrame({
      sessionId,
      phase,
      phaseLabel: typeof formatPhaseLabel === "function" ? formatPhaseLabel(phase) : phase,
      userLabel,
      developerLabel,
      userLines,
      developerLines,
      width: stdout.columns ?? 120,
      height: stdout.rows ?? 30,
    });
    cursorTo(stdout, 0, 0);
    clearScreenDown(stdout);
    stdout.write(frame);
  }

  function cancelScheduledRender() {
    if (renderTimer === null) return;
    clearTimeout(renderTimer);
    renderTimer = null;
  }

  function scheduleRender({ immediate = false } = {}) {
    if (!tty || !attached) return;
    if (immediate) {
      cancelScheduledRender();
      render();
      return;
    }
    if (renderTimer !== null) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 16);
    renderTimer.unref?.();
  }

  function attach() {
    if (!tty || attached) return;
    attached = true;
    stdout.write("\u001b[?25l");
    render();
  }

  function dispose(options = {}) {
    preserveLastFrame = options.preserveLastFrame !== false;
    if (tty && attached) {
      if (preserveLastFrame) {
        cancelScheduledRender();
        render();
        stdout.write("\u001b[?25h");
        stdout.write("\n");
      } else {
        cancelScheduledRender();
        cursorTo(stdout, 0, 0);
        clearScreenDown(stdout);
        stdout.write("\u001b[?25h");
      }
      attached = false;
    }
  }

  function push(lines, label, message) {
    if (typeof message !== "string" || message.trim() === "") return;
    lines.push(message.trim());
    prune(lines);
    if (!tty) {
      stdout.write(`[${label}] ${message.trim()}\n`);
      return;
    }
    scheduleRender();
  }

  return {
    attach,
    dispose,
    setPhase(nextPhase) {
      phase = nextPhase;
      scheduleRender({ immediate: true });
    },
    user(message) {
      push(userLines, "user", message);
    },
    developer(message) {
      push(developerLines, "dev", message);
    },
  };
}
