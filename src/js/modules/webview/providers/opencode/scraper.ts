interface ScrapedMessage {
  index: number;
  role: "user" | "assistant";
  text: string;
}

export function scrapeMessages(): ScrapedMessage[] {
  const result: ScrapedMessage[] = [];
  let index = 0;

  const userMessages = document.querySelectorAll(
    '[data-component="user-message"] [data-slot="user-message-text"]'
  );

  const assistantMessages = document.querySelectorAll(
    '[data-slot="session-turn-summary-section"] [data-component="markdown"]'
  );

  const sessionTurns = document.querySelectorAll('[data-slot="session-turn-message-content"]');

  if (sessionTurns.length > 0) {
    sessionTurns.forEach((turn) => {
      const userMsg = turn.querySelector(
        '[data-component="user-message"] [data-slot="user-message-text"]'
      );
      if (userMsg) {
        const text = (userMsg as HTMLElement).innerText.trim();
        if (text !== "") {
          result.push({ index: index++, role: "user", text });
        }
      }
    });

    const summaries = document.querySelectorAll('[data-slot="session-turn-summary-section"]');
    summaries.forEach((summary) => {
      const markdown = summary.querySelector('[data-component="markdown"]');
      if (markdown) {
        const text = (markdown as HTMLElement).innerText.trim();
        if (text !== "") {
          result.push({ index: index++, role: "assistant", text });
        }
      }
    });
  } else {
    // NOTE: Fallback: collect user and assistant messages separately.
    userMessages.forEach((node) => {
      const el = node as HTMLElement;
      const text = el.innerText.trim();
      if (text !== "") {
        result.push({ index: index++, role: "user", text });
      }
    });

    assistantMessages.forEach((node) => {
      const el = node as HTMLElement;
      const text = el.innerText.trim();
      if (text !== "") {
        result.push({ index: index++, role: "assistant", text });
      }
    });
  }

  return result;
}
