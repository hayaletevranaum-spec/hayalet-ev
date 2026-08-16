import type { RoomCommandSpec, RoomManifest, RoomProtocolSpec } from "./rooms.js";

export function flattenRoomCommandSpecs(manifest: RoomManifest): RoomCommandSpec[] {
  return [
    ...(manifest.commandSpecs ?? []),
    ...manifest.features.flatMap((feature) => feature.commandSpecs ?? []),
  ];
}

export function flattenRoomProtocolSpecs(manifest: RoomManifest): RoomProtocolSpec[] {
  return [
    ...(manifest.protocolSpecs ?? []),
    ...manifest.features.flatMap((feature) => feature.protocolSpecs ?? []),
  ];
}

export function resolveRoomProtocolFilePath(spec: RoomProtocolSpec): string | null {
  if (spec.path !== undefined) {
    return spec.path;
  }

  const normalizedKey = spec.key.trim();
  if (/^[A-Za-z0-9._-]+$/.test(normalizedKey) !== true) {
    return null;
  }

  return `protocols/${normalizedKey}.md`;
}

export function collectRoomManifestRequiredFilePaths(manifest: RoomManifest): string[] {
  const paths = new Set<string>();
  if (manifest.menu.iconSrc !== undefined) {
    paths.add(manifest.menu.iconSrc);
  }
  paths.add(manifest.runtime.uiEntry);
  paths.add(manifest.runtime.hostEntry);
  if (manifest.scene !== undefined) {
    paths.add(manifest.scene.roomBackgroundSrc);
  }
  manifest.features.forEach((feature) => {
    if (feature.scene === undefined) {
      return;
    }
    paths.add(feature.scene.view.backgroundSrc);
    if (feature.scene.view.panelArtSrc !== undefined) {
      paths.add(feature.scene.view.panelArtSrc);
    }
  });
  flattenRoomProtocolSpecs(manifest).forEach((spec) => {
    const protocolPath = resolveRoomProtocolFilePath(spec);
    if (protocolPath !== null) {
      paths.add(protocolPath);
    }
  });
  return Array.from(paths.values()).sort((left, right) => left.localeCompare(right));
}
