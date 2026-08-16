export { config } from "./config.js";
export * from "./scraper.js";

export { sendMessage } from "../../methods/message/injection.js";
export { sendMessage as sendMessage_xdotools } from "../../methods/message/xdotools.js";

export { attachFiles as attachFiles_dragdrop } from "../../methods/file/dragdrop.js";
export { attachFiles as attachFiles_injection } from "../../methods/file/injection.js";
export { attachFiles as attachFiles_xdotools } from "../../methods/file/xdotools.js";
export { attachFiles as attachFiles_uguu } from "../../methods/file/uguu.js";
export { attachFiles as attachFiles_tmpfile } from "../../methods/file/tmpfile.js";
export { attachFiles as attachFiles_catbox } from "../../methods/file/catbox.js";
export { attachFiles as attachFiles_googledrive } from "../../methods/file/googledrive.js";
