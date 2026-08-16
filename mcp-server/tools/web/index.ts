export { webSearch } from "./search.js";
export { webFetchUrl } from "./fetch.js";

import { WEB_SEARCH_TOOL } from "./search.js";
import { WEB_FETCH_URL_TOOL } from "./fetch.js";

export const WEB_TOOL_DEFINITIONS = [WEB_SEARCH_TOOL, WEB_FETCH_URL_TOOL];

export const WEB_TOOL_METADATA = {
  category: "Web",
  emoji: "🌐",
  tools: WEB_TOOL_DEFINITIONS.map((t) => t.name),
};
