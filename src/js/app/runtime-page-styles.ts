export type RuntimePageStyleKey = "archives" | "whisper";
export type RuntimePageStyleLoader = () => Promise<unknown>;
export type RuntimePageStyleLoaders = Record<RuntimePageStyleKey, RuntimePageStyleLoader>;

export const runtimePageStyleLoaders: Readonly<RuntimePageStyleLoaders> = {
  archives: async () => await import("../../styles/archives.css"),
  whisper: async () => await import("../../styles/whisper.css"),
};

export interface RuntimePageStyleRegistry {
  ensureStyles(styleKey: RuntimePageStyleKey): Promise<void>;
}

export function createRuntimePageStyleRegistry(
  loaders: Readonly<RuntimePageStyleLoaders>
): RuntimePageStyleRegistry {
  const runtimePageStyleRequests = new Map<RuntimePageStyleKey, Promise<void>>();

  return {
    async ensureStyles(styleKey: RuntimePageStyleKey): Promise<void> {
      const existingRequest = runtimePageStyleRequests.get(styleKey);
      if (existingRequest !== undefined) {
        await existingRequest;
        return;
      }

      const request = loaders[styleKey]()
        .then(() => undefined)
        .catch((error) => {
          runtimePageStyleRequests.delete(styleKey);
          throw error;
        });

      runtimePageStyleRequests.set(styleKey, request);
      await request;
    },
  };
}

const runtimePageStyleRegistry = createRuntimePageStyleRegistry(runtimePageStyleLoaders);

export async function ensureRuntimePageStyles(styleKey: RuntimePageStyleKey): Promise<void> {
  await runtimePageStyleRegistry.ensureStyles(styleKey);
}
