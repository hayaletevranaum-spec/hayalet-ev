declare module "node-abi" {
  export function getAbi(version: string, runtime: "node" | "electron"): string;
}
