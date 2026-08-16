// NOTE: Preload loads /js/app.js; implementation lives in ./app to keep the preload path stable.
import "./app/index.js";

// NOTE: Re-export the public API for backward compatibility.
export { showPage, getCurrentPage } from "./app/index.js";
