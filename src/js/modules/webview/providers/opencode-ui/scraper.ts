interface ScrapedMessage {
  index: number;
  role: "user" | "assistant";
  text: string;
}

export function scrapeMessages(): ScrapedMessage[] {
  function readMessageText(node: Element | null): string {
    if (!node) {
      return "";
    }

    const text = (node as HTMLElement).innerText.trim();
    if (text !== "") {
      return text;
    }

    return node.textContent.trim();
  }

  function scrapeLegacyMessages(): ScrapedMessage[] {
    const result: ScrapedMessage[] = [];
    let index = 0;
    const sessionTurns = document.querySelectorAll('[data-slot="session-turn-message-content"]');

    if (sessionTurns.length > 0) {
      sessionTurns.forEach((turn) => {
        const userText = readMessageText(
          turn.querySelector('[data-component="user-message"] [data-slot="user-message-text"]')
        );
        if (userText !== "") {
          result.push({ index: index++, role: "user", text: userText });
        }
      });

      document.querySelectorAll('[data-slot="session-turn-summary-section"]').forEach((summary) => {
        const assistantText = readMessageText(summary.querySelector('[data-component="markdown"]'));
        if (assistantText !== "") {
          result.push({ index: index++, role: "assistant", text: assistantText });
        }
      });

      return result;
    }

    document
      .querySelectorAll('[data-component="user-message"] [data-slot="user-message-text"]')
      .forEach((node) => {
        const userText = readMessageText(node);
        if (userText !== "") {
          result.push({ index: index++, role: "user", text: userText });
        }
      });

    document
      .querySelectorAll('[data-slot="session-turn-summary-section"] [data-component="markdown"]')
      .forEach((node) => {
        const assistantText = readMessageText(node);
        if (assistantText !== "") {
          result.push({ index: index++, role: "assistant", text: assistantText });
        }
      });

    return result;
  }

  const roots = Array.from(document.querySelectorAll(".ds-message"));
  if (roots.length === 0) {
    return scrapeLegacyMessages();
  }

  const result: ScrapedMessage[] = [];
  roots.forEach((root) => {
    const role = root.classList.contains("ds-message--assistant")
      ? "assistant"
      : root.classList.contains("ds-message--user")
        ? "user"
        : null;
    if (role === null) {
      return;
    }

    const bubble = root.querySelector(".ds-message__bubble") ?? root;
    const text = readMessageText(bubble);
    if (text === "") {
      return;
    }

    result.push({
      index: result.length,
      role,
      text,
    });
  });

  return result.length > 0 ? result : scrapeLegacyMessages();
}
