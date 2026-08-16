import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { initPaths } from "../electron/paths.ts";
import { Us1RelayServer } from "../electron/us1-relay-server/server.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const electronDir = fileURLToPath(new URL("../electron", import.meta.url));

initPaths(electronDir);

const rawHost = process.env["US1_RELAY_HOST"]?.trim();
const host = rawHost !== undefined && rawHost !== "" ? rawHost : "0.0.0.0";
const port = Number.parseInt(process.env["US1_RELAY_PORT"] ?? "47831", 10);
const relayRoot = process.env["US1_RELAY_ROOT"]?.trim();

const relayServer = new Us1RelayServer(typeof relayRoot === "string" && relayRoot !== "" ? relayRoot : undefined);
const listener = relayServer.createListener();

listener.listen(port, host, () => {
  const address = listener.address();
  const location =
    address !== null && typeof address === "object" ? `${address.address}:${address.port}` : `${host}:${port}`;
  console.info(`[us1-relay] listening on ${location}`);
  console.info(`[us1-relay] cwd=${process.cwd()}`);
  console.info(`[us1-relay] scriptDir=${currentDir}`);
});
