import { createRequire } from "node:module";
import { ensureBetterSqlite3Runtime } from "./better-sqlite3-runtime.js";

type BetterSqlite3BindParameters = unknown[] | Record<string, unknown>;

type BetterSqlite3StatementArgs<BindParameters extends BetterSqlite3BindParameters> =
  BindParameters extends unknown[] ? BindParameters : [BindParameters];

export interface BetterSqlite3RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface BetterSqlite3Statement<
  BindParameters extends BetterSqlite3BindParameters = unknown[],
  Result = unknown,
> {
  run(...params: BetterSqlite3StatementArgs<BindParameters>): BetterSqlite3RunResult;
  get(...params: BetterSqlite3StatementArgs<BindParameters>): Result | undefined;
  all(...params: BetterSqlite3StatementArgs<BindParameters>): Result[];
}

export interface BetterSqlite3Database {
  prepare<BindParameters extends BetterSqlite3BindParameters = unknown[], Result = unknown>(
    source: string
  ): BetterSqlite3Statement<BindParameters, Result>;
  exec(source: string): BetterSqlite3Database;
  close(): BetterSqlite3Database;
}

export interface BetterSqlite3Options {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: ((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined;
  nativeBinding?: string | undefined;
}

export interface BetterSqlite3Constructor {
  new (filename?: string | Buffer, options?: BetterSqlite3Options): BetterSqlite3Database;
  (filename?: string, options?: BetterSqlite3Options): BetterSqlite3Database;
  prototype: BetterSqlite3Database;
  SqliteError: ErrorConstructor;
}

const require = createRequire(import.meta.url);

ensureBetterSqlite3Runtime();

function isBetterSqlite3Constructor(value: unknown): value is BetterSqlite3Constructor {
  return typeof value === "function";
}

const loadedBetterSqlite3: unknown = require("better-sqlite3");
if (!isBetterSqlite3Constructor(loadedBetterSqlite3)) {
  throw new TypeError("better-sqlite3 runtime did not export a database constructor");
}

const betterSqlite3 = loadedBetterSqlite3;

export default betterSqlite3;
