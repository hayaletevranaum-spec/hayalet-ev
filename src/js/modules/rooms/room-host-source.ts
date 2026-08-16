import { decodeBase64 } from "../../constants/index.js";
import { toRoomRuntimeFileUrl } from "./room-runtime-url.js";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const IMPORT_FROM_PATTERN = /import\s+([\s\S]*?)\s+from\s+(["'])([^"']+)\2;/g;
const IMPORT_SIDE_EFFECT_PATTERN = /import\s+(["'])([^"']+)\1;/g;
const EXPORT_FROM_PATTERN = /export\s+(\*|\{[\s\S]*?\})\s+from\s+(["'])([^"']+)\2;/g;
const MODULE_EXPORTS_PATTERN = /(^|\n)(\s*)module\.exports\s*=\s*/m;

export function decodeRoomHostSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed === "") {
    return "";
  }

  const looksLikeBase64 = trimmed.length % 4 === 0 && BASE64_PATTERN.test(trimmed);
  if (looksLikeBase64 === false) {
    return source;
  }

  const decoded = decodeBase64(trimmed);
  return decoded.trim() !== "" ? decoded : source;
}

interface BuildRoomHostModuleUrlOptions {
  inlineDependencies?: boolean;
}

interface BuildRoomHostModuleResolvedUrlOptions extends BuildRoomHostModuleUrlOptions {
  createModuleUrl: (source: string, filePath: string) => string;
}

function encodeUtf8Base64(source: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(source, "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function normalizeFileUrlPath(fileUrl: string): string {
  const pathname = decodeURIComponent(new URL(fileUrl).pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

function normalizeRoomHostBoundaryPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function toHostFsPath(p: string): string {
  if (typeof process !== "undefined" && process.platform === "win32") {
    return p.replace(/\//g, "\\");
  }
  return p;
}

function resolveRoomHostRootPath(entryPath: string): string {
  const entryUrl = new URL(toRoomRuntimeFileUrl(entryPath));
  return normalizeFileUrlPath(new URL("../", new URL("./", entryUrl)).toString());
}

function assertRoomHostPathWithinRoot(
  filePath: string,
  roomRootPath: string,
  specifier: string
): string {
  const normalizedPath = normalizeRoomHostBoundaryPath(filePath);
  const normalizedRoot = normalizeRoomHostBoundaryPath(roomRootPath);
  const rootPrefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
  if (!normalizedPath.startsWith(rootPrefix)) {
    throw new Error(`Room host module import escaped room root: ${specifier}`);
  }
  return normalizedPath;
}

function resolveRoomHostModulePath(modulePath: string, specifier: string): string {
  const moduleUrl = toRoomRuntimeFileUrl(modulePath);
  return normalizeFileUrlPath(new URL(specifier, moduleUrl).toString());
}

function collectRoomHostModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();

  const collectMatches = function (pattern: RegExp, specifierIndex: number): void {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      const specifier = match[specifierIndex];
      if (typeof specifier === "string" && specifier.trim() !== "") {
        specifiers.add(specifier.trim());
      }
      match = pattern.exec(source);
    }
  };

  collectMatches(IMPORT_FROM_PATTERN, 3);
  collectMatches(IMPORT_SIDE_EFFECT_PATTERN, 2);
  collectMatches(EXPORT_FROM_PATTERN, 3);
  return Array.from(specifiers);
}

function rewriteRoomHostModuleSpecifiers(
  source: string,
  resolveSpecifier: (specifier: string) => string
): string {
  return source
    .replace(
      IMPORT_FROM_PATTERN,
      function (_match: string, clause: string, quote: string, specifier: string): string {
        return `import ${clause} from ${quote}${resolveSpecifier(specifier)}${quote};`;
      }
    )
    .replace(
      IMPORT_SIDE_EFFECT_PATTERN,
      function (_match: string, quote: string, specifier: string): string {
        return `import ${quote}${resolveSpecifier(specifier)}${quote};`;
      }
    )
    .replace(
      EXPORT_FROM_PATTERN,
      function (_match: string, clause: string, quote: string, specifier: string): string {
        return `export ${clause} from ${quote}${resolveSpecifier(specifier)}${quote};`;
      }
    );
}

function resolveRoomHostModuleReplacement(
  replacements: ReadonlyMap<string, string>,
  specifier: string
): string {
  const replacement = replacements.get(specifier);
  return replacement ?? specifier;
}

function toRoomHostModuleFileUrl(modulePath: string): string {
  return toRoomRuntimeFileUrl(modulePath);
}

function transformModuleExportsToEsm(source: string): string {
  if (!MODULE_EXPORTS_PATTERN.test(source)) {
    return source;
  }

  return (
    source.replace(MODULE_EXPORTS_PATTERN, "$1$2const __room_module_exports__ = ") +
    "\nexport default __room_module_exports__;\n"
  );
}

async function buildRoomHostResolvedModuleUrl(
  entryPath: string,
  readModuleSource: (filePath: string) => Promise<string>,
  options: BuildRoomHostModuleResolvedUrlOptions
): Promise<string> {
  const roomRootPath = resolveRoomHostRootPath(entryPath);
  const moduleUrlCache = new Map<string, Promise<string>>();
  const normalizedEntryPath = assertRoomHostPathWithinRoot(entryPath, roomRootPath, entryPath);
  const shouldInlineDependencies = options.inlineDependencies === true;

  const loadModule = async (filePath: string): Promise<string> => {
    const normalizedPath = assertRoomHostPathWithinRoot(filePath, roomRootPath, filePath);
    const cached = moduleUrlCache.get(normalizedPath);
    if (cached) {
      return await cached;
    }

    const pending = (async function (): Promise<string> {
      const source = await readModuleSource(toHostFsPath(normalizedPath));
      const specifiers = collectRoomHostModuleSpecifiers(source).filter(function (specifier) {
        return specifier.startsWith("./") || specifier.startsWith("../");
      });
      const replacements = new Map<string, string>();

      await Promise.all(
        specifiers.map(async (specifier): Promise<void> => {
          const dependencyPath = assertRoomHostPathWithinRoot(
            resolveRoomHostModulePath(normalizedPath, specifier),
            roomRootPath,
            specifier
          );
          const dependencyUrl = await loadModule(dependencyPath);
          replacements.set(specifier, dependencyUrl);
        })
      );

      const needsModuleExportsTransform = MODULE_EXPORTS_PATTERN.test(source);
      const needsSpecifierRewrite = normalizedPath === normalizedEntryPath;
      if (
        shouldInlineDependencies === false &&
        needsModuleExportsTransform === false &&
        needsSpecifierRewrite === false
      ) {
        return toRoomHostModuleFileUrl(normalizedPath);
      }

      const rewrittenSource = rewriteRoomHostModuleSpecifiers(source, function (specifier): string {
        return resolveRoomHostModuleReplacement(replacements, specifier);
      });
      const nextSource = needsModuleExportsTransform
        ? transformModuleExportsToEsm(rewrittenSource)
        : rewrittenSource;
      return options.createModuleUrl(nextSource, normalizedPath);
    })();

    moduleUrlCache.set(normalizedPath, pending);
    return await pending;
  };

  return await loadModule(normalizedEntryPath);
}

export async function buildRoomHostModuleDataUrl(
  entryPath: string,
  readModuleSource: (filePath: string) => Promise<string>,
  options: BuildRoomHostModuleUrlOptions = {}
): Promise<string> {
  return await buildRoomHostResolvedModuleUrl(entryPath, readModuleSource, {
    ...options,
    createModuleUrl: (source) => `data:text/javascript;base64,${encodeUtf8Base64(source)}`,
  });
}

export interface BuiltRoomHostModuleBlobUrl {
  dispose: () => void;
  moduleUrl: string;
}

export async function buildRoomHostModuleBlobUrl(
  entryPath: string,
  readModuleSource: (filePath: string) => Promise<string>
): Promise<BuiltRoomHostModuleBlobUrl> {
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error("Blob-backed room host module fallback is unavailable.");
  }

  const createdObjectUrls: string[] = [];
  const moduleUrl = await buildRoomHostResolvedModuleUrl(entryPath, readModuleSource, {
    inlineDependencies: true,
    createModuleUrl: (source, _filePath) => {
      const objectUrl = URL.createObjectURL(
        new Blob([source], {
          type: "text/javascript;charset=utf-8",
        })
      );
      createdObjectUrls.push(objectUrl);
      return objectUrl;
    },
  });

  return {
    dispose: (): void => {
      while (createdObjectUrls.length > 0) {
        const objectUrl = createdObjectUrls.pop();
        if (typeof objectUrl === "string") {
          URL.revokeObjectURL(objectUrl);
        }
      }
    },
    moduleUrl,
  };
}
