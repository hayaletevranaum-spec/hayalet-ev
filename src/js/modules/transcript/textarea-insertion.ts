export function insertTranscriptIntoTextarea(
  textarea: HTMLTextAreaElement,
  transcript: string
): void {
  const normalized = transcript.trim();
  if (normalized === "") {
    return;
  }

  const isFocused = document.activeElement === textarea;
  const selectionStart = isFocused ? textarea.selectionStart : textarea.value.length;
  const selectionEnd = isFocused ? textarea.selectionEnd : textarea.value.length;
  const before = textarea.value.slice(0, selectionStart);
  const after = textarea.value.slice(selectionEnd);
  const leadingBreak = before !== "" && !/[\s\n]$/.test(before) ? "\n" : "";
  const trailingBreak = after !== "" && !/^[\s\n]/.test(after) ? "\n" : "";
  const nextValue = `${before}${leadingBreak}${normalized}${trailingBreak}${after}`;
  const caret = (before + leadingBreak + normalized).length;

  textarea.value = nextValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(caret, caret);
}
