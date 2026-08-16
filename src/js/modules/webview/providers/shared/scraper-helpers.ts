export function normalizeText(str: string): string {
  if (str === "") return "";
  return str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashString(str: string): string {
  if (str === "") return "0";
  const normalized = normalizeText(str);
  if (normalized === "") return "0";
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) + hash + normalized.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16);
}
